import { test, expect, type Page } from '@playwright/test';

const model = (page: Page) => page.getByRole('region', { name: '機体全体から内部構造を見る3D' });
const levels = (page: Page) => model(page).getByRole('navigation', { name: '見る範囲' });

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) =>
    route.fulfill({ json: { version: 1, stages: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('the introduction connects the aircraft, rotating propeller, blade and internal section', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#library/textbook/overview/0');
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'aircraft');
  await expect(model(page).locator('canvas')).toBeVisible();
  await expect(model(page).getByRole('alert')).toHaveCount(0);
  const aircraft = await model(page).locator('canvas').screenshot();
  await levels(page).getByRole('button', { name: '2 プロペラ', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'propeller');
  const propeller = await model(page).locator('canvas').screenshot();
  expect(aircraft.equals(propeller)).toBe(false);
  await model(page).getByRole('button', { name: '1/4回転ずつ見る', exact: true }).click();
  expect(propeller.equals(await model(page).locator('canvas').screenshot())).toBe(false);
  await levels(page).getByRole('button', { name: '3 ブレード', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'blade');
  await model(page).getByRole('button', { name: 'ペラスパー', exact: true }).click();
  await expect(model(page).locator('.aircraft-part-explanation')).toContainText('管状');
  await levels(page).getByRole('button', { name: '4 断面と内部', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'section');
  await expect(model(page).getByRole('button', { name: 'ウェブ', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('opening the second skin and selecting parts makes internal relationships inspectable', async ({
  page,
}) => {
  await page.goto('/#library/textbook/web/1');
  await page.getByRole('button', { name: '機体と部材を3Dで見る', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'section');
  const canvas = model(page).locator('canvas');
  const opened = await canvas.screenshot();
  await model(page).getByRole('button', { name: '外皮を閉じる', exact: true }).click();
  await expect(model(page).getByRole('slider', { name: /underを開く/ })).toHaveValue('0');
  const closed = await canvas.screenshot();
  expect(opened.equals(closed)).toBe(false);
  await model(page).getByRole('button', { name: '外皮を開く', exact: true }).click();
  await expect(model(page).getByRole('slider', { name: /underを開く/ })).toHaveValue('0.85');
  await model(page).getByRole('button', { name: 'under 外皮', exact: true }).click();
  await expect(model(page).locator('.aircraft-part-explanation')).toContainText('フランジ');
  await canvas.focus();
  const before = await canvas.screenshot();
  await page.keyboard.press('ArrowRight');
  expect(before.equals(await canvas.screenshot())).toBe(false);
  await page.getByRole('button', { name: 'ビジュアルを拡大', exact: true }).click();
  const enlarged = page.getByRole('dialog');
  await expect(enlarged.locator('[data-aircraft-view]')).toHaveAttribute(
    'data-aircraft-view',
    'section',
  );
  await expect(enlarged.getByRole('button', { name: 'under 外皮', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(enlarged.getByRole('slider', { name: /underを開く/ })).toHaveValue('0.85');
  await enlarged.getByRole('button', { name: '本文に戻る', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'section');
  await expect(
    model(page).getByRole('button', { name: 'under 外皮', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '工程アニメーション', exact: true }).click();
  await expect(page.getByLabel('工程図の手順', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: '機体と部材を3Dで見る', exact: true }).click();
  await levels(page).getByRole('button', { name: '1 機体全体', exact: true }).click();
  await expect(model(page)).toHaveAttribute('data-aircraft-view', 'aircraft');
  await expect(page.locator('#book-section-web-1 .book-section-title')).toHaveText(
    'upperを支え、桁を固定する',
  );
});

test('a narrow screen keeps the model controls usable and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#library/textbook/overview/0');
  await page.getByRole('button', { name: 'ビジュアルを拡大', exact: true }).click();
  await levels(page).getByRole('button', { name: '2 プロペラ', exact: true }).click();
  await model(page).getByRole('button', { name: 'プロペラの回転を見る', exact: true }).click();
  await expect(
    model(page).getByRole('button', { name: 'プロペラの回転を見る', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await levels(page).getByRole('button', { name: '4 断面と内部', exact: true }).click();
  await model(page).getByRole('button', { name: '外皮を閉じる', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const smallButtons = await model(page)
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => button.getBoundingClientRect().height < 44)
        .map((button) => button.textContent),
    );
  expect(smallButtons).toEqual([]);
});
