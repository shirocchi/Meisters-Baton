import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadWikiAsset } from '../src/lib/growiWiki';
import { wikiArchiveSchema, type WikiAsset } from '../src/domain/growiWiki';

const bytes = Buffer.from('private fixture, not a production model');
const asset: WikiAsset = {
  id: 'synthetic',
  name: 'fixture.json',
  contentType: 'application/json',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sourceSlug: `atlas-asset-${createHash('sha256').update(bytes).digest('hex')}`,
  url: '/atlas/synthetic',
  downloadUrl: '/atlas/synthetic',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mock(rows: unknown) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://wiki-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('private atlas attachments', () => {
  it('uses member authentication, bypasses caches, and verifies exact bytes', async () => {
    const fetcher = mock([{ content: { encoding: 'base64', data: bytes.toString('base64') } }]);
    const signal = new AbortController().signal;
    const result = await loadWikiAsset(asset, 'member-token', signal);
    expect(await result.text()).toBe(bytes.toString());
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`slug=eq.${asset.sourceSlug}`), {
      headers: { apikey: 'sb_publishable_fixture', Authorization: 'Bearer member-token' },
      signal,
      cache: 'no-store',
    });
  });
  it('rejects RLS-filtered empty responses instead of decoding another record', async () => {
    mock([]);
    await expect(
      loadWikiAsset(asset, 'member-token', new AbortController().signal),
    ).rejects.toThrow('閲覧権限');
  });
  it('rejects changed content, even if its declared MIME type is valid', async () => {
    mock([{ content: { encoding: 'base64', data: Buffer.from('wrong').toString('base64') } }]);
    await expect(
      loadWikiAsset(asset, 'member-token', new AbortController().signal),
    ).rejects.toThrow('一致しません');
  });
  it('continues accepting archives without atlas metadata', () => {
    const old = {
      format: 'baton-growi-archive',
      version: 1,
      origin: 'https://wiki2.meister.tech',
      root: '/ペラ',
      exportedAt: '2026-09-10',
      expectedPages: 0,
      pages: [],
    };
    expect(wikiArchiveSchema.parse(old).atlas).toBeUndefined();
  });
});
