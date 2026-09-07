import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  confirmClaim,
  createDemoData,
  createEmptyData,
  createManualAnalysis,
  draftArticle,
  editClaim,
  formatTime,
  parseTeamData,
  publishArticle,
  searchKnowledge,
  validateEvidence,
  validateTeamData,
} from '../src/domain';
import type { Evidence, Recording, TeamData } from '../src/domain';
import {
  clearLocalData,
  deleteMedia,
  exportBackup,
  getMedia,
  importBackup,
  loadData,
  loadSettings,
  mergeTeamData,
  putMedia,
  saveData,
  saveSettings,
} from '../src/lib/storage';

function recording(): Recording {
  const result: Recording = {
    id: 'recording_test',
    title: '金型の照合記録',
    category: '事前確認',
    author: 'テスト担当',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:00:00.000Z',
    duration: 90,
    mediaId: 'media_test',
    frames: [],
    notes: '図面番号の照合が未確認。',
    answers: [],
    status: 'interview',
    isDemo: false,
  };
  result.analysis = createManualAnalysis(result, [12]);
  result.answers = [
    {
      id: 'answer_test',
      questionId: result.analysis.questions[0].id,
      text: '図面番号を資料と照合してから次へ進みます。',
      author: 'テスト担当',
      createdAt: '2026-09-06T01:01:00.000Z',
      source: 'text',
    },
  ];
  return result;
}

function dataWith(record: Recording): TeamData {
  const data = createEmptyData();
  data.recordings.push(record);
  return data;
}

describe('manual capture and knowledge review', () => {
  it('uses only human-selected valid anchors and discloses that no video analysis occurred', () => {
    const result = createManualAnalysis(recording(), [40, -4, Number.NaN, 40, 1000]);
    expect(result.mode).toBe('manual');
    expect(result.segments.map((segment) => segment.start)).toEqual([0, 40, 90]);
    expect(result.questions).toHaveLength(9);
    expect(result.limitations.join('')).toContain('映像解析は行っていません');
    expect(
      result.segments.every((segment) => segment.observation.includes('自動判定していません')),
    ).toBe(true);
  });

  it('creates verbatim claims only from the latest answer per question, preserving previous answers', () => {
    const source = recording();
    source.answers.push({
      ...source.answers[0],
      id: 'answer_latest',
      text: '番号が読めなかったので、担当者へ確認しました。',
      createdAt: '2026-09-06T02:00:00.000Z',
    });
    const article = draftArticle(source);
    expect(article.claims).toHaveLength(1);
    expect(article.claims[0].body).toBe(source.answers[1].text);
    expect(article.claims[0].evidence).toEqual([
      expect.objectContaining({
        kind: 'answer',
        answerId: 'answer_latest',
        quote: source.answers[1].text,
      }),
    ]);
    expect(article.claims[0].evidence[0].time).toBeUndefined();
    expect(source.answers).toHaveLength(2);
    expect(article.claims[0].review).toBe('draft');
  });

  it('does not generate a claim without an expert answer', () => {
    const source = recording();
    source.answers = [];
    expect(() => draftArticle(source)).toThrow('回答');
  });

  it('requires review before publication and resets review after editing, retaining original revisions', () => {
    const source = recording();
    const draft = draftArticle(source);
    expect(() => publishArticle(draft, '確認者', [source])).toThrow('すべての項目');
    const reviewed = confirmClaim(draft, draft.claims[0].id, '確認者', [source]);
    const published = publishArticle(reviewed, '確認者', [source]);
    expect(published.status).toBe('published');
    expect(draft.status).toBe('draft');
    expect(draft.claims[0].review).toBe('draft');
    const updated = editClaim(
      published,
      published.claims[0].id,
      { body: '責任者へ確認してから次へ進みます。' },
      '編集者',
    );
    expect(updated.status).toBe('draft');
    expect(updated.claims[0].review).toBe('draft');
    expect(updated.claims[0].reviewedBy).toBeUndefined();
    expect(updated.revisions.at(-1)?.claims[0].body).toBe(source.answers[0].text);
    expect(updated.revisions.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(published.claims[0].body).toBe(source.answers[0].text);
    expect(() => publishArticle(updated, '確認者', [source])).toThrow('すべての項目');
    expect(
      editClaim(published, published.claims[0].id, { body: published.claims[0].body }, '編集者')
        .status,
    ).toBe('published');
  });

  it('rejects fabricated answer quotes, missing sources and out-of-range video times', () => {
    const source = recording();
    const reference: Evidence = {
      id: 'ev',
      kind: 'answer',
      recordingId: source.id,
      answerId: source.answers[0].id,
      quote: '測定値は適正です。',
    };
    expect(validateEvidence(reference, [source])).toContain('引用文が回答の原文と一致しません。');
    expect(validateEvidence({ ...reference, recordingId: 'missing' }, [source])).toContain(
      '根拠の収録が見つかりません。',
    );
    expect(validateEvidence({ ...reference, quote: source.answers[0].text }, [source])).toEqual([]);
    source.analysis!.mode = 'ai';
    source.analysis!.segments[0].observation = '図面番号を指している。';
    const video: Evidence = {
      id: 'video_ev',
      kind: 'video',
      recordingId: source.id,
      quote: '図面番号を指している。',
      time: 12,
    };
    expect(validateEvidence(video, [source])).toEqual([]);
    expect(validateEvidence({ ...video, time: 95 }, [source])).toContain(
      '根拠の時刻が収録の範囲外です。',
    );
    expect(validateEvidence({ ...video, time: 2 }, [source]).length).toBeGreaterThan(0);
    source.mediaId = undefined;
    expect(validateEvidence(video, [source])).toContain('動画の参照がありません。');
  });

  it('never upgrades a manual placeholder into observed video evidence', () => {
    const source = recording();
    const reference: Evidence = {
      id: 'video_ev',
      kind: 'video',
      recordingId: source.id,
      quote: source.analysis!.segments[0].observation,
      time: 12,
    };
    expect(validateEvidence(reference, [source])).toContain(
      'その時刻の映像観察記録に一致する引用がありません。',
    );
  });

  it('accepts only source-matching notes and prevents confirming unsourced claims', () => {
    const source = recording();
    expect(
      validateEvidence(
        { id: 'note', kind: 'note', recordingId: source.id, quote: '図面番号の照合' },
        [source],
      ),
    ).toEqual([]);
    expect(
      validateEvidence(
        { id: 'note', kind: 'note', recordingId: source.id, quote: '安全性を確認した' },
        [source],
      ).length,
    ).toBeGreaterThan(0);
    const draft = draftArticle(source);
    draft.claims[0].evidence = [];
    expect(() => confirmClaim(draft, draft.claims[0].id, '確認者', [source])).toThrow('根拠');
  });

  it('formats invalid and long durations without NaN or negative labels', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(126)).toBe('2:06');
    expect(formatTime(3605)).toBe('60:05');
  });
});

describe('Japanese search and demonstration boundaries', () => {
  it('finds Japanese natural-language terms and returns no result for absent or empty queries', () => {
    const data = createDemoData();
    expect(searchKnowledge(data, '繊維方向').length).toBeGreaterThan(0);
    expect(searchKnowledge(data, 'しわを見つけたらどうする').length).toBeGreaterThan(0);
    expect(searchKnowledge(data, '量子コンピュータの冷却装置')).toEqual([]);
    expect(searchKnowledge(data, 'どうすれば')).toEqual([]);
    expect(searchKnowledge(data, '  ')).toEqual([]);
  });

  it('excludes hidden demo records, unpublished records and stale evidence', () => {
    const data = createDemoData();
    expect(searchKnowledge(data, '繊維方向', { includeDemo: false })).toEqual([]);
    data.articles.forEach((article) => {
      article.status = 'draft';
    });
    expect(searchKnowledge(data, '繊維方向')).toEqual([]);
    const fresh = createDemoData();
    fresh.recordings[0].answers = [];
    expect(searchKnowledge(fresh, '繊維方向')).toEqual([]);
  });

  it('makes all demo content explicit without suggesting that an illustration is video evidence', () => {
    const data = createDemoData();
    expect(validateTeamData(data)).toEqual([]);
    expect(
      data.recordings.every(
        (item) => item.isDemo && !item.mediaId && !item.remoteMediaId && !item.frames.length,
      ),
    ).toBe(true);
    expect(data.recordings.every((item) => item.notes.includes('架空'))).toBe(true);
    expect(
      data.articles
        .flatMap((item) => item.claims)
        .flatMap((item) => item.evidence)
        .every((item) => item.kind === 'answer'),
    ).toBe(true);
  });
});

describe('portable backup and validation', () => {
  it('exports readable knowledge but no video bytes, frames, credentials or settings', () => {
    const source = recording();
    source.frames = [{ id: 'frame_1', time: 12, dataUrl: 'data:image/jpeg;base64,YWJj' }];
    const data = dataWith(source);
    data.articles.push(draftArticle(source));
    const json = exportBackup(data);
    const envelope = JSON.parse(json);
    expect(envelope.mediaIncluded).toBe(false);
    expect(envelope.notice).toContain('動画本体');
    expect(envelope.data.recordings[0].frames).toEqual([]);
    expect(envelope.data.recordings[0].mediaId).toBe(source.mediaId);
    expect(envelope.settings).toBeUndefined();
    expect(envelope.token).toBeUndefined();
    expect(importBackup(json).articles[0].claims[0].body).toBe(source.answers[0].text);
    expect(data.recordings[0].frames).toHaveLength(1);
  });

  it('merges new records and preserves local frames without replacing conflicting records', () => {
    const source = recording();
    source.frames = [{ id: 'frame_1', time: 12, dataUrl: 'data:image/jpeg;base64,YWJj' }];
    const data = dataWith(source);
    expect(importBackup(exportBackup(data), data).recordings[0].frames).toHaveLength(1);
    const extra = dataWith({ ...recording(), id: 'recording_2' });
    expect(mergeTeamData(data, extra).recordings).toHaveLength(2);
    const conflict = structuredClone(data);
    conflict.recordings[0].title = '別の内容';
    expect(() => mergeTeamData(data, conflict)).toThrow('既存データを守る');
    expect(data.recordings[0].title).toBe('金型の照合記録');
    expect(data.recordings).toHaveLength(1);
  });

  it('rejects corrupt JSON, unsupported schemas, duplicated IDs and broken citations before import', () => {
    expect(() => importBackup('{broken')).toThrow('JSON');
    const data = createDemoData();
    const envelope = JSON.parse(exportBackup(data));
    envelope.version = 2;
    expect(() => importBackup(JSON.stringify(envelope))).toThrow('バージョン');
    expect(() => parseTeamData({ ...data, schemaVersion: 2 })).toThrow('未対応');
    const duplicate = structuredClone(data);
    duplicate.recordings.push(duplicate.recordings[0]);
    expect(validateTeamData(duplicate)).toContain('収録: IDが重複しています。');
    const broken = structuredClone(data);
    broken.articles[0].claims[0].evidence[0].answerId = 'missing_answer';
    expect(validateTeamData(broken)).toContain('根拠の回答が見つかりません。');
    const unreviewed = structuredClone(data);
    unreviewed.articles[0].claims[0].review = 'draft';
    expect(validateTeamData(unreviewed)).toContain('未確認の項目を公開できません。');
    const disguised = structuredClone(data);
    disguised.articles[0].isDemo = false;
    expect(validateTeamData(disguised)).toContain('デモと実際の記録の区別が一致しません。');
  });
});

describe('device-local IndexedDB persistence', () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it('stores and reloads data and preferences without losing records on invalid saves', async () => {
    expect(await loadData()).toBeNull();
    const data = dataWith(recording());
    await saveData(data);
    expect(await loadData()).toEqual(data);
    await expect(saveData({ ...data, schemaVersion: 2 } as unknown as TeamData)).rejects.toThrow();
    expect(await loadData()).toEqual(data);
    await saveSettings({
      displayName: '先輩',
      apiBaseUrl: '',
      demoVisible: false,
      onboardingDone: true,
      aiConsent: false,
    });
    expect((await loadSettings()).displayName).toBe('先輩');
    expect((await loadSettings()).demoVisible).toBe(false);
  });

  it('persists video blobs by ID and deletes them explicitly without touching knowledge', async () => {
    const data = dataWith(recording());
    await saveData(data);
    const blob = new Blob(['video fixture bytes'], { type: 'video/mp4' });
    const id = await putMedia(blob);
    const saved = await getMedia(id);
    expect(await saved?.text()).toBe('video fixture bytes');
    expect(saved?.type).toBe('video/mp4');
    await deleteMedia(id);
    expect(await getMedia(id)).toBeUndefined();
    expect(await loadData()).toEqual(data);
    await expect(putMedia(new Blob([], { type: 'video/mp4' }))).rejects.toThrow('空');
    await expect(putMedia(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow('動画形式');
  });

  it('rejects accidental overwrites of media with an existing ID', async () => {
    const original = new Blob(['first'], { type: 'video/mp4' });
    await putMedia(original, 'duplicate_media');
    await expect(
      putMedia(new Blob(['second'], { type: 'video/mp4' }), 'duplicate_media'),
    ).rejects.toThrow('すでに保存');
    expect(await (await getMedia('duplicate_media'))?.text()).toBe('first');
  });
});
