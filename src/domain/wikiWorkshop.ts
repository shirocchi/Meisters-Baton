import { z } from 'zod';
import type { Recording } from './types';
import { knowledgeAnswers, latestAnswer, isCurrentQuestion } from './interview';
import type { WikiPage } from './growiWiki';
import { processVideoAttachmentSchema } from './processVideo';

export const workshopMediaSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  bytes: z.number(),
  remotePath: z.string(),
  processVideo: processVideoAttachmentSchema.optional(),
});
export type WorkshopMedia = z.infer<typeof workshopMediaSchema>;
export interface WikiEvent {
  recordingId: string;
  fingerprint: string;
  heading: string;
  integratedAt: string;
  recording: Recording;
}
export interface WikiEdit {
  page_id: string;
  title: string;
  body: string;
  version: number;
  updated_at: string;
  author: string;
  reason: string;
  events: WikiEvent[];
  media: WorkshopMedia[];
}
export interface WikiSection {
  title: string;
  start: number;
  end: number;
  level: number;
}
export function wikiSections(body: string): WikiSection[] {
  const result: WikiSection[] = [];
  let fenced = false;
  let generated = false;
  let offset = 0;
  for (const line of body.split('\n')) {
    if (/^<!-- baton-(record|video):/.test(line)) generated = true;
    const isGenerated = generated;
    if (/^<!-- \/baton-(record|video):/.test(line)) generated = false;
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = !fenced && !isGenerated && /^(#{1,4})\s+(.+)$/.exec(line);
    if (match)
      result.push({
        title: match[2].replace(/[*_`]/g, ''),
        start: offset,
        end: body.length,
        level: match[1].length,
      });
    offset += line.length + 1;
  }
  result.forEach((section, i) => {
    section.end = result[i + 1]?.start ?? body.length;
  });
  return result;
}
const groups = [
  ['雄型', '雌型', '型製作', 'パテ', 'サンディング'],
  ['積層', '外皮', 'プリプレグ', 'カーボン', 'クロス', '真空', 'バッグ', '脱泡', '樹脂'],
  ['コア', 'ロハセル', 'バルサ', 'ウェブ', 'スパー', '桁'],
  ['貼り合わせ', '接着', '接合', 'フランジ'],
  ['仕上げ', '塗装', '研磨', 'マスキング'],
  ['ハブ', '組立', '回転', '試験', 'バランス', '破断'],
  ['スピナー'],
];
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase();
function terms(text: string) {
  const source = normalize(text);
  const words = new Set<string>();
  for (const group of groups) for (const word of group) if (source.includes(word)) words.add(word);
  for (const { segment, isWordLike } of new Intl.Segmenter('ja', { granularity: 'word' }).segment(
    source,
  ))
    if (
      isWordLike &&
      segment.length >= 2 &&
      !/^(する|した|作業|記録|確認|今回|もの|こと|プロペラ|ペラ|工程|方法|ため|使用|状態|製作|作る|について|です|ます)$/.test(
        segment,
      )
    )
      words.add(segment);
  return [...words];
}
export function matchRecording(recording: Recording, pages: WikiPage[]) {
  const primary = normalize(
    `${recording.title} ${recording.notes} ${recording.analysis?.summary ?? ''}`,
  );
  const words = terms(
    `${primary} ${recording.analysis?.segments.map((s) => s.title + ' ' + s.observation).join(' ') ?? ''} ${recording.answers.map((a) => a.text).join(' ')}`,
  );
  const candidates = pages.filter(
    (p) =>
      p.id !== 'home' &&
      !p.id.startsWith('diary-') &&
      !p.unavailable &&
      !p.isEmpty &&
      !/日誌|日記/.test(p.path),
  );
  return candidates
    .map((page) => {
      const title = normalize(page.title),
        path = normalize(page.path),
        body = normalize(page.body);
      const headings = wikiSections(page.body).filter((s) => s.level > 1);
      let score = 0;
      const matched: string[] = [];
      for (const word of words) {
        const points = title.includes(word)
          ? 12
          : path.includes(word)
            ? 6
            : headings.some((h) => normalize(h.title).includes(word))
              ? 5
              : body.includes(word)
                ? 1
                : 0;
        score += points;
        if (points >= 5) matched.push(word);
      }
      if (title.length >= 2 && primary.includes(title)) score += 20;
      const section = headings
        .map((h) => ({
          title: h.title,
          score: words.reduce(
            (n, w) =>
              n +
              (normalize(h.title).includes(w)
                ? 5
                : normalize(page.body.slice(h.start, h.end)).includes(w)
                  ? 1
                  : 0),
            0,
          ),
        }))
        .sort((a, b) => b.score - a.score)[0];
      return { page, heading: section && section.score > 0 ? section.title : '', score, matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}
export function automaticTarget(recording: Recording, pages: WikiPage[]) {
  const matches = matchRecording(recording, pages);
  const top = matches[0];
  return top &&
    top.score >= 12 &&
    top.matched.length > 0 &&
    (!matches[1] || top.score - matches[1].score >= 3)
    ? top
    : undefined;
}
export function eligibleRecording(r: Recording) {
  return (
    !r.isDemo &&
    !r.id.startsWith('discord_') &&
    r.analysis?.mode !== 'demo' &&
    (!!r.notes.trim() ||
      !!r.answers.length ||
      !!r.analysis?.segments.length ||
      !!r.mediaId ||
      !!r.remoteMediaId)
  );
}
export async function recordingFingerprint(r: Recording) {
  const text = JSON.stringify([r.id, r.title, r.notes, r.analysis, r.answers]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}
const escape = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/\r?\n/g, '\n> ');
export function evidenceBody(r: Recording) {
  const lines = [
    `### 現場記録：${escape(r.title)}`,
    ``,
    `${escape(r.author)} · ${r.createdAt.slice(0, 10)} · ${r.analysis?.mode === 'ai' ? '映像解析を含む・確認待ち' : '作業者の記録'}`,
    ``,
  ];
  if (r.notes.trim()) lines.push(`**作業メモ**`, `> ${escape(r.notes.trim())}`, ``);
  for (const segment of r.analysis?.segments ?? [])
    if (segment.observation.trim())
      lines.push(
        `**${escape(segment.title)}** — [${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, '0')}の映像](#evidence/${encodeURIComponent(r.id)}?time=${segment.start})`,
        `> ${escape(segment.observation)}`,
        ``,
      );
  for (const answer of knowledgeAnswers(r)) {
    const question = r.analysis?.questions.find((q) => q.id === answer.questionId);
    lines.push(
      `**${escape(question?.text ?? '作業者の判断')}**`,
      `> ${escape(answer.text)}`,
      `回答：${escape(answer.author)}`,
      ``,
    );
  }
  for (const question of r.analysis?.questions ?? []) {
    if (!isCurrentQuestion(r, question)) continue;
    const answer = latestAnswer(r, question.id);
    const outcome =
      question.skipped ??
      (question.review?.answerId === answer?.id ? question.review?.outcome : undefined);
    if (outcome === 'unknown' || outcome === 'not_applicable')
      lines.push(
        `**${outcome === 'unknown' ? '未確認' : '今回は該当なし'}：${escape(question.text)}**`,
        ...(answer ? [`> ${escape(answer.text)}`] : []),
        ``,
      );
  }
  lines.push(`[元の記録と映像を確認](#evidence/${encodeURIComponent(r.id)})`, ``);
  return lines.join('\n');
}
/** Replace only this recording's marked material; keep authored instructions and other records. */
export function integrateRecording(body: string, r: Recording, heading: string) {
  const key = encodeURIComponent(r.id);
  const start = `<!-- baton-record:${key} -->`;
  const end = `<!-- /baton-record:${key} -->`;
  const block = `${start}\n${evidenceBody(r)}${end}\n`;
  const oldStart = body.indexOf(start),
    oldEnd = body.indexOf(end, oldStart);
  if (oldStart >= 0 && oldEnd >= oldStart)
    return body.slice(0, oldStart) + block + body.slice(oldEnd + end.length).replace(/^\n/, '');
  const sections = wikiSections(body);
  const target = sections.find((s) => s.title === heading);
  const at = target?.end ?? body.length;
  return body.slice(0, at).trimEnd() + '\n\n' + block + '\n' + body.slice(at);
}
export function snapshotRecording(r: Recording): Recording {
  return {
    ...r,
    frames: r.frames.slice(0, 6).filter((f) => f.dataUrl.length < 200000),
    mediaId: undefined,
  };
}
