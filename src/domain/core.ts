import type {
  Analysis,
  Article,
  Claim,
  Evidence,
  Recording,
  SearchResult,
  TeamData,
} from './types';

export function makeId(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(date);
}

/** The anchors are selected by a person. This does not inspect video or infer observations. */
export function createManualAnalysis(recording: Recording, anchors: number[] = [0]): Analysis {
  const duration = Math.max(0, Number.isFinite(recording.duration) ? recording.duration : 0);
  const times = [
    ...new Set(
      anchors.filter(Number.isFinite).map((time) => Math.min(duration, Math.max(0, time))),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, 8);
  if (!times.length) times.push(0);
  const segments = times.map((start, index) => ({
    id: makeId('segment'),
    start,
    end: times[index + 1] ?? duration,
    title: `振り返り ${index + 1}`,
    observation: '本人が振り返るために選んだ位置です。映像の内容は自動判定していません。',
  }));
  return {
    mode: 'manual',
    summary: '選んだ場面について、経験者の言葉を残します。回答の原文から下書きを作成します。',
    segments,
    questions: segments.flatMap((segment) => [
      {
        id: makeId('question'),
        segmentId: segment.id,
        kind: 'step' as const,
        text: 'この場面では、何をどの順番で行っていますか？',
        reason: '作業の順序を本人の言葉で記録します。',
      },
      {
        id: makeId('question'),
        segmentId: segment.id,
        kind: 'judgment' as const,
        text: '次へ進めると判断した手がかりは何ですか？',
        reason: '見た目・感触・測定値など、判断に使った手がかりを確認します。',
      },
      {
        id: makeId('question'),
        segmentId: segment.id,
        kind: 'warning' as const,
        text: '後輩が迷いやすい点と、作業を止めて確認すべきことは何ですか？',
        reason: '適用条件や未確認事項を残し、推測で補わないための質問です。',
      },
    ]),
    limitations: [
      '手動の振り返りです。AIによる映像解析は行っていません。',
      '記録だけで作業の安全性や品質を保証できません。現場の手順と責任者の確認が必要です。',
    ],
  };
}

export function validateEvidence(evidence: Evidence, recordings: Recording[]): string[] {
  const errors: string[] = [];
  const recording = recordings.find((item) => item.id === evidence.recordingId);
  if (!recording) return ['根拠の収録が見つかりません。'];
  if (!evidence.quote?.trim()) errors.push('根拠の引用文がありません。');
  if (
    evidence.time !== undefined &&
    (!Number.isFinite(evidence.time) || evidence.time < 0 || evidence.time > recording.duration)
  ) {
    errors.push('根拠の時刻が収録の範囲外です。');
  }
  if (evidence.kind === 'answer') {
    const answer = recording.answers.find((item) => item.id === evidence.answerId);
    if (!answer) errors.push('根拠の回答が見つかりません。');
    else if (!answer.text.includes(evidence.quote))
      errors.push('引用文が回答の原文と一致しません。');
  } else if (evidence.kind === 'note') {
    if (!recording.notes.includes(evidence.quote))
      errors.push('引用文が収録メモの原文と一致しません。');
  } else if (evidence.kind === 'video') {
    if (!recording.mediaId && !recording.remoteMediaId) errors.push('動画の参照がありません。');
    if (evidence.time === undefined) errors.push('動画の根拠には時刻が必要です。');
    const time = evidence.time;
    const segment = recording.analysis?.segments.find(
      (item) =>
        time !== undefined &&
        time >= item.start &&
        time <= item.end &&
        item.observation.includes(evidence.quote),
    );
    if (!segment || recording.analysis?.mode === 'manual')
      errors.push('その時刻の映像観察記録に一致する引用がありません。');
  } else {
    errors.push('根拠の種類が不正です。');
  }
  return errors;
}

export function draftArticle(recording: Recording): Article {
  const latestByQuestion = new Map<string, Recording['answers'][number]>();
  for (const answer of recording.answers) {
    const previous = latestByQuestion.get(answer.questionId);
    if (!previous || Date.parse(answer.createdAt) >= Date.parse(previous.createdAt))
      latestByQuestion.set(answer.questionId, answer);
  }
  const answers = [...latestByQuestion.values()].filter((answer) => answer.text.trim());
  if (!answers.length)
    throw new Error('下書きを作るには、まず経験者の回答を1件以上残してください。');
  const now = new Date().toISOString();
  const claims: Claim[] = answers.map((answer, index) => {
    const question = recording.analysis?.questions.find((item) => item.id === answer.questionId);
    return {
      id: makeId('claim'),
      kind: question?.kind ?? 'judgment',
      title: question?.text ?? `経験者の回答 ${index + 1}`,
      body: answer.text,
      evidence: [
        {
          id: makeId('evidence'),
          kind: 'answer',
          recordingId: recording.id,
          answerId: answer.id,
          quote: answer.text,
        },
      ],
      review: 'draft',
    };
  });
  return {
    id: makeId('article'),
    recordingId: recording.id,
    title: recording.title,
    category: recording.category,
    summary: `${recording.author || '経験者'}の回答${answers.length}件を原文でまとめた記録です。内容の確認を経て公開します。`,
    tags: recording.category ? [recording.category] : [],
    claims,
    author: recording.author,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    isDemo: recording.isDemo,
    revisions: [],
    bookmarked: false,
  };
}

function withRevision(article: Article, author: string, reason: string): Article {
  const copy = structuredClone(article);
  const now = new Date().toISOString();
  copy.revisions.push({
    id: makeId('revision'),
    number: (copy.revisions.at(-1)?.number ?? 0) + 1,
    createdAt: now,
    author: author.trim(),
    title: article.title,
    summary: article.summary,
    claims: structuredClone(article.claims),
    reason,
  });
  copy.updatedAt = now;
  return copy;
}

export function editClaim(
  article: Article,
  claimId: string,
  patch: Partial<Pick<Claim, 'title' | 'body' | 'kind' | 'evidence'>>,
  author: string,
): Article {
  const claim = article.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error('編集する項目が見つかりません。');
  if (patch.title !== undefined && !patch.title.trim())
    throw new Error('項目の見出しを入力してください。');
  if (patch.body !== undefined && !patch.body.trim())
    throw new Error('項目の本文を入力してください。');
  const updated = { ...claim, ...structuredClone(patch) };
  if (JSON.stringify(claim) === JSON.stringify(updated)) return structuredClone(article);
  const next = withRevision(article, author, '内容を編集。変更した項目は再確認が必要です。');
  next.claims = next.claims.map((item) =>
    item.id === claimId
      ? {
          ...updated,
          review: 'draft',
          reviewedBy: undefined,
          reviewedAt: undefined,
        }
      : item,
  );
  next.status = 'draft';
  return next;
}

export function confirmClaim(
  article: Article,
  claimId: string,
  reviewer: string,
  recordings: Recording[],
): Article {
  if (!reviewer.trim()) throw new Error('確認者の名前を入力してください。');
  const claim = article.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error('確認する項目が見つかりません。');
  if (!claim.title.trim() || !claim.body.trim()) throw new Error('見出しと本文が必要です。');
  if (!claim.evidence.length) throw new Error('確認には回答・映像・メモの根拠が必要です。');
  const errors = claim.evidence.flatMap((item) => validateEvidence(item, recordings));
  if (errors.length) throw new Error(errors.join('\n'));
  if (claim.review === 'confirmed') return structuredClone(article);
  const next = withRevision(article, reviewer, '根拠と内容を確認。');
  next.claims = next.claims.map((item) =>
    item.id === claimId
      ? {
          ...item,
          review: 'confirmed',
          reviewedBy: reviewer.trim(),
          reviewedAt: next.updatedAt,
        }
      : item,
  );
  return next;
}

export function publishArticle(
  article: Article,
  reviewer: string,
  recordings: Recording[],
): Article {
  if (!reviewer.trim()) throw new Error('公開する人の名前を入力してください。');
  if (!article.title.trim() || !article.claims.length)
    throw new Error('公開する見出しと項目が必要です。');
  if (!recordings.some((recording) => recording.id === article.recordingId))
    throw new Error('元の収録が見つかりません。');
  if (
    article.claims.some(
      (claim) => claim.review !== 'confirmed' || !claim.reviewedBy?.trim() || !claim.reviewedAt,
    )
  ) {
    throw new Error('すべての項目を確認してから公開してください。');
  }
  for (const claim of article.claims) {
    if (!claim.title.trim() || !claim.body.trim() || !claim.evidence.length)
      throw new Error('空の項目や根拠のない項目は公開できません。');
    const errors = claim.evidence.flatMap((evidence) => validateEvidence(evidence, recordings));
    if (errors.length) throw new Error(errors.join('\n'));
  }
  if (article.status === 'published') return structuredClone(article);
  const next = withRevision(article, reviewer, '全項目の確認を終え、知識庫へ公開。');
  next.status = 'published';
  return next;
}

const stopWords = new Set([
  'の',
  'に',
  'は',
  'を',
  'が',
  'と',
  'で',
  'へ',
  'も',
  'な',
  'だ',
  'です',
  'ます',
  'した',
  'して',
  'する',
  'いる',
  'ある',
  'ない',
  'ため',
  'こと',
  'もの',
  'について',
  'どう',
  'どうする',
  'どうすれば',
  'ください',
  '教え',
  '教えて',
  '教える',
  '何',
  'どの',
  'どこ',
  'いつ',
  'それ',
  'これ',
  'なる',
  'から',
  'まで',
  'なら',
  'れば',
  'たら',
  'か',
  'ね',
  'よう',
  '知り',
  'たい',
]);
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja-JP');
function tokens(text: string): string[] {
  const normalized = normalize(text);
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  return [
    ...new Set(
      [...segmenter.segment(normalized)]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment)
        .filter(
          (part) => !stopWords.has(part) && (part.length >= 2 || /\p{Script=Han}/u.test(part)),
        ),
    ),
  ];
}

/** Lexical search over reviewed, source-backed claims only. Never synthesizes an answer. */
export function searchKnowledge(
  data: TeamData,
  query: string,
  options: { includeDemo?: boolean; limit?: number } = {},
): SearchResult[] {
  const terms = tokens(query.trim());
  if (!terms.length) return [];
  const results: SearchResult[] = [];
  for (const article of data.articles) {
    if (article.status !== 'published' || (article.isDemo && options.includeDemo === false))
      continue;
    for (const claim of article.claims) {
      if (
        claim.review !== 'confirmed' ||
        !claim.reviewedBy ||
        !claim.reviewedAt ||
        !claim.evidence.length
      )
        continue;
      if (claim.evidence.some((evidence) => validateEvidence(evidence, data.recordings).length))
        continue;
      const heading = normalize(
        `${article.title} ${article.category} ${article.tags.join(' ')} ${claim.title}`,
      );
      const body = normalize(claim.body);
      const matched = terms.filter((term) => heading.includes(term) || body.includes(term));
      // A broad match must cover at least half of the meaningful query words.
      if (!matched.length || matched.length < Math.ceil(terms.length / 2)) continue;
      const score = matched.reduce(
        (sum, term) => sum + (heading.includes(term) ? 3 : 0) + (body.includes(term) ? 2 : 0),
        0,
      );
      results.push({
        articleId: article.id,
        claimId: claim.id,
        title: claim.title,
        body: claim.body,
        category: article.category,
        evidence: structuredClone(claim.evidence),
        score,
        isDemo: article.isDemo,
      });
    }
  }
  return results
    .sort((a, b) => b.score - a.score || a.articleId.localeCompare(b.articleId))
    .slice(0, options.limit ?? 20);
}
