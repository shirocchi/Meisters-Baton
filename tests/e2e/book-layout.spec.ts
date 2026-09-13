import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BookSources } from '../../src/domain/bookSources';

// Synthetic text only: navigation must not depend on the private Discord archive.
const sources: BookSources = {
  version: 1,
  stages: {
    web: {
      intro: '画面の読み位置を検証するための架空教材です。',
      practice: ['support', 'spar'].map((stepId, index) => ({
        id: `synthetic-layout-${stepId}`,
        stepId,
        status: 'prototype',
        title: `検証用の本文 ${index + 1}`,
        paragraphs: [
          'この文章は、図と本文を読みながら現在位置を確かめるための架空記録です。左の全体工程と右の工程内目次は、それぞれ異なる範囲を案内します。',
          '本文を下へ読み進めたときは、現在読んでいる手順が目次にも示されます。目次から戻ったときは、その段落からキーボードでも読み続けます。',
        ],
        actions: ['本文の見出しと、選択された工程図の手順を照合します。'],
        check: '画面の移動を確かめるための例です。製造条件や合否は示していません。',
        sources: [
          {
            messageId: `synthetic-layout-source-${index}`,
            date: '2026-01-15',
            url: 'https://example.com/synthetic-layout-observation',
          },
        ],
        media: [],
      })),
    },
  },
};

// getByRole excludes the CSS-hidden copies used by the compact modal layout.
const chapterNav = (page: Page) =>
  page.getByRole('navigation', { name: '教科書の章', exact: true });
const outline = (page: Page) =>
  page.getByRole('navigation', { name: 'この工程の目次', exact: true });
const article = (page: Page) => page.getByRole('article', { name: '教科書の本文', exact: true });
const visual = (page: Page) =>
  page.getByRole('complementary', { name: '工程を目で見る', exact: true });
const anchor = (page: Page, id: string) => article(page).locator(`[data-reading-anchor="${id}"]`);

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) => route.fulfill({ json: sources }));
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('wide reading keeps the whole-process rail and chapter outline outside the illustrated spread', async ({
  page,
}, testInfo) => {
  await page.goto('/#library/textbook/web/1');
  await expect(article(page).getByRole('heading', { level: 1 })).toHaveText(
    'upperを支え、桁を固定する',
  );
  await expect(chapterNav(page)).toHaveCount(1);
  await expect(outline(page)).toHaveCount(1);
  await expect(chapterNav(page).getByRole('button')).toHaveCount(7);
  await expect(chapterNav(page).getByRole('button', { name: /04 内部部材を組む/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(outline(page).getByRole('button', { name: /^4\.1 / })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const [left, illustration, copy, right] = await Promise.all([
    box(chapterNav(page)),
    box(visual(page)),
    box(article(page)),
    box(outline(page)),
  ]);
  expect(left.x + left.width).toBeLessThanOrEqual(illustration.x + 1);
  expect(illustration.x + illustration.width).toBeLessThanOrEqual(copy.x + 1);
  expect(copy.x + copy.width).toBeLessThanOrEqual(right.x + 1);
  expect(illustration.width).toBeGreaterThan(400);
  expect(copy.width).toBeGreaterThan(450);
  expect(Math.abs(illustration.y - copy.y)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);

  await outline(page).getByRole('button', { name: /^01\s/ }).click();
  await expect(anchor(page, 'step-0')).toBeFocused();
  const [leftAfter, visualAfter, rightAfter] = await Promise.all([
    box(chapterNav(page)),
    box(visual(page)),
    box(outline(page)),
  ]);
  expect(leftAfter.y).toBeGreaterThanOrEqual(0);
  expect(leftAfter.y).toBeLessThan(80);
  expect(rightAfter.y).toBeGreaterThanOrEqual(0);
  expect(rightAfter.y).toBeLessThan(80);
  expect(visualAfter.y).toBeGreaterThanOrEqual(0);
  expect(visualAfter.y).toBeLessThan(80);
  await page.screenshot({ path: testInfo.outputPath('wide-four-column-reading.png') });
});

test('chapter-outline clicks and ordinary reading scroll keep the active passage and diagram aligned', async ({
  page,
}) => {
  await page.goto('/#library/textbook/web/1');
  const steps = page.getByLabel('工程図の手順', { exact: true });
  const targets = [
    { name: /^01\s/, id: 'step-0', value: '0' },
    { name: /^02\s/, id: 'step-1', value: '1' },
    { name: '理解を確かめる', id: 'review' },
    { name: '背景と考え方', id: 'intro' },
  ];
  for (const target of targets) {
    const button = outline(page).getByRole('button', { name: target.name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'location');
    await expect(outline(page).locator('[aria-current="location"]')).toHaveCount(1);
    await expect(anchor(page, target.id)).toBeFocused();
    if (target.value) await expect(steps).toHaveValue(target.value);
    await expect(page).toHaveURL(/#library\/textbook\/web\/1$/);
  }

  await anchor(page, 'step-1').evaluate((element) =>
    element.scrollIntoView({ block: 'start', behavior: 'instant' }),
  );
  await expect(outline(page).getByRole('button', { name: /^02\s/ })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(steps).toHaveValue('1');
  await anchor(page, 'intro').evaluate((element) =>
    element.scrollIntoView({ block: 'start', behavior: 'instant' }),
  );
  await expect(
    outline(page).getByRole('button', { name: '背景と考え方', exact: true }),
  ).toHaveAttribute('aria-current', 'location');
});

test('section changes and browser history restore both levels of navigation', async ({ page }) => {
  await page.goto('/#library/textbook/web/1');
  await outline(page)
    .getByRole('button', { name: /^4\.2 / })
    .click();
  await expect(page).toHaveURL(/#library\/textbook\/web\/2$/);
  await expect(article(page).getByRole('heading', { level: 1 })).toHaveText(
    'ウェブ材と治具を準備する',
  );
  await expect(outline(page).getByRole('button', { name: /^4\.2 / })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(outline(page).getByRole('button', { name: /^03\s/ })).toBeVisible();
  await expect(outline(page).getByRole('button', { name: /^01\s/ })).toHaveCount(0);
  await chapterNav(page)
    .getByRole('button', { name: /01 型をつくる/ })
    .click();
  await expect(page).toHaveURL(/#library\/textbook\/mold\/0$/);
  await expect(outline(page).getByRole('heading', { name: '目次', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#library\/textbook\/web\/2$/);
  await expect(chapterNav(page).getByRole('button', { name: /04 内部部材を組む/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(outline(page).getByRole('button', { name: /^4\.2 / })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goBack();
  await expect(page).toHaveURL(/#library\/textbook\/web\/1$/);
  await expect(outline(page).getByRole('button', { name: /^4\.1 / })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('compact navigation retains both hierarchies and closes after a destination is chosen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/#library/textbook/web/1');
  await expect(chapterNav(page)).toHaveCount(0);
  await expect(outline(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^全体の工程 / }).click();
  const processDialog = page.getByRole('dialog', { name: '全体の工程', exact: true });
  await expect(processDialog).toBeVisible();
  await processDialog.getByRole('button', { name: /02 外皮を積層する/ }).click();
  await expect(processDialog).toHaveCount(0);
  await expect(page).toHaveURL(/#library\/textbook\/skin\/0$/);

  await page.getByRole('button', { name: /^この工程の目次 / }).click();
  const sectionDialog = page.getByRole('dialog', { name: 'この工程の目次', exact: true });
  await expect(sectionDialog).toBeVisible();
  await sectionDialog.getByRole('button', { name: /^2\.2 / }).click();
  await expect(sectionDialog).toHaveCount(0);
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await expect(article(page).getByRole('heading', { level: 1 })).toHaveText(
    'コアを挟んで外皮をつくる',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: /^この工程の目次 / }).click();
  await expect(sectionDialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await sectionDialog.getByRole('button', { name: /^04\s/ }).click();
  await expect(sectionDialog).toHaveCount(0);
  await expect(anchor(page, 'step-3')).toBeFocused();
  await expect(
    anchor(page, 'step-3').getByRole('heading', { name: '内側のCFRPを±45°で重ねる', exact: true }),
  ).toBeInViewport();
  await page.getByRole('button', { name: /^この工程の目次 / }).click();
  await expect(sectionDialog.getByRole('button', { name: /^04\s/ })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await sectionDialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(sectionDialog).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('compact-reading-position.png') });
});
