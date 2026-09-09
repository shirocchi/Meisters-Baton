import { describe, it, expect } from 'vitest';
import {
  expandWikiLists,
  searchWiki,
  wikiLink,
  wikiAssetFor,
  wikiArchiveSchema,
  type WikiPage,
} from '../src/domain/growiWiki';
const make = (id: string, path: string, body = ''): WikiPage => ({
  id,
  path,
  title: path.split('/').at(-1)!,
  body,
  revisionId: null,
  createdAt: '2026-09-09',
  updatedAt: '2026-09-09',
  author: 'fixture',
  sha256: 'a'.repeat(64),
  commentCount: 0,
  attachments: [],
});
const root = make('root', '/ペラ');
const child = make('child', '/ペラ/外皮', '真空引きで空気が漏れる');
describe('imported wiki navigation and boundaries', () => {
  it('keeps path links, permanent IDs and headings inside the wiki tab', () => {
    expect(wikiLink('/ペラ/外皮#真空', root, [root, child])).toBe(
      '#library/wiki/child?heading=%E7%9C%9F%E7%A9%BA',
    );
    expect(wikiLink('https://wiki2.meister.tech/child', root, [root, child])).toBe(
      '#library/wiki/child',
    );
    expect(wikiLink('#準備', child, [root, child])).toContain('#library/wiki/child?heading=');
    expect(wikiLink('/ペラ/', child, [root, child])).toBe('#library/wiki/root');
  });
  it('preserves unknown source links without claiming they are imported', () => {
    expect(wikiLink('/ペラ/不存在', root, [root, child])).toBe(
      'https://wiki2.meister.tech/%E3%83%9A%E3%83%A9/%E4%B8%8D%E5%AD%98%E5%9C%A8',
    );
    expect(wikiLink('https://example.com/child', root, [root, child])).toBe(
      'https://example.com/child',
    );
    expect(wikiLink('javascript:alert(1)', root, [root, child])).toBe('');
  });
  it('matches multiple words against complete bodies and expands child lists', () => {
    expect(searchWiki([root, child], '空気 真空')).toEqual([child]);
    expect(expandWikiLists('$lsx(/ペラ)', root, [root, child])).toContain(
      '[外皮](https://wiki2.meister.tech/child)',
    );
  });
  it('does not treat external asset URLs or malformed archives as trusted imports', () => {
    const asset = {
      id: '1',
      name: 'one.png',
      bytes: 5,
      contentType: 'image/png',
      url: '/attachment/1',
      downloadUrl: '/download/1',
    };
    expect(wikiAssetFor('/attachment/1', [asset])).toEqual(asset);
    expect(wikiAssetFor('https://example.com/attachment/1', [asset])).toBeUndefined();
    expect(wikiArchiveSchema.safeParse({ pages: [root] }).success).toBe(false);
  });
});
