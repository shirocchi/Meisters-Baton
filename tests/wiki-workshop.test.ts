import { describe, it, expect } from 'vitest';
import {
  automaticTarget,
  eligibleRecording,
  integrateRecording,
  recordingFingerprint,
  wikiSections,
} from '../src/domain/wikiWorkshop';
import type { Recording } from '../src/domain/types';
import type { WikiPage } from '../src/domain/growiWiki';
const record: Recording = {
  id: 'rec-new',
  title: '外皮の真空引き',
  category: 'プロペラ',
  author: '架空の試験者',
  createdAt: '2026-09-09',
  updatedAt: '2026-09-09',
  duration: 20,
  frames: [],
  notes: 'シール端から空気が入った。貼り直すと音が止まった。',
  answers: [],
  status: 'recorded',
  isDemo: false,
};
const page = (id: string, title: string, body: string): WikiPage => ({
  id,
  path: '/ペラ/' + title,
  title,
  body,
  revisionId: 'base',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  author: 'fixture',
  sha256: 'x',
  attachments: [],
  commentCount: 0,
});
const skin = page(
  'skin',
  '外皮',
  '# 外皮\n\n## 真空引き\n\n元の作業手順を残す。\n\n## 脱型\n\n後の工程も残す。',
);
describe('recording integration', () => {
  it('chooses a specific source page and subsection while excluding diary and generic matches', () => {
    const target = automaticTarget(record, [
      skin,
      page('paint', '塗装', '# 塗装\n塗料の準備'),
      page('diary-1', '日記', '# 外皮 真空引き'),
    ]);
    expect(target?.page.id).toBe('skin');
    expect(target?.heading).toBe('真空引き');
    expect(
      automaticTarget({ ...record, title: '作業記録', notes: '今日の作業を確認した。' }, [skin]),
    ).toBeUndefined();
  });
  it('keeps ambiguous alternatives unassigned', () => {
    expect(
      automaticTarget(record, [skin, { ...skin, id: 'other', path: '/ペラ/別の外皮' }]),
    ).toBeUndefined();
  });
  it('integrates between the right headings without changing original instructions', () => {
    const body = integrateRecording(skin.body, record, '真空引き');
    expect(body.indexOf('シール端')).toBeGreaterThan(body.indexOf('## 真空引き'));
    expect(body.indexOf('シール端')).toBeLessThan(body.indexOf('## 脱型'));
    expect(body).toContain('元の作業手順を残す。');
    expect(body).toContain('後の工程も残す。');
  });
  it('updates one recording without duplicating it or deleting another recording', () => {
    let body = integrateRecording(skin.body, record, '真空引き');
    body = integrateRecording(body, { ...record, id: 'other', notes: '別の記録' }, '真空引き');
    body = integrateRecording(body, { ...record, notes: '追加した判断' }, '真空引き');
    expect(body.match(/baton-record:rec-new -->/g)).toHaveLength(2);
    expect(body).not.toContain('シール端');
    expect(body).toContain('別の記録');
    expect(body).toContain('追加した判断');
  });
  it('quotes evidence as data and keeps source time links', () => {
    const body = integrateRecording(
      skin.body,
      {
        ...record,
        notes: '<script>bad()</script>\n# 見出しの偽装',
        analysis: {
          mode: 'ai',
          summary: '',
          segments: [
            { id: 's', start: 12, end: 18, title: '端を押さえる', observation: '手元が見えない' },
          ],
          questions: [],
          limitations: [],
        },
      },
      '真空引き',
    );
    expect(body).toContain('\\<script\\>');
    expect(body).toContain('#evidence/rec-new?time=12');
    expect(body).toContain('確認待ち');
    expect(body).not.toContain('安全です');
  });
  it('fingerprints content changes but ignores media sync and excludes demo/imported diaries', async () => {
    expect(await recordingFingerprint(record)).toBe(
      await recordingFingerprint({ ...record, remoteMediaId: 'team/path' }),
    );
    expect(await recordingFingerprint(record)).not.toBe(
      await recordingFingerprint({ ...record, notes: '変更' }),
    );
    expect(eligibleRecording({ ...record, isDemo: true })).toBe(false);
    expect(eligibleRecording({ ...record, id: 'discord_recording_test' })).toBe(false);
  });
  it('ignores headings inside fenced snippets', () => {
    expect(wikiSections('# A\n```\n## code\n```\n## B').map((s) => s.title)).toEqual(['A', 'B']);
  });
});
