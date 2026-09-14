import { z } from 'zod';
import type { TeamData, Recording, Claim } from '../src/domain/types.js';
import { interviewIssue } from '../src/domain/interview.js';

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\w.:-]+$/);
const short = z.string().trim().min(1).max(300);
const date = z.string().datetime({ offset: true });
const text = z.string().max(20_000);
const kind = z.enum(['step', 'judgment', 'warning']);
const segment = z
  .object({
    id,
    start: z.number().finite().min(0),
    end: z.number().finite().min(0),
    title: short,
    observation: text,
  })
  .strict();
const question = z
  .object({
    id,
    segmentId: id,
    text: short,
    reason: z.string().max(2000),
    kind,
    followUpOf: id.optional(),
    basedOnAnswerId: id.optional(),
    answerQuote: text.optional(),
    skipped: z.enum(['unknown', 'not_applicable']).optional(),
    review: z
      .object({
        answerId: id,
        outcome: z.enum(['followup', 'enough', 'unknown', 'not_applicable']),
        message: z.string().max(2000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const analysisSchema = z
  .object({
    mode: z.enum(['ai', 'manual', 'demo']),
    summary: text,
    segments: z.array(segment).max(40),
    questions: z.array(question).max(40),
    limitations: z.array(z.string().max(2000)).max(20),
  })
  .strict();
export const recordingSchema = z
  .object({
    id,
    title: short,
    category: short,
    author: short,
    createdAt: date,
    updatedAt: date,
    duration: z
      .number()
      .finite()
      .min(0)
      .max(4 * 60 * 60),
    mediaId: id.optional(),
    remoteMediaId: id.optional(),
    fileName: z.string().max(300).optional(),
    mimeType: z.string().max(100).optional(),
    frames: z
      .array(
        z
          .object({
            id,
            time: z.number().finite().min(0),
            dataUrl: z
              .string()
              .max(700_000)
              .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      )
      .max(12),
    notes: text,
    analysis: analysisSchema.optional(),
    answers: z
      .array(
        z
          .object({
            id,
            questionId: id,
            text,
            author: short,
            createdAt: date,
            source: z.enum(['text', 'voice']),
          })
          .strict(),
      )
      .max(100),
    status: z.enum(['recorded', 'interview', 'draft', 'published']),
    isDemo: z.boolean(),
  })
  .strict();
export const evidenceSchema = z
  .object({
    id,
    kind: z.enum(['video', 'answer', 'note']),
    recordingId: id,
    time: z.number().finite().min(0).optional(),
    answerId: id.optional(),
    quote: z.string().trim().min(1).max(20_000),
  })
  .strict();
export const claimSchema = z
  .object({
    id,
    kind,
    title: short,
    body: text,
    evidence: z.array(evidenceSchema).min(1).max(20),
    review: z.enum(['draft', 'confirmed']),
    reviewedBy: short.optional(),
    reviewedAt: date.optional(),
  })
  .strict();
export const articleSchema = z
  .object({
    id,
    recordingId: id,
    title: short,
    category: short,
    summary: text,
    tags: z.array(z.string().max(60)).max(20),
    claims: z.array(claimSchema).max(80),
    author: short,
    createdAt: date,
    updatedAt: date,
    status: z.enum(['draft', 'published']),
    isDemo: z.boolean(),
    revisions: z
      .array(
        z
          .object({
            id,
            number: z.number().int().min(1),
            createdAt: date,
            author: short,
            title: short,
            summary: text,
            claims: z.array(claimSchema).max(80),
            reason: z.string().max(2000),
          })
          .strict(),
      )
      .max(100),
    bookmarked: z.boolean(),
  })
  .strict();
export const teamDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspace: z.object({ id, name: short }).strict(),
    recordings: z.array(recordingSchema).max(500),
    articles: z.array(articleSchema).max(500),
    requests: z
      .array(
        z
          .object({
            id,
            text: z.string().trim().min(1).max(2000),
            category: short,
            createdAt: date,
            status: z.enum(['open', 'resolved']),
            articleId: id.optional(),
          })
          .strict(),
      )
      .max(1000),
    activity: z
      .array(
        z
          .object({
            id,
            type: z.enum(['record', 'answer', 'publish', 'review', 'request']),
            title: short,
            createdAt: date,
            targetId: id.optional(),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(10).max(128),
    name: short,
    teamName: short,
  })
  .strict();
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const syncSchema = z
  .object({ version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), data: teamDataSchema })
  .strict();

export function uniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((v) => v.id)).size === items.length;
}
export function recordingIssue(r: Recording): string | undefined {
  const interviewError = interviewIssue(r);
  if (interviewError) return interviewError;
  if (!uniqueIds(r.frames) || !uniqueIds(r.answers)) return '記録内のIDが重複しています。';
  if (r.frames.some((f) => f.time > r.duration)) return '画像の時刻が動画の長さを超えています。';
  if (r.analysis) {
    const a = r.analysis;
    if (!uniqueIds(a.segments) || !uniqueIds(a.questions)) return '分析内のIDが重複しています。';
    if (a.segments.some((s) => s.start > s.end || s.end > r.duration))
      return '分析区間が動画の範囲外です。';
    if (a.questions.some((q) => !a.segments.some((s) => s.id === q.segmentId)))
      return '質問の観察区間が見つかりません。';
    if (r.answers.some((answer) => !a.questions.some((q) => q.id === answer.questionId)))
      return '回答に対応する質問がありません。';
  } else if (r.answers.length) return '回答に対応する分析・質問がありません。';
  return undefined;
}

/** Validate provenance using only supplied primary evidence, never the generated prose itself. */
export function claimEvidenceIssue(claim: Claim, recording: Recording): string | undefined {
  if (!claim.evidence.length || !uniqueIds(claim.evidence))
    return '根拠がないか、根拠IDが重複しています。';
  for (const evidence of claim.evidence) {
    if (evidence.recordingId !== recording.id || !evidence.quote.trim())
      return '根拠の記録IDまたは引用が無効です。';
    if (evidence.kind === 'answer') {
      const answer = recording.answers.find((a) => a.id === evidence.answerId);
      if (!answer || !answer.text.includes(evidence.quote))
        return '回答の引用が原文と一致しません。';
    } else if (evidence.kind === 'note') {
      if (!recording.notes.includes(evidence.quote)) return 'メモの引用が原文と一致しません。';
    } else {
      if (recording.analysis?.mode === 'manual')
        return '手動質問用の区間は、動画を解析した根拠として使用できません。';
      if (
        !(recording.mediaId || recording.remoteMediaId) ||
        evidence.time === undefined ||
        evidence.time > recording.duration
      )
        return '動画の根拠には動画と有効な時刻が必要です。';
      if (
        !recording.analysis?.segments.some(
          (s) =>
            s.start <= evidence.time! &&
            s.end >= evidence.time! &&
            s.observation.includes(evidence.quote),
        )
      )
        return '動画の引用と観察区間が一致しません。';
    }
  }
  return undefined;
}

export function teamDataIssue(data: TeamData): string | undefined {
  for (const items of [data.recordings, data.articles, data.requests, data.activity])
    if (!uniqueIds(items)) return 'IDが重複しています。';
  if (
    data.recordings.some((r) => r.isDemo || r.analysis?.mode === 'demo') ||
    data.articles.some((a) => a.isDemo)
  )
    return 'デモデータはチーム同期に含められません。';
  for (const recording of data.recordings) {
    const issue = recordingIssue(recording);
    if (issue) return issue;
  }
  for (const article of data.articles) {
    const recording = data.recordings.find((r) => r.id === article.recordingId);
    if (!recording) return '記事の元記録がありません。';
    if (!uniqueIds(article.claims) || !uniqueIds(article.revisions))
      return '記事内のIDが重複しています。';
    let previousRevision = 0;
    for (const revision of article.revisions) {
      if (revision.number <= previousRevision || !uniqueIds(revision.claims))
        return '改訂番号の順序または改訂内のIDが無効です。';
      previousRevision = revision.number;
    }
    for (const claim of article.claims) {
      const issue = claimEvidenceIssue(claim, recording);
      if (issue) return issue;
      if (claim.review === 'confirmed' && (!claim.reviewedBy || !claim.reviewedAt))
        return '確認者と確認日時が必要です。';
    }
    if (
      article.status === 'published' &&
      (!article.claims.length || article.claims.some((c) => c.review !== 'confirmed'))
    )
      return '未確認の知識は公開できません。';
  }
  if (
    data.requests.some(
      (request) =>
        request.articleId && !data.articles.some((article) => article.id === request.articleId),
    )
  )
    return 'リクエストに対応する記事がありません。';
  return undefined;
}
