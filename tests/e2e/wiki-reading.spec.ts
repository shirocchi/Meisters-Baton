import { test, expect } from '@playwright/test';
import { connect, fixture } from './helpers/wikiFixture';

test.describe('article reading', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires Supabase fixtures');
  test('manual comes first, source photo is embedded in the text and promotional blocks are absent', async ({
    page,
  }) => {
    await connect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#library/wiki/home');
    await page.getByLabel('モニターを最小化', { exact: true }).click();
    await expect(page.locator('.ww-hero,.ww-metrics')).toHaveCount(0);
    await expect(page.getByText('知りたい作業へ、まっすぐ。')).toHaveCount(0);
    const manual = page.locator('.ww-reading h1');
    const stages = page.getByRole('heading', { name: '工程から探す', exact: true });
    const photos = page.getByRole('heading', { name: '写真から、工程へ', exact: true });
    expect((await manual.boundingBox())!.y).toBeLessThan((await stages.boundingBox())!.y);
    expect((await stages.boundingBox())!.y).toBeLessThan((await photos.boundingBox())!.y);
    const image = page.locator('.ww-reading img');
    await expect(image).toBeVisible();
    const source = page.locator('.ww-reading').getByRole('link', { name: '写真の出典：外皮' });
    await expect(source).toBeVisible();
    expect((await image.boundingBox())!.y).toBeLessThan(
      (await page.locator('.ww-reading h2').boundingBox())!.y,
    );
    await image.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.verification/wiki-inline-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await source.click();
    await expect(page).toHaveURL(/wiki\/skin/);
  });
  test('scrolling changes the monitor between lamination, vacuum and bonding inside one page', async ({
    page,
  }) => {
    const archive = structuredClone(fixture);
    archive.pages[1].body =
      '# 外皮積層\n\n' +
      '積層面を確認する。\n\n'.repeat(20) +
      '## 真空引き\n\n' +
      'バッグと配管を確認する。\n\n'.repeat(20) +
      '## 貼り合わせ\n\n' +
      '上下の対応を確認する。\n\n'.repeat(20);
    await connect(page, archive);
    await page.goto('/#library/wiki/skin');
    const diagram = page.locator('.propeller-monitor svg[role=img]');
    await expect(diagram).toHaveAttribute('data-scene', 'laminate');
    const scrollToHeading = async (name: string) => {
      await page
        .locator('.ww-reading')
        .locator('h2')
        .filter({ hasText: name })
        .evaluate((e) => window.scrollBy(0, e.getBoundingClientRect().top - 150));
    };
    await scrollToHeading('真空引き');
    await expect(diagram).toHaveAttribute('data-scene', 'vacuum');
    await expect(diagram).toContainText('排気 → 配管');
    await page.screenshot({ path: '.verification/wiki-monitor-vacuum.png' });
    await scrollToHeading('貼り合わせ');
    await expect(diagram).toHaveAttribute('data-scene', 'bond');
    await expect(page.locator('.pm-reading')).toContainText('03 / 03');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(diagram).toHaveAttribute('data-scene', 'laminate');
  });
});
