// Run after npm run build: npx tsx scripts/offline-qa.mjs
// Uses only an isolated browser profile and temporary server storage.
import { chromium, expect } from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createApp } from '../server/app.ts';

const outputDirectory = resolve('.verification');
const dist = resolve('dist');
await access(join(dist, 'sw.js'));
await mkdir(outputDirectory, { recursive: true });
const dataDirectory = await mkdtemp(join(outputDirectory, 'offline-qa-data-'));
const service = createApp({
  dataDir: dataDirectory,
  apiKey: '',
  serveDir: dist,
  allowedOrigins: ['http://127.0.0.1:8789'],
});
let listener;
let browser;
let page;
const errors = [];
const networkFailures = [];
let cacheDiagnostics;
const started = Date.now();
try {
  listener = await new Promise((resolveListening, reject) => {
    const server = service.app.listen(8789, '127.0.0.1', () => resolveListening(server));
    server.once('error', reject);
  });
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--disable-gpu'] });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:8789',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    networkFailures.push({ url: request.url(), error: request.failure()?.errorText }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工房の記録', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await Promise.race([
      (async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((resolveController) =>
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => resolveController(),
              { once: true },
            ),
          );
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service worker activation timed out')), 15_000),
      ),
    ]);
  });
  const onlineHealth = await page.evaluate(() =>
    fetch('/api/health').then((response) => response.json()),
  );
  expect(onlineHealth).toMatchObject({ ok: true, aiConfigured: false });
  cacheDiagnostics = await page.evaluate(async () => {
    const script = document.querySelector('script[type="module"]')?.src;
    const entries = (
      await Promise.all(
        (await caches.keys()).map(async (name) => {
          const cache = await caches.open(name);
          return Promise.all(
            (await cache.keys()).map(async (request) => ({
              url: request.url,
              requestOrigin: request.headers.get('origin'),
              vary: (await cache.match(request))?.headers.get('vary'),
            })),
          );
        }),
      )
    ).flat();
    return {
      script,
      entries,
      scriptHit: script && Boolean(await caches.match(script)),
      scriptOriginHit:
        script &&
        Boolean(await caches.match(new Request(script, { headers: { Origin: location.origin } }))),
    };
  });

  const title = `オフライン引き継ぎ試験 ${Date.now().toString(36)}`;
  const firstAnswer = '練習用の識別票を指さしてから、図面番号と照合しました。';
  const secondAnswer = '通信できない場所でも、不明な点を記録して担当者へ確認します。';
  await page.getByRole('button', { name: '作業を記録', exact: true }).click();
  await page.getByLabel(/作業の名前/).fill(title);
  await page
    .getByLabel(/作業メモ/)
    .fill('オフライン動作を確認する架空の作業記録。製造・安全の指示ではありません。');
  await page.getByRole('button', { name: '保存して、判断を残す', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '手動で判断を残す', exact: true }).click();
  await page.getByRole('textbox', { name: 'あなたの言葉で', exact: true }).fill(firstAnswer);
  await page.getByRole('button', { name: '回答を保存して次へ', exact: true }).click();
  await expect(page.getByText('1 / 3 問を保存', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.offline-banner')).toContainText('オフライン');
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'あなたの言葉で', exact: true })).toHaveValue(
    firstAnswer,
  );
  const apiRespondedOffline = await page.evaluate(() =>
    fetch('/api/health').then(
      () => true,
      () => false,
    ),
  );
  expect(apiRespondedOffline).toBe(false);

  await page.getByRole('button', { name: '質問2', exact: true }).click();
  await page.getByRole('textbox', { name: 'あなたの言葉で', exact: true }).fill(secondAnswer);
  await page.getByRole('button', { name: '回答を保存して次へ', exact: true }).click();
  await expect(page.getByText('2 / 3 問を保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('2 / 3 問を保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '質問2', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'あなたの言葉で', exact: true })).toHaveValue(
    secondAnswer,
  );
  await page.getByRole('button', { name: 'Wikiの下書きを作る', exact: true }).click();
  await expect(page.getByText('下書き・確認待ち', { exact: true })).toBeVisible();
  await expect(page.locator('.claim-body')).toHaveCount(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('下書き・確認待ち', { exact: true })).toBeVisible();
  await expect(page.locator('.claim-body').filter({ hasText: firstAnswer })).toBeVisible();
  await expect(page.locator('.claim-body').filter({ hasText: secondAnswer })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'モバイルメニュー', exact: true })
    .getByRole('button', { name: '工房', exact: true })
    .click();
  await expect(page.locator('.resume-row').filter({ hasText: title })).toBeVisible();
  await page.locator('.resume-row').filter({ hasText: title }).click();
  await expect(page.getByText('2 / 3 問を保存', { exact: true })).toBeVisible();

  const cachedPaths = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname),
        ),
      )
    ).flat();
  });
  expect(cachedPaths).toContain('/index.html');
  expect(cachedPaths).toContain('/third-party-notices.txt');
  expect(cachedPaths.filter((path) => path.startsWith('/api/'))).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(outputDirectory, 'offline-qa.png'), fullPage: true });
  await page.getByRole('button', { name: '工房の設定', exact: true }).first().click();
  await page.getByRole('button', { name: 'ライセンスとクレジット', exact: true }).click();
  const notices = page.getByRole('region', { name: 'ライセンス原文', exact: true });
  await expect(notices).toBeVisible();
  const noticeSource = await readFile(resolve('docs/third-party-notices.txt'), 'utf8');
  expect((await notices.textContent()) === noticeSource).toBe(true);
  expect(await notices.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await page.screenshot({ path: join(outputDirectory, 'license-offline-qa.png'), fullPage: true });
  expect(errors).toEqual([]);
  const report = {
    passed: true,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    applicationOrigin: 'http://127.0.0.1:8789',
    checks: [
      'production service worker activated',
      'manual record and first answer survived offline reload',
      'second answer saved offline and survived reload',
      'draft generated offline and survived reload',
      'offline navigation retained record',
      'API requests failed offline and no API responses were cached',
      'bundled license notices opened offline with the complete original text and a scrollable region',
    ],
    pageErrors: errors,
  };
  await writeFile(join(outputDirectory, 'offline-qa.json'), JSON.stringify(report, null, 2));
  console.log(
    `Offline production smoke test passed (${report.durationMs} ms). Report: .verification/offline-qa.json`,
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: join(outputDirectory, 'offline-qa-failure.png'), fullPage: true })
      .catch(() => {});
  await writeFile(
    join(outputDirectory, 'offline-qa.json'),
    JSON.stringify(
      {
        passed: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        pageErrors: errors,
        networkFailures,
        cacheDiagnostics,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  if (listener)
    await new Promise((resolveClosed, reject) =>
      listener.close((error) => (error ? reject(error) : resolveClosed())),
    );
  service.close();
  const child = relative(outputDirectory, dataDirectory);
  if (!child || child.startsWith('..') || isAbsolute(child))
    throw new Error('Refusing to remove an unverified test storage directory.');
  await rm(dataDirectory, { recursive: true, force: true });
}
