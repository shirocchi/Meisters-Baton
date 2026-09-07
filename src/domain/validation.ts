import type { TeamData } from './types';
import { validateEvidence } from './core';

type Rule = (value: unknown, path: string, errors: string[]) => void;
const text =
  (max = 20000, nonempty = false): Rule =>
  (value, path, errors) => {
    if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()))
      errors.push(`${path}: 文字列の形式・長さが不正です。`);
  };
const id = text(200, true);
const bool: Rule = (value, path, errors) => {
  if (typeof value !== 'boolean') errors.push(`${path}: 真偽値が必要です。`);
};
const number =
  (min = 0, max = 86400, integer = false): Rule =>
  (value, path, errors) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      errors.push(`${path}: 数値が範囲外です。`);
  };
const date: Rule = (value, path, errors) => {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    errors.push(`${path}: 日時が不正です。`);
};
const oneOf =
  (...values: unknown[]): Rule =>
  (value, path, errors) => {
    if (!values.includes(value)) errors.push(`${path}: 未対応の値です。`);
  };
const optional =
  (rule: Rule): Rule =>
  (value, path, errors) => {
    if (value !== undefined) rule(value, path, errors);
  };
const array =
  (rule: Rule, max = 10000): Rule =>
  (value, path, errors) => {
    if (!Array.isArray(value) || value.length > max) {
      errors.push(`${path}: 配列の形式・件数が不正です。`);
      return;
    }
    value.forEach((entry, index) => {
      if (errors.length < 30) rule(entry, `${path}[${index}]`, errors);
    });
  };
const object =
  (fields: Record<string, Rule>): Rule =>
  (value, path, errors) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path}: オブジェクトが必要です。`);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, rule] of Object.entries(fields)) {
      if (errors.length < 30) rule(record[key], `${path}.${key}`, errors);
    }
  };
const evidence = object({
  id,
  kind: oneOf('video', 'answer', 'note'),
  recordingId: id,
  time: optional(number()),
  answerId: optional(id),
  quote: text(20000, true),
});
const claim = object({
  id,
  kind: oneOf('step', 'judgment', 'warning'),
  title: text(500, true),
  body: text(20000, true),
  evidence: array(evidence, 100),
  review: oneOf('draft', 'confirmed'),
  reviewedBy: optional(text(200, true)),
  reviewedAt: optional(date),
});
const analysis = object({
  mode: oneOf('ai', 'manual', 'demo'),
  summary: text(),
  limitations: array(text(2000), 100),
  segments: array(
    object({ id, start: number(), end: number(), title: text(500, true), observation: text() }),
    1000,
  ),
  questions: array(
    object({
      id,
      segmentId: id,
      text: text(2000, true),
      reason: text(2000),
      kind: oneOf('step', 'judgment', 'warning'),
    }),
    1000,
  ),
});
const teamRule = object({
  schemaVersion: oneOf(1),
  workspace: object({ id, name: text(200, true) }),
  recordings: array(
    object({
      id,
      title: text(500, true),
      category: text(200),
      author: text(200),
      createdAt: date,
      updatedAt: date,
      duration: number(),
      mediaId: optional(id),
      remoteMediaId: optional(id),
      fileName: optional(text(1000)),
      mimeType: optional(text(200)),
      frames: array(object({ id, time: number(), dataUrl: text(6000000, true) }), 48),
      notes: text(),
      analysis: optional(analysis),
      answers: array(
        object({
          id,
          questionId: id,
          text: text(),
          author: text(200),
          createdAt: date,
          source: oneOf('text', 'voice'),
        }),
        1000,
      ),
      status: oneOf('recorded', 'interview', 'draft', 'published'),
      isDemo: bool,
    }),
    10000,
  ),
  articles: array(
    object({
      id,
      recordingId: id,
      title: text(500, true),
      category: text(200),
      summary: text(),
      tags: array(text(100, true), 100),
      claims: array(claim, 1000),
      author: text(200),
      createdAt: date,
      updatedAt: date,
      status: oneOf('draft', 'published'),
      isDemo: bool,
      bookmarked: bool,
      revisions: array(
        object({
          id,
          number: number(1, Number.MAX_SAFE_INTEGER, true),
          createdAt: date,
          author: text(200),
          title: text(500, true),
          summary: text(),
          claims: array(claim, 1000),
          reason: text(2000),
        }),
        1000,
      ),
    }),
    10000,
  ),
  requests: array(
    object({
      id,
      text: text(2000, true),
      category: text(200),
      createdAt: date,
      status: oneOf('open', 'resolved'),
      articleId: optional(id),
    }),
    10000,
  ),
  activity: array(
    object({
      id,
      type: oneOf('record', 'answer', 'publish', 'review', 'request'),
      title: text(1000, true),
      createdAt: date,
      targetId: optional(id),
    }),
    50000,
  ),
});

/** Validate both JSON shape and references before persistent state can be replaced. */
export function validateTeamData(input: unknown): string[] {
  const errors: string[] = [];
  teamRule(input, 'data', errors);
  if (errors.length) return errors;
  const data = input as TeamData;
  function unique(entries: { id: string }[], label: string) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      errors.push(`${label}: IDが重複しています。`);
  }
  unique(data.recordings, '収録');
  unique(data.articles, '記事');
  unique(data.requests, 'リクエスト');
  unique(data.activity, '活動');
  for (const recording of data.recordings) {
    unique(recording.frames, 'フレーム');
    unique(recording.answers, '回答');
    if (recording.analysis) {
      unique(recording.analysis.segments, '区間');
      unique(recording.analysis.questions, '質問');
      if (recording.analysis.mode === 'demo' && !recording.isDemo)
        errors.push('デモ解析を実際の収録として保存できません。');
      for (const segment of recording.analysis.segments) {
        if (segment.start > segment.end || segment.end > recording.duration)
          errors.push('解析区間が収録の長さと一致しません。');
      }
      const segmentIds = new Set(recording.analysis.segments.map((segment) => segment.id));
      if (recording.analysis.questions.some((question) => !segmentIds.has(question.segmentId)))
        errors.push('質問が参照する区間が見つかりません。');
    }
    const questionIds = new Set(recording.analysis?.questions.map((question) => question.id));
    if (recording.answers.some((answer) => !questionIds.has(answer.questionId)))
      errors.push('回答が参照する質問が見つかりません。');
    for (const frame of recording.frames) {
      if (
        frame.time > recording.duration ||
        !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(frame.dataUrl)
      )
        errors.push('フレームの時刻または画像形式が不正です。');
    }
  }
  for (const article of data.articles) {
    unique(article.claims, '記事の項目');
    unique(article.revisions, '改訂');
    const source = data.recordings.find((recording) => recording.id === article.recordingId);
    if (!source) errors.push('記事の元の収録が見つかりません。');
    else if (source.isDemo !== article.isDemo)
      errors.push('デモと実際の記録の区別が一致しません。');
    let lastRevision = 0;
    for (const revision of article.revisions) {
      if (revision.number <= lastRevision) errors.push('改訂番号は昇順である必要があります。');
      lastRevision = revision.number;
      unique(revision.claims, '改訂の項目');
    }
    if (article.status === 'published' && !article.claims.length)
      errors.push('項目のない記事は公開できません。');
    for (const item of article.claims) {
      unique(item.evidence, '根拠');
      if (
        item.review === 'confirmed' &&
        (!item.reviewedBy?.trim() || !item.reviewedAt || !item.evidence.length)
      )
        errors.push('確認済み項目には確認者・確認日時・根拠が必要です。');
      if (article.status === 'published' && item.review !== 'confirmed')
        errors.push('未確認の項目を公開できません。');
      for (const reference of item.evidence) {
        errors.push(...validateEvidence(reference, data.recordings));
        const evidenceRecording = data.recordings.find(
          (recording) => recording.id === reference.recordingId,
        );
        if (evidenceRecording && evidenceRecording.isDemo !== article.isDemo)
          errors.push('デモと実際の記録の根拠を混在できません。');
      }
    }
  }
  for (const request of data.requests) {
    if (request.articleId && !data.articles.some((article) => article.id === request.articleId))
      errors.push('リクエストに紐づく記事が見つかりません。');
  }
  return [...new Set(errors)].slice(0, 30);
}

export function parseTeamData(input: unknown): TeamData {
  const errors = validateTeamData(input);
  if (errors.length) throw new Error(`データを読み込めません。\n${errors.join('\n')}`);
  return structuredClone(input as TeamData);
}
