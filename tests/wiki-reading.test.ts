import { describe, it, expect } from 'vitest';
import { illustratedManual, readingStep } from '../src/domain/wikiReading';
import type { WikiPage } from '../src/domain/growiWiki';
const asset = {
  id: 'photo',
  sha256: 'a'.repeat(64),
  name: '型の写真.jpg',
  url: '/attachment/photo',
  downloadUrl: '/download/photo',
  bytes: 100,
  contentType: 'image/jpeg',
};
const source = {
  id: 'mould',
  path: '/ペラ/型',
  title: '型',
  body: '',
  attachments: [asset],
} as WikiPage;
const home = {
  id: 'home',
  path: '/統合マニュアル',
  title: 'マニュアル',
  body: '# マニュアル\n\n## 型製作\n\n型の説明。[原文](/ペラ/型)\n\n## 外皮\n\n外皮の説明。[再参照](/ペラ/型)',
  attachments: [],
} as unknown as WikiPage;
describe('Wiki reading', () => {
  it('places a source photo between its linked section and the next section, without changing the original', () => {
    const body = illustratedManual(home, [home, source]);
    expect(body.indexOf('![型の写真.jpg]')).toBeGreaterThan(body.indexOf('型の説明'));
    expect(body.indexOf('![型の写真.jpg]')).toBeLessThan(body.indexOf('## 外皮'));
    expect(body.match(/!\[/g)).toHaveLength(1);
    expect(home.body).not.toContain('![');
    expect(body).toContain('写真の出典：型');
  });
  it('keeps already embedded photos and ordinary page text unchanged', () => {
    const withPhoto = { ...home, body: home.body + '\n\n![既存](/attachment/photo)' };
    expect(illustratedManual(withPhoto, [withPhoto, source])).toBe(withPhoto.body);
    expect(illustratedManual(source, [source])).toBe(source.body);
  });
  it.each([
    ['真空引き', 'vacuum'],
    ['外皮積層', 'laminate'],
    ['ウェブを組み込む', 'core'],
    ['貼り合わせ', 'bond'],
    ['パテと研磨', 'finish'],
    ['雄型の製作', 'mould'],
    ['ハブの締結', 'inspect'],
    ['スピナーの製作', 'spinner'],
  ])('matches the actual reading section %s to %s', (title, scene) => {
    const step = readingStep(title, 'カーボンモノコックマニュアル');
    expect(step.scene).toBe(scene);
    expect(step.title).toBe(title);
  });
  it('uses the page context only when the subsection has no process name', () => {
    expect(readingStep('必要な道具', '外皮積層').scene).toBe('laminate');
    expect(readingStep('製法の違い').scene).toBe('overview');
  });
});
