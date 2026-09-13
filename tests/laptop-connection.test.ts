import { describe, it, expect, vi } from 'vitest';
import { checkLaptopConnection, LAPTOP_API_URL } from '../src/lib/laptopConnection';
describe('website laptop setup', () => {
  it('does not send a session or follow redirects during discovery', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            aiConfigured: true,
            provider: 'codex-chatgpt',
            scope: 'loopback',
          }),
        ),
    );
    expect(await checkLaptopConnection(fetcher)).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      `${LAPTOP_API_URL}/api/health`,
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('headers');
  });
  it('rejects a different service on the same port', async () => {
    await expect(
      checkLaptopConnection(async () => new Response('{"ok":true,"aiConfigured":true}')),
    ).rejects.toThrow('確認できません');
  });
  it('explains unavailable or denied local network connections', async () => {
    await expect(
      checkLaptopConnection(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow('ローカルネットワーク');
  });
});
