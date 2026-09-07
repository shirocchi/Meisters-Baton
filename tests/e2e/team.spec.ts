import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';

const apiOrigin = 'http://127.0.0.1:8788';
const webOrigin = 'http://127.0.0.1:5173';
let service: ReturnType<typeof createApp>;
let listener: Server;
let dataDirectory: string;

test.beforeAll(async () => {
  const root = resolve('.verification');
  mkdirSync(root, { recursive: true });
  dataDirectory = mkdtempSync(join(root, 'team-e2e-'));
  service = createApp({ dataDir: dataDirectory, apiKey: '', allowedOrigins: [webOrigin] });
  listener = await new Promise<Server>((resolveListening, reject) => {
    const server = service.app.listen(8788, '127.0.0.1', () => resolveListening(server));
    server.once('error', reject);
  });
});

test.afterAll(async () => {
  if (listener)
    await new Promise<void>((resolveClosed, reject) =>
      listener.close((error) => (error ? reject(error) : resolveClosed())),
    );
  service?.close();
  // Only remove this test's verified temporary child directory, never the normal .data store.
  if (
    (dataDirectory && dataDirectory.startsWith(resolve('.verification') + '\\')) ||
    (dataDirectory && dataDirectory.startsWith(resolve('.verification') + '/'))
  )
    rmSync(dataDirectory, { recursive: true, force: true });
});

async function openSettings(page: Page) {
  await page.getByRole('button', { name: '工房の設定', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: '工房の設定', exact: true })).toBeVisible();
}

async function configureServer(page: Page, displayName: string) {
  await page.goto('/#settings');
  await expect(page.getByRole('heading', { name: '工房の設定', exact: true })).toBeVisible();
  await page.getByLabel('表示名', { exact: true }).fill(displayName);
  await page.getByRole('button', { name: '名前を保存', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('表示名と、この端末の工房名を保存しました');
  await page.getByText('接続先を設定する', { exact: true }).click();
  await page.getByLabel('サーバーのアドレス', { exact: true }).fill(apiOrigin);
  await page.getByRole('button', { name: '接続先を保存', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('接続先を保存しました');
  await page.getByRole('button', { name: '接続を確認', exact: true }).click();
  await expect(page.getByText('AI未設定・手動で利用できます', { exact: true })).toBeVisible();
}

async function register(page: Page, email: string, password: string, teamName: string) {
  await page.getByRole('button', { name: 'チームを作る', exact: true }).click();
  await page.getByLabel('メールアドレス', { exact: true }).fill(email);
  await page.getByLabel(/^パスワード/).fill(password);
  await page.getByLabel('共有するチーム名', { exact: true }).fill(teamName);
  await page.getByRole('button', { name: 'アカウントとチームを作成', exact: true }).click();
  await expect(page.locator('.connected-team')).toContainText(teamName);
  await expect(page.getByRole('button', { name: '共有から取得', exact: true })).toBeEnabled();
}

test('two separate devices register, invite, share an expert draft, retrieve it and reconnect', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext({
    baseURL: webOrigin,
    viewport: { width: 1280, height: 900 },
  });
  const memberContext = await browser.newContext({
    baseURL: webOrigin,
    viewport: { width: 1280, height: 900 },
  });
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const pageErrors: string[] = [];
  owner.on('pageerror', (error) => pageErrors.push(error.message));
  member.on('pageerror', (error) => pageErrors.push(error.message));
  const unique = Date.now().toString(36);
  const teamName = `試験共有工房 ${unique}`;
  const title = `架空の治具確認 ${unique}`;
  const expertAnswer = `試験記録 ${unique}。青い識別票を図面の番号と照合してから進みます。`;
  const password = `E2e-only-password-${unique}`;
  const memberEmail = `member-${unique}@example.com`;
  try {
    await configureServer(owner, '試験担当A');
    await register(owner, `owner-${unique}@example.com`, password, teamName);
    const aiConsent = owner.getByRole('checkbox', { name: /AIへの送信を有効にする/ });
    await aiConsent.check();
    await expect(aiConsent).toBeEnabled();
    await expect(aiConsent).toBeChecked();

    await owner.getByRole('button', { name: '記録する', exact: true }).first().click();
    await owner.getByLabel(/作業の名前/).fill(title);
    await owner
      .getByLabel(/作業メモ/)
      .fill('チーム共有の動作を検証する架空の作業メモ。実作業の指示ではありません。');
    await owner.getByRole('button', { name: '保存して、判断を残す', exact: true }).click();
    await expect(owner.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await owner.getByRole('button', { name: '手動で判断を残す', exact: true }).click();
    await owner.getByLabel('あなたの言葉で', { exact: true }).fill(expertAnswer);
    await owner.getByRole('button', { name: '回答を保存して次へ', exact: true }).click();
    await expect(owner.getByText('1 / 3 問を保存', { exact: true })).toBeVisible();

    // An unavailable AI provider must be an honest error, while the expert's answer remains saved.
    await owner.getByRole('button', { name: 'AIで整理して下書きにする', exact: true }).click();
    await expect(owner.getByRole('alert')).toContainText('AIは未設定です');
    await expect(owner.getByText('1 / 3 問を保存', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Wikiの下書きを作る', exact: true }).click();
    await expect(owner.getByText('下書き・確認待ち', { exact: true })).toBeVisible();
    await expect(owner.locator('.claim-body')).toContainText(expertAnswer);

    await openSettings(owner);
    await owner.getByText('メンバーを招待する', { exact: true }).click();
    await owner.getByRole('button', { name: '招待コードを作る', exact: true }).click();
    await expect(owner.locator('.invite-code input')).toHaveValue(/^[A-F0-9]{20}$/);
    const inviteCode = await owner.locator('.invite-code input').inputValue();
    await owner.getByRole('button', { name: '端末の記録を共有', exact: true }).click();
    await owner
      .getByRole('dialog')
      .getByRole('button', { name: 'この内容をチームへ送信', exact: true })
      .click();
    await expect(owner.locator('.toast')).toHaveText('チームへ共有しました');
    await expect(owner.locator('.sync-panel')).toContainText('実記録 1件・Wiki 1件');

    await configureServer(member, '試験担当B');
    await register(member, memberEmail, password, `参加前の空チーム ${unique}`);
    await member.getByText('招待されたチームに参加する', { exact: true }).click();
    await member.getByLabel('招待コード', { exact: true }).fill(inviteCode);
    await member.getByRole('button', { name: 'この招待で参加する', exact: true }).click();
    await member
      .getByRole('dialog')
      .getByRole('button', { name: '招待されたチームに参加', exact: true })
      .click();
    await expect(member.locator('.connected-team')).toContainText(teamName);
    await expect(member.locator('.connected-team')).toContainText('メンバー');
    await expect(member.locator('.sync-panel')).toContainText('実記録 0件・Wiki 0件');
    await member.getByRole('button', { name: '共有から取得', exact: true }).click();
    await expect(member.locator('.toast')).toHaveText('共有の記録をこの端末に保存しました');
    await expect(member.locator('.sync-panel')).toContainText('実記録 1件・Wiki 1件');
    await member.getByRole('button', { name: '技術Wiki', exact: true }).first().click();
    await member.locator('.wiki-row-main').filter({ hasText: title }).click();
    await expect(member.locator('.claim-body')).toContainText(expertAnswer);
    await expect(member.getByText('下書き・確認待ち', { exact: true })).toBeVisible();

    await openSettings(member);
    await member.getByRole('button', { name: '接続を終了', exact: true }).click();
    await expect(member.getByRole('button', { name: 'チームに接続', exact: true })).toBeVisible();
    await member.getByLabel('メールアドレス', { exact: true }).fill(memberEmail);
    await member.getByLabel(/^パスワード/).fill(password);
    await member.getByRole('button', { name: 'チームに接続', exact: true }).click();
    await expect(member.locator('.connected-team')).toContainText(teamName);
    await member.getByRole('button', { name: '共有から取得', exact: true }).click();
    await expect(member.locator('.toast')).toHaveText('共有の記録をこの端末に保存しました');
    await expect(member.locator('.sync-panel')).toContainText('実記録 1件・Wiki 1件');
    expect(pageErrors).toEqual([]);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
