import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { WikiArchive, WikiPage } from '../../src/domain/growiWiki';
import { connect } from './helpers/wikiFixture';
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
