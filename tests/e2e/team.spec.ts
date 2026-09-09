import { expect, test } from '@playwright/test';

const ownerId = '11111111-1111-4111-8111-111111111111';
const teamId = '22222222-2222-4222-8222-222222222222';

function testJwt(): string {
  const part = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: ownerId,
  })}.test-signature`;
}

test('team sharing is configured through Supabase while the AI server remains optional', async ({
  page,
}) => {
  await page.goto('/#settings');
  await expect(page.getByRole('heading', { name: '工房の設定', exact: true })).toBeVisible();
  await expect(
    page.getByText('チーム共有はSupabaseへ、AIは指定したサーバーへ接続します。'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'チームを作る', exact: true }).click();
  await expect(page.getByLabel('メールアドレス', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/^パスワード/)).toBeVisible();
  await expect(page.getByLabel('共有するチーム名', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'アカウントとチームを作成', exact: true }),
  ).toBeEnabled();

  await page.getByText('AIサーバーの接続先を設定する', { exact: true }).click();
  await expect(page.getByLabel('サーバーのアドレス', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '接続を確認', exact: true })).toBeDisabled();
  await expect(
    page.getByText('AIを使わない場合は空欄で構いません。', { exact: false }),
  ).toBeVisible();
});

test('the invite and join controls look and behave like tappable actions', async ({ page }) => {
  const accessToken = testJwt();
  await page.addInitScript(
    ({ token, expiresAt }) => {
      localStorage.setItem(
        'meisters-baton-supabase-auth',
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: expiresAt,
          refresh_token: 'test-refresh-token',
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'owner@example.com',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        }),
      );
    },
    { token: accessToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  );
  await page.route('**/rest/v1/team_members*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ team_id: teamId, display_name: 'テスト管理者', role: 'owner' }),
    }),
  );
  await page.route('**/rest/v1/teams*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: teamId, name: 'テスト工房' }),
    }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#settings');

  const inviteControl = page.locator('.invite-details > summary');
  await expect(inviteControl).toBeVisible();
  await expect(inviteControl.getByText('メンバーを招待する', { exact: true })).toBeVisible();
  await expect(inviteControl.getByText('招待コードを発行して、この工房に追加')).toBeVisible();
  await expect(inviteControl.locator('.team-action-summary-icon')).toBeVisible();
  await expect(inviteControl.locator('.team-action-summary-chevron')).toBeVisible();
  expect((await inviteControl.boundingBox())?.height).toBeGreaterThanOrEqual(66);

  await inviteControl.click();
  await expect(page.locator('.invite-details')).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: '招待コードを作る', exact: true })).toBeVisible();

  const joinControl = page.locator('.join-details > summary');
  await expect(joinControl).toBeVisible();
  await expect(joinControl.getByText('招待されたチームに参加する', { exact: true })).toBeVisible();
  await expect(joinControl.getByText('受け取った招待コードを入力して参加')).toBeVisible();
  await expect(joinControl.locator('.team-action-summary-icon')).toBeVisible();
  await expect(joinControl.locator('.team-action-summary-chevron')).toBeVisible();
  expect((await joinControl.boundingBox())?.height).toBeGreaterThanOrEqual(66);

  await joinControl.click();
  await expect(page.locator('.join-details')).toHaveAttribute('open', '');
  await expect(page.getByLabel('招待コード', { exact: true })).toBeVisible();
});
