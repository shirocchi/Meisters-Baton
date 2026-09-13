import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) =>
    route.fulfill({ json: { version: 1, stages: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('the documentation header stays visible while the passage and side navigation track reading', async ({
  page,
}) => {
  await page.goto('/#library/textbook/web/1');
  const header = page.locator('.book-masthead');
  await expect(header).toHaveCSS('background-color', 'rgb(64, 81, 181)');
  await expect(page.locator('.book-copy')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page
    .locator('#book-section-web-1 [data-step="1"]')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  expect((await header.boundingBox())?.y).toBe(0);
  expect((await header.boundingBox())?.height).toBe(48);
  await expect(page.locator('.book-visual [data-process-step]')).toHaveAttribute(
    'data-process-step',
    '1',
  );
  await expect(page.getByRole('button', { name: '教材を検索', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '工房へ戻る', exact: true }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('navigation', { name: 'メインメニュー', exact: true })).toBeVisible();
});

test('textbook search supports combined terms and opens the matching chapter passage', async ({
  page,
}) => {
  await page.goto('/#library/textbook/overview/0');
  await page.getByRole('button', { name: '教材を検索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '教材を検索', exact: true });
  const field = dialog.getByRole('searchbox', { name: '検索する言葉', exact: true });
  await expect(field).toBeFocused();
  await expect(dialog.getByRole('status')).toContainText('入力してください');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '教材を検索', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await field.fill('zzzz検索に一致しない言葉');
  await expect(dialog.getByRole('status')).toContainText('0件');
  await field.fill('ＵＰＰＥＲ　桁');
  const result = dialog.getByRole('button', { name: /upperを支え、桁を固定する/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#library\/textbook\/web\/1$/);
  await expect(page.locator('#book-section-web-1 .book-section-title')).toBeFocused();
});

test('the compact documentation header and search remain usable on a narrow phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/#library/textbook/web/1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: '教材を検索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '教材を検索', exact: true });
  await dialog.getByRole('searchbox').fill('ウェブ 桁リブ');
  await expect(dialog.locator('.book-search-result').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const results = await new AxeBuilder({ page })
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '教材を検索', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '目次', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'プロペラ製作 目次', exact: true })).toBeVisible();
});
