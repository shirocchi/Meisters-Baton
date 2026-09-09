import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    propellerTestRevoked: string[];
  }
}

// Enable after integrating the dependent Supabase-auth work, against a fixture-only URL.
test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires the parallel Supabase-auth integration');

test('private sources, attachment retry and logout work without persisting source content', async ({
  page,
}) => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const teamId = '22222222-2222-4222-8222-222222222222';
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: ownerId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture-signature`;
  await page.addInitScript(
    ({ token, ownerId }) => {
      localStorage.setItem(
        'meisters-baton-supabase-auth',
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'test-refresh',
          user: {
            id: ownerId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      );
      const original = URL.revokeObjectURL;
      window.propellerTestRevoked = [];
      URL.revokeObjectURL = (url) => {
        window.propellerTestRevoked.push(url);
        original(url);
      };
    },
    { token, ownerId },
  );
  let sourceRequests = 0;
  let attachmentRequests = 0;
  let allowed = true;
  await page.route('https://wiki-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('team_members'))
      return route.fulfill({
        json: { team_id: teamId, display_name: '架空の検証メンバー', role: 'owner' },
      });
    if (url.pathname.endsWith('/teams'))
      return route.fulfill({ json: { id: teamId, name: '架空の検証工房' } });
    if (url.pathname.endsWith('/propeller_wiki_sources')) {
      sourceRequests++;
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return route.fulfill({
        json: allowed
          ? [
              {
                content: {
                  title: '架空の一次資料',
                  summary: '試験専用',
                  claims: [
                    {
                      id: 'fixture',
                      title: '試験用の確認項目',
                      body: '非公開テスト資料4819',
                      review: 'draft',
                      evidence: [
                        {
                          id: 'fixture-evidence',
                          quote: '架空の原文4819',
                          sourceLabel: '架空の記録',
                          sourceUrl: 'https://discord.com/channels/1/2/3',
                          sourceAttachments: [
                            {
                              filename: 'fixture.svg',
                              bytes: 100,
                              sha256: 'a'.repeat(64),
                              mediaPath: 'unused',
                              contentType: 'image/svg+xml',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ]
          : [],
      });
    }
    if (url.pathname.includes('/storage/v1/object/authenticated/')) {
      attachmentRequests++;
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return attachmentRequests === 1
        ? route.fulfill({ status: 503, body: '' })
        : route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
          });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } });
  });
  await page.goto('/#library');
  await page.getByLabel('モニターを最小化').click();
  await page.getByText('試験用の確認項目', { exact: true }).click();
  await expect(page.getByText('非公開テスト資料4819', { exact: true })).toBeVisible();
  const attachment = page.getByRole('button', { name: /fixture.svg/ });
  await attachment.click();
  await expect(page.getByRole('alert')).toContainText('この添付はまだ');
  await attachment.click();
  await expect(page.getByRole('img', { name: 'fixture.svg', exact: true })).toBeVisible();
  expect(attachmentRequests).toBe(2);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('meisters-baton-beta');
      request.onsuccess = () => resolve(request.result);
    });
    const values = await new Promise<unknown>((resolve) => {
      const request = db.transaction('state').objectStore('state').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return JSON.stringify(values) + JSON.stringify(localStorage);
  });
  expect(saved).not.toContain('非公開テスト資料4819');
  allowed = false;
  await page.goto('/#library/propeller/spinner');
  await expect(page.getByText(/管理者による開発チームの登録が必要/)).toBeVisible();
  await expect(page.getByText('非公開テスト資料4819', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.propellerTestRevoked.length)).toBeGreaterThan(0);
  await page.goto('/#settings');
  await page.getByRole('button', { name: '接続を終了', exact: true }).click();
  await expect(page.getByRole('button', { name: 'チームに接続', exact: true })).toBeVisible();
  const count = sourceRequests;
  await page.goto('/#library');
  await expect(page.getByRole('button', { name: 'ログインして一次資料を読む' })).toBeVisible();
  expect(sourceRequests).toBe(count);
});
