import { test, expect } from '@playwright/test';

test('connects to a verified laptop and preserves its address after reload', async ({ page }) => {
  await page.route('http://127.0.0.1:8787/api/health', async (route) => {
    expect(route.request().headers()).not.toHaveProperty('authorization');
    await route.fulfill({
      json: { ok: true, aiConfigured: true, provider: 'codex-chatgpt', scope: 'loopback' },
    });
  });
  await page.goto('/#settings');
  await page.getByText('AIサーバーの接続先を設定する', { exact: true }).click();
  await page.getByRole('button', { name: 'このPCのCodexに接続', exact: true }).click();
  await expect(page.getByText('サーバー接続OK', { exact: true })).toBeVisible();
  await expect(page.getByLabel('サーバーのアドレス')).toHaveValue('http://127.0.0.1:8787');
  await expect(
    page.getByRole('button', { name: 'Wiki閲覧権限を確認', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByText('AIサーバーの接続先を設定する', { exact: true }).click();
  await expect(page.getByLabel('サーバーのアドレス')).toHaveValue('http://127.0.0.1:8787');
});

test('keeps the old address when the local service is unavailable', async ({ page }) => {
  await page.route('http://127.0.0.1:8787/api/health', (route) => route.abort());
  await page.goto('/#settings');
  await page.getByText('AIサーバーの接続先を設定する', { exact: true }).click();
  await page.getByRole('button', { name: 'このPCのCodexに接続', exact: true }).click();
  await expect(page.getByText(/このPCのCodex接続口に届きません/)).toBeVisible();
  await expect(page.getByLabel('サーバーのアドレス')).toHaveValue('');
});
