import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test('published photo bookmarks stay with their process and enlarge without a local archive', async ({
  page,
}) => {
  await page.route('**/__textbook/sources', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#library/textbook/flange/1');
  const record = page.locator('#book-record-flange-mark-up');
  await record.scrollIntoViewIfNeeded();
  await expect(record.locator('[data-photo-bookmark]')).toHaveCount(2);
  const image = record.locator('img').first();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await record
    .getByRole('button', { name: /^写真を拡大/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('img')).toHaveAttribute(
    'src',
    /textbook\/photos\/.+webp$/,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const counts = await page.locator('[data-photo-bookmark]').count();
  expect(counts).toBe(72); // 71 assets; one internal structure photo is also used in the introduction.
  const displaced = page.locator('#book-record-flange-displaced-photo');
  await expect(displaced.locator('xpath=ancestor::*[@data-step][1]')).toContainText(
    '脱型後に見つかった',
  );
  await displaced.scrollIntoViewIfNeeded();
  await expect(page.locator('.book-visual [data-process-stage]')).toHaveAttribute(
    'data-process-stage',
    'flange',
  );
});

test('a phone can open a photo from the shared textbook without horizontal overflow', async ({
  page,
}) => {
  await page.route('**/__textbook/sources', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#library/textbook/finish/2');
  const bookmark = page
    .locator('#book-record-finish-masking-transfer [data-photo-bookmark]')
    .first();
  await bookmark.scrollIntoViewIfNeeded();
  await bookmark.getByRole('button', { name: /^写真を拡大/ }).click();
  const dialog = page.getByRole('dialog');
  await expect
    .poll(() => dialog.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(bookmark).toBeInViewport();
});
