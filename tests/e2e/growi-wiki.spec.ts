import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { WikiArchive, WikiPage } from '../../src/domain/growiWiki';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><rect width="80" height="50" fill="blue"/></svg>';
const sha = createHash('sha256').update(svg).digest('hex');
const asset = {
  id: 'test-image',
  name: 'fixture.svg',
  bytes: Buffer.byteLength(svg),
  sha256: sha,
  contentType: 'image/svg+xml',
  url: '/attachment/test-image',
  downloadUrl: '/download/test-image',
};
const make = (id: string, path: string, body: string): WikiPage => ({
  id,
  path,
  title: path.split('/').at(-1)!,
  body,
  revisionId: 'test-revision',
  createdAt: '2026-01-01',
  updatedAt: '2026-09-09',
  author: '検証用の架空資料',
  sha256: 'a'.repeat(64),
  commentCount: 0,
  attachments: [],
});
const fixture: WikiArchive = {
  format: 'baton-growi-archive',
  version: 1,
  origin: 'https://wiki2.meister.tech',
  root: '/ペラ',
  exportedAt: '2026-09-09',
  expectedPages: 2,
  pages: [
    make('root', '/ペラ', '# ペラ\n\n$lsx(/ペラ)'),
    {
      ...make(
        'skin',
        '/ペラ/外皮',
        '# 外皮積層\n\n前：[ペラ](/ペラ)\n\n## 真空引き\n\n非公開の検証本文4819\n\n![試験写真](/attachment/test-image)\n\n|材料|数量|\n|---|---|\n|検証材|1|\n\n<script>alert(1)</script>',
      ),
      attachments: [asset],
    },
  ],
  home: make(
    'home',
    '/統合マニュアル',
    '# カーボンモノコックマニュアル\n\n[外皮の原文](/ペラ/外皮)\n\n## 積層\n\nマニュアルと日記を工程で照合。',
  ),
};
async function connect(page: Page, archive: WikiArchive = fixture) {
  const uid = '11111111-1111-4111-8111-111111111111';
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: uid, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  await page.addInitScript(
    ({ token, uid }) =>
      localStorage.setItem(
        'meisters-baton-supabase-auth',
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'test-refresh',
          user: {
            id: uid,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01',
          },
        }),
      ),
    { token, uid },
  );
  await page.route('https://wiki-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('team_members'))
      return route.fulfill({
        json: {
          team_id: '22222222-2222-4222-8222-222222222222',
          display_name: '試験メンバー',
          role: 'owner',
        },
      });
    if (url.pathname.endsWith('/teams'))
      return route.fulfill({
        json: { id: '22222222-2222-4222-8222-222222222222', name: '試験工房' },
      });
    if (url.pathname.endsWith('/propeller_wiki_sources')) {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return route.fulfill({ json: [{ content: archive }] });
    }
    if (url.pathname.includes('/storage/'))
      return route.fulfill({ contentType: 'image/svg+xml', body: svg });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404 });
  });
}
test('the main wiki asks for login and makes no private data request anonymously', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/propeller_wiki_sources*', (route) => {
    reads++;
    return route.fulfill({ status: 401 });
  });
  await page.goto('/#library');
  await expect(page.getByRole('button', { name: 'ログインして技術Wikiを読む' })).toBeVisible();
  expect(reads).toBe(0);
});
test.describe('authenticated imported wiki', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires Supabase fixtures');
  test('internal links, history, search, source, tables and verified images work', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await connect(page);
    await page.goto('/#library');
    await expect(page.locator('.gw-markdown h1')).toHaveText('カーボンモノコックマニュアル');
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.locator('.gw-markdown').getByRole('link', { name: '外皮の原文' }).click();
    await expect(page).toHaveURL(/library\/wiki\/skin/);
    await expect(page.locator('.gw-markdown table')).toBeVisible();
    await expect(page.getByRole('img', { name: 'fixture.svg' })).toBeVisible();
    await expect(page.locator('.gw-markdown script')).toHaveCount(0);
    await page.getByRole('button', { name: '原文', exact: true }).click();
    await expect(page.locator('.gw-source')).toContainText('非公開の検証本文4819');
    await page.goBack();
    await expect(page.locator('.gw-markdown h1')).toHaveText('カーボンモノコックマニュアル');
    await page.goForward();
    await page.reload();
    await expect(page.locator('.gw-markdown h1')).toHaveText('外皮積層');
    await page.getByLabel('Wiki全文検索').fill('非公開 4819');
    await expect(page.locator('.gw-results a')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      '非公開の検証本文4819',
    );
    await page.goto('/#settings');
    await page.getByRole('button', { name: '接続を終了', exact: true }).click();
    await page.goto('/#library');
    await expect(page.locator('.gw-markdown')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test('mobile page tree and missing page recovery stay inside the tab', async ({ page }) => {
    await connect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#library');
    await page.getByRole('button', { name: 'ページツリー', exact: true }).click();
    await page.getByLabel('Wiki全文検索').fill('真空');
    await page.locator('.gw-results a').click();
    await expect(page.locator('.gw-markdown h1')).toHaveText('外皮積層');
    await expect(page.locator('.gw-sidebar')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto('/#library/wiki/unknown');
    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    await page.getByRole('link', { name: 'マニュアルへ戻る' }).click();
    await expect(page.locator('.gw-markdown h1')).toHaveText('カーボンモノコックマニュアル');
  });
  test('private archive visual QA', async ({ page }) => {
    test.skip(!process.env.GROWI_QA_ARCHIVE, 'Local private-source QA only');
    const archive = JSON.parse(readFileSync(process.env.GROWI_QA_ARCHIVE!, 'utf8'));
    await connect(page, archive);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#library');
    await expect(page.locator('.gw-markdown h1')).toBeVisible();
    await page.screenshot({ path: '.verification/growi-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.verification/growi-mobile.png' });
  });
});
