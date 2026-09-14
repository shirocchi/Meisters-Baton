import { describe, expect, it } from 'vitest';
import {
  insertProcessVideo,
  processVideoMedia,
  processVideoRecordingFingerprint,
  validateVideoEvidence,
} from '../src/domain/processVideoWiki';
import { workshopMediaSchema, wikiSections } from '../src/domain/wikiWorkshop';
import { videoPlan, videoRecording as record } from './helpers/processVideoFixture';
import type { ProcessVideoRun } from '../src/domain/processVideo';
import type { Recording } from '../src/domain/types';
const run = async (): Promise<ProcessVideoRun> => ({
  id: 'run-1',
  teamId: 'team-1',
  recordingId: record.id,
  recordingFingerprint: await processVideoRecordingFingerprint(record),
  createdAt: record.createdAt,
  skillSha256: 'a'.repeat(64),
  status: 'storyboard-draft',
  plan: videoPlan,
  sources: [
    {
      id: 'recording:note',
      title: '作業メモ',
      route: `#evidence/${record.id}`,
      sha256: 'b'.repeat(64),
    },
  ],
  limitations: [],
});
describe('process explanation publication', () => {
  it('rejects another team, another recording, legacy output and revised evidence', async () => {
    const value = await run();
    await expect(validateVideoEvidence(value, record, 'team-1')).resolves.toBeUndefined();
    for (const [video, recording, team] of [
      [value, record, 'team-2'],
      [value, { ...record, id: 'other' }, 'team-1'],
      [{ ...value, recordingFingerprint: undefined }, record, 'team-1'],
      [value, { ...record, notes: '回答後の新しい判断' }, 'team-1'],
      [
        value,
        { ...record, frames: [{ id: 'f', time: 1, dataUrl: 'data:image/png;base64,YQ==' }] },
        'team-1',
      ],
    ] as [ProcessVideoRun, Recording, string][])
      await expect(validateVideoEvidence(video, recording, team)).rejects.toThrow();
    await expect(
      validateVideoEvidence(value, { ...record, remoteMediaId: 'uploaded' }, 'team-1'),
    ).resolves.toBeUndefined();
    const answered: Recording = {
      ...record,
      answers: [
        {
          id: 'a',
          questionId: 'q',
          text: '回答',
          author: '試験者',
          createdAt: record.createdAt,
          source: 'text',
        },
      ],
    };
    const reordered = {
      ...answered,
      answers: answered.answers.map(
        (answer) => Object.fromEntries(Object.entries(answer).reverse()) as typeof answer,
      ),
    };
    expect(await processVideoRecordingFingerprint(answered)).toBe(
      await processVideoRecordingFingerprint(reordered),
    );
  });
  it('preserves authored text and surrounding processes, escapes source markup and rejects duplicate or ambiguous placement', async () => {
    const value = await run();
    const original = '# 外皮\n\n## 真空引き\n\n元の本文\n\n## 脱型\n\n後の工程';
    const body = insertProcessVideo(
      original,
      value,
      'media-1',
      '真空引き',
      '<script>bad()</script>\n## 偽見出し',
    );
    expect(body).toContain('元の本文');
    expect(body).toContain('後の工程');
    expect(body.indexOf('#media/media-1')).toBeLessThan(body.indexOf('## 脱型'));
    expect(body).not.toContain('<script>');
    expect(wikiSections(body).map((s) => s.title)).toEqual(['外皮', '真空引き', '脱型']);
    expect(() => insertProcessVideo(body, value, 'media-1', '真空引き', '二重掲載')).toThrow(
      /掲載済み/,
    );
    expect(() => insertProcessVideo(original, value, 'media-1', 'ない見出し', '説明')).toThrow(
      /見出し/,
    );
    expect(() =>
      insertProcessVideo(
        original + '\n## 真空引き\n別の本文',
        value,
        'media-1',
        '真空引き',
        '説明',
      ),
    ).toThrow(/見出し/);
  });
  it('round trips source IDs and measured scene cues through the existing Wiki attachment contract', async () => {
    const media = processVideoMedia(await run(), 'c'.repeat(64), 2048, 'team-1/video', 7.997);
    expect(workshopMediaSchema.parse(JSON.parse(JSON.stringify(media)))).toEqual(media);
    expect(media.processVideo?.cues.map((cue) => [cue.start, cue.end])).toEqual([
      [0, 4],
      [4, 7.997],
    ]);
    const invalid = structuredClone(media);
    invalid.processVideo!.cues[1].sourceIds = ['invented'];
    expect(workshopMediaSchema.safeParse(invalid).success).toBe(false);
    invalid.processVideo!.cues[1] = { ...media.processVideo!.cues[1], start: 2 };
    expect(workshopMediaSchema.safeParse(invalid).success).toBe(false);
    expect(() => processVideoMedia({} as ProcessVideoRun, '', 0, '', 8)).toThrow();
  });
});
