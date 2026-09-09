import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('standard wiki exists without an import and the monitor follows reading in both directions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#library');
  await expect(page.getByRole('heading', { name: 'プロペラ製作Wiki', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /初期プロペラWiki|Wiki下書き.*取り込む/ }),
  ).toHaveCount(0);
  await page
    .getByLabel('製作工程の階層')
    .getByRole('link', { name: '外皮積層・真空引き', exact: true })
    .click();
  await expect(page).toHaveURL(/library\/propeller\/skin-lamination/);
  const monitor = page.getByLabel('工程解説モニター', { exact: true });
  await page.locator('#pw-bagging').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const target = document.getElementById('pw-bagging')!;
    window.scrollBy(0, target.getBoundingClientRect().top - 160);
  });
  await expect(monitor.getByRole('heading')).toHaveText('バギングと真空引き');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(monitor.getByRole('heading')).toHaveText('外皮の積層構成');
  await page.reload();
  await expect(page.locator('.pw-article-header h2')).toHaveText('外皮積層・真空引き');
  await page.getByLabel('プロペラWikiを検索').fill('ない工程999');
  await expect(page.getByText('一致するページがありません。')).toBeVisible();
  await page.getByLabel('Wiki検索をクリア').click();
  await expect(page.getByLabel('製作工程の階層').getByRole('link')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('monitor can pause, seek, drag, minimize and reset without changing the page', async ({
  page,
}) => {
  await page.goto('/#library');
  const monitor = page.getByLabel('工程解説モニター', { exact: true });
  await page.getByLabel('解説アニメーションを一時停止').click();
  const slider = page.getByLabel('解説アニメーションの再生位置');
  await slider.fill('500');
  await expect(slider).toHaveValue('500');
  const before = (await monitor.boundingBox())!;
  const handle = page.getByLabel('モニターを移動（ドラッグまたは矢印キー）');
  await handle.focus();
  await handle.press('ArrowLeft');
  const after = (await monitor.boundingBox())!;
  expect(after.x).toBe(before.x - 24);
  const dragBox = (await handle.boundingBox())!;
  await page.mouse.move(dragBox.x + 30, dragBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(dragBox.x - 100, dragBox.y - 40, { steps: 5 });
  await page.mouse.up();
  expect((await monitor.boundingBox())!.x).toBeLessThan(after.x);
  await page.getByLabel('モニターを最小化').click();
  await expect(monitor.locator('svg[role="img"]')).toHaveCount(0);
  await page.getByLabel('モニターを展開').click();
  await page.getByLabel('モニターを定位置に戻す').click();
  expect((await monitor.boundingBox())!.x).toBe(before.x);
});

test('mobile tree, touch movement, reduced motion and accessibility', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/#library');
  await expect(page.getByLabel('解説アニメーションを再生')).toBeVisible();
  await page.getByRole('button', { name: 'ページツリー', exact: true }).click();
  await page
    .getByLabel('製作工程の階層')
    .getByRole('link', { name: 'スピナーの製作', exact: true })
    .click();
  await expect(page.locator('.pw-article-header h2')).toHaveText('スピナーの製作');
  const handle = page.getByLabel('モニターを移動（ドラッグまたは矢印キー）');
  const bounds = (await handle.boundingBox())!;
  const monitor = page.getByLabel('工程解説モニター', { exact: true });
  const start = (await monitor.boundingBox())!;
  expect(start.width).toBe(340);
  expect(start.height).toBeLessThanOrEqual(230);
  expect(start.width / start.height).toBeGreaterThan(1.45);
  for (const button of await monitor.getByRole('button').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: '.verification/propeller-mobile-wide.png' });
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: bounds.x + 20, y: bounds.y + 20 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: bounds.x + 50, y: bounds.y - 80 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await monitor.boundingBox())!.y).toBeLessThan(start.y);
  await page.getByLabel('モニターを最小化').click();
  await page.screenshot({ path: '.verification/propeller-mobile.png', fullPage: false });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('signed-out visitors never request private sources, and recorded knowledge remains accessible', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/propeller_wiki_sources|propeller-wiki-media/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto('/#library');
  await page.getByRole('region', { name: 'この工程の一次資料' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'ログインして一次資料を読む' })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByLabel('モニターを最小化').click();
  await page.getByRole('button', { name: '記録から作ったWiki' }).click();
  await expect(page.locator('.wiki-row')).toHaveCount(3);
  await page.locator('.wiki-row-main').first().click();
  await expect(page.getByRole('button', { name: '編集', exact: true }).first()).toBeVisible();
});
