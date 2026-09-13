import { test, expect } from '@playwright/test';

test('diary notes keep source dates and editorial cautions visible in the relevant chapters', async ({
  page,
}) => {
  await page.route('**/__textbook/sources', (route) =>
    route.fulfill({ json: { version: 1, stages: {} } }),
  );
  await page.goto('/#library/textbook/overview/0');
  await expect(page.locator('.book-diary-card')).toHaveCount(14);
  await page.goto('/#library/textbook/flange/0');
  const note = page.locator('#book-section-flange-4 .book-diary-card');
  await expect(note).toHaveCount(1);
  await note.locator('summary').click();
  await expect(note).toContainText('原因として疑われています');
  await expect(note).toContainText('2026-03-23');
  await expect(note).toContainText('2026-03-24');
  await expect(note.getByRole('link')).toHaveAttribute('href', /1485933501076340826$/);
  await page
    .locator('#book-section-flange-4')
    .getByRole('button', { name: 'この章の付箋', exact: true })
    .click();
  await expect(page.getByRole('dialog').locator('.book-diary-card')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.goto('/#library/textbook/finish/0');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText('ブレードとハブのねじを、一つずつ確認する', { exact: true }).click();
  await expect(page.locator('#book-section-finish-4 .book-diary')).toContainText(
    '試験を始めません',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
