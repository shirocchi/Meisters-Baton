import type { Recording } from './types';
import type { ProcessVideoRun } from './processVideo';
import { processVideoAttachmentSchema } from './processVideo';
import { wikiSections, type WorkshopMedia } from './wikiWorkshop';

/** Includes the actual selected frames; remote upload IDs do not change the evidence. */
export async function processVideoRecordingFingerprint(record: Recording) {
  const content = JSON.stringify(
    [
      record.id,
      record.title,
      record.notes,
      record.analysis,
      record.answers,
      record.duration,
      record.frames.map(({ id, time, dataUrl }) => ({ id, time, dataUrl })),
    ],
    (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
  );
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}

export async function validateVideoEvidence(
  run: ProcessVideoRun,
  record: Recording,
  teamId: string,
) {
  if (record.isDemo || run.teamId !== teamId || run.recordingId !== record.id)
    throw Error('この工房・作業記録の動画を選んでください。');
  if (
    !run.recordingFingerprint ||
    run.recordingFingerprint !== (await processVideoRecordingFingerprint(record))
  )
    throw Error(
      '制作後に記録や回答が変わったか、旧形式の動画です。最新の記録から動画を作り直してください。',
    );
}

export function processVideoMedia(
  run: ProcessVideoRun,
  sha256: string,
  bytes: number,
  remotePath: string,
  duration: number,
): WorkshopMedia {
  let at = 0;
  const cues = run.plan.scenes.map((scene) => {
    const start = at;
    at += scene.seconds;
    return { label: scene.title, start, end: Math.min(at, duration), sourceIds: scene.sourceIds };
  });
  if (!Number.isFinite(duration) || Math.abs(at - duration) > 0.15)
    throw Error('動画の実際の長さが制作構成と一致しません。MP4を書き出し直してください。');
  const processVideo = processVideoAttachmentSchema.parse({
    runId: run.id,
    recordingId: run.recordingId,
    recordingFingerprint: run.recordingFingerprint,
    sha256,
    duration,
    status: 'illustration',
    sources: run.sources,
    cues,
  });
  return {
    id: `process-video-${encodeURIComponent(run.id)}`,
    name: run.plan.title,
    type: 'video/mp4',
    bytes,
    remotePath,
    processVideo,
  };
}

const escapeText = (s: string) => s.replace(/[\\`*_{}\[\]<>#|!]/g, '\\$&');
export function processVideoBlock(run: ProcessVideoRun, mediaId: string, explanation: string) {
  const key = encodeURIComponent(run.id);
  return [
    `<!-- baton-video:${key} -->`,
    `### 工程の解説動画：${escapeText(run.plan.title)}`,
    '',
    ...explanation
      .trim()
      .split(/\r?\n/)
      .map((line) => `> ${escapeText(line)}`),
    '',
    '説明用の概念図です。製法の確認・承認を示すものではありません。',
    '',
    `[${escapeText(run.plan.title)}](#media/${mediaId})`,
    '',
    ...run.plan.missingEvidence.map(
      (item) => `- 未確認：${escapeText(item).replace(/\r?\n/g, ' ')}`,
    ),
    '',
    `[元の記録・質問と回答](#evidence/${encodeURIComponent(run.recordingId)})`,
    `<!-- /baton-video:${key} -->`,
    '',
  ].join('\n');
}

/** Only add a new block. Never silently replace a published explanation or authored text. */
export function insertProcessVideo(
  body: string,
  run: ProcessVideoRun,
  mediaId: string,
  heading: string,
  explanation: string,
) {
  if (!explanation.trim() || explanation.length > 3000)
    throw Error('説明を1〜3000文字で入力してください。');
  if (body.includes(`<!-- baton-video:${encodeURIComponent(run.id)} -->`))
    throw Error('この動画は掲載済みです。変更はWikiの編集から行ってください。');
  const targets = wikiSections(body).filter((section) => section.title === heading);
  if (heading && targets.length !== 1)
    throw Error('掲載先の見出しが変わったか、同名の見出しがあります。掲載先を選び直してください。');
  const at = heading ? targets[0].end : body.length;
  return (
    body.slice(0, at).trimEnd() +
    '\n\n' +
    processVideoBlock(run, mediaId, explanation) +
    '\n' +
    body.slice(at)
  );
}
