import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('desktop settings shortcuts retain unsaved input and place keyboard focus at the section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#settings');
  await page.getByLabel('表示名', { exact: true }).fill('保存前の表示名');
  const backupShortcut = page
    .getByRole('navigation', { name: '設定の項目' })
    .getByRole('button', { name: '記録を手元に残す', exact: true });
  await backupShortcut.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator('#settings-backup')).toBeFocused();
  await expect(page.getByRole('heading', { name: '記録を手元に残す', exact: true })).toBeVisible();
  await expect(page.getByLabel('表示名', { exact: true })).toHaveValue('保存前の表示名');
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations.map(({ id }) => id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('notebook workspace keeps reference panels alongside the working area and capture fits a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/#home');
  const homeList = await page.locator('.home-columns > div').first().boundingBox();
  const homeAside = await page.locator('.home-aside').boundingBox();
  expect(homeList).not.toBeNull();
  expect(homeAside).not.toBeNull();
  expect(homeAside!.x).toBeGreaterThanOrEqual(homeList!.x + homeList!.width);
  await page
    .getByRole('navigation', { name: 'メインメニュー' })
    .getByRole('button', { name: '先輩の知恵', exact: true })
    .click();
  await expect(page.getByLabel('先輩の知恵に質問する')).toBeVisible();
  const askList = await page.locator('.ask-layout > :first-child').boundingBox();
  const askAside = await page.locator('.ask-aside').boundingBox();
  expect(askAside!.x).toBeGreaterThanOrEqual(askList!.x + askList!.width);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('navigation', { name: 'モバイルメニュー' })
    .getByRole('button', { name: '記録する', exact: true })
    .click();
  await expect(page.getByLabel(/作業の名前/)).toBeVisible();
  const save = page.getByRole('button', { name: '保存して、判断を残す' });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
