import { expect, test, type Page } from '@playwright/test';

const toc = (page: Page) => page.getByRole('navigation', { name: '教材の目次', exact: true });
const section = (page: Page, id: string) => page.locator(`#book-section-${id}`);
const scene = (page: Page) => page.locator('.book-visual [data-process-stage]');
async function readStep(page: Page, id: string, step: number, fraction = 0) {
  await section(page, id)
    .locator(`[data-step="${step}"]`)
    .evaluate((el, fraction) => {
      const rect = el.getBoundingClientRect();
      window.scrollTo({
        top:
          window.scrollY +
          rect.top -
          Math.min(innerHeight * 0.35, 260) +
          rect.height * fraction +
          2,
        behavior: 'instant',
      });
    }, fraction);
}
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) =>
    route.fulfill({ json: { version: 1, stages: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('all 34 sections share one article and one contents hierarchy, with figure left of prose', async ({
  page,
}, info) => {
  await page.goto('/#library/textbook/web/1');
  await expect(page.locator('.book-story-section')).toHaveCount(34);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(toc(page)).toHaveCount(1);
  await expect(
    page.locator('.book-pagination, .book-section-rail, .book-process-rail'),
  ).toHaveCount(0);
  await expect(toc(page).getByRole('button', { name: /^4\.1 / })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const nav = (await toc(page).boundingBox())!;
  const visual = (await page.locator('.book-visual').boundingBox())!;
  const copy = (await page.locator('.book-copy').boundingBox())!;
  expect(nav.x + nav.width).toBeLessThanOrEqual(visual.x);
  expect(visual.x + visual.width).toBeLessThanOrEqual(copy.x);
  expect(visual.width).toBeGreaterThan(400);
  expect(copy.width).toBeGreaterThan(450);
  await page.screenshot({ path: info.outputPath('continuous-desktop.png') });
});

test('ordinary forward and reverse scrolling scrubs the matching action without changing other sections', async ({
  page,
}) => {
  await page.goto('/#library/textbook/skin/2');
  await readStep(page, 'skin-2', 2, 0.1);
  await expect(scene(page)).toHaveAttribute('data-process-step', '2');
  await expect
    .poll(async () => Number(await scene(page).getAttribute('data-process-phase')))
    .toBeGreaterThan(0.1);
  const early = Number(await scene(page).getAttribute('data-process-phase'));
  await readStep(page, 'skin-2', 2, 0.6);
  await expect
    .poll(async () => Number(await scene(page).getAttribute('data-process-phase')))
    .toBeGreaterThan(early + 0.4);
  await readStep(page, 'skin-2', 3, 0.25);
  await expect(scene(page)).toHaveAttribute('data-process-step', '3');
  await expect(toc(page).locator('[aria-current="location"]')).toHaveText(
    '内側のCFRPを±45°で重ねる',
  );
  await readStep(page, 'skin-2', 2, 0.1);
  await expect(scene(page)).toHaveAttribute('data-process-step', '2');
  await expect
    .poll(async () => Number(await scene(page).getAttribute('data-process-phase')))
    .toBeCloseTo(early, 1);
  await section(page, 'flange-0').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(scene(page)).toHaveAttribute('data-process-stage', 'flange');
  await expect(page).toHaveURL(/textbook\/flange\/0$/);
  await expect(page.locator('.book-story-section')).toHaveCount(34);
});

test('chapter links, browser history and reload restore the section in the same long page', async ({
  page,
}) => {
  await page.goto('/#library/textbook/web/1');
  await toc(page)
    .getByRole('button', { name: /^4\.2 / })
    .click();
  await expect(section(page, 'web-2').locator('.book-section-title')).toBeInViewport();
  await toc(page)
    .getByRole('button', { name: /01 型をつくる/ })
    .click();
  await toc(page)
    .getByRole('button', { name: /^1\.0 / })
    .click();
  await expect(page).toHaveURL(/textbook\/mold\/0$/);
  await page.goBack();
  await expect(page).toHaveURL(/textbook\/web\/2$/);
  await expect(section(page, 'web-2').locator('.book-section-title')).toBeInViewport();
  await page.reload();
  await expect(section(page, 'web-2').locator('.book-section-title')).toBeInViewport();
});

test('overview scroll moves from aircraft to propeller, blade and internal structure', async ({
  page,
}) => {
  await page.goto('/#library/textbook/overview/0');
  for (const view of ['aircraft', 'propeller', 'blade', 'section']) {
    await page
      .locator(`[data-view="${view}"]`)
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.locator('.book-visual .book-aircraft-context')).toHaveAttribute(
      'data-aircraft-view',
      view,
    );
  }
});

test('phone keeps a compact matching figure, uses the same contents and never overflows', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#library/textbook/web/1');
  await page.getByRole('button', { name: '目次', exact: true }).click();
  await toc(page)
    .getByRole('button', { name: /02 外皮を積層する/ })
    .click();
  await toc(page)
    .getByRole('button', { name: /^2\.2 / })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/textbook\/skin\/2$/);
  const step = section(page, 'skin-2').locator('[data-step="3"]');
  await step.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(scene(page)).toHaveAttribute('data-process-step', '3');
  await expect(page.locator('.book-visual')).toBeInViewport();
  await step.getByRole('button', { name: 'この動きを図で見る', exact: true }).click();
  await expect(page.getByRole('dialog').locator('[data-process-step]')).toHaveAttribute(
    'data-process-step',
    '3',
  );
  await page.getByRole('dialog').getByRole('button', { name: '本文に戻る', exact: true }).click();
  await expect(step.locator('h2')).toBeInViewport();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await step.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: info.outputPath('continuous-phone.png') });
});

test('reduced motion shows action endpoints while scrolling and disclosures survive section changes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#library/textbook/skin/2');
  await readStep(page, 'skin-2', 2, 0.1);
  await expect(scene(page)).toHaveAttribute('data-process-phase', '1');
  const example = section(page, 'skin-2').locator('.book-understanding details');
  await example.locator('summary').click();
  await section(page, 'web-1').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await section(page, 'skin-2').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(example).toHaveAttribute('open', '');
});
