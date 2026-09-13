import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { BookSources } from '../../src/domain/bookSources';

// Synthetic text only. The reading flow must work without the private Discord archive.
const sources: BookSources = {
  version: 1,
  stages: {
    mold: {
      intro: '検証用の架空教材です。実際の製造条件を示していません。',
      practice: [
        {
          id: 'synthetic-editorial-observation',
          stepId: 'sand',
          status: 'prototype',
          title: '検証用の本文の読み方',
          paragraphs: [
            'これは検証用の架空記録です。研磨という言葉を本文の中で調べ、読んでいた場所に戻ります。',
          ],
          actions: ['分からない言葉の説明を開き、本文の続きを読みます。'],
          check: 'この例は画面操作の検証用です。作業条件や合否を示していません。',
          sources: [
            {
              messageId: 'synthetic-editorial-source',
              date: '2026-01-15',
              url: 'https://example.com/synthetic-editorial-observation',
            },
          ],
          media: [],
        },
        {
          id: 'mold-surface',
          stepId: 'surfacer',
          status: 'prototype',
          title: '検証用の別節にある表面観察',
          paragraphs: ['これは別の節にある本文への移動を確かめるための架空記録です。'],
          actions: ['参照先の章と節を確認し、対象の記録を読みます。'],
          check: 'この架空記録は移動の検証用です。製造条件は示していません。',
          sources: [
            {
              messageId: 'synthetic-editorial-surface',
              date: '2026-01-16',
              url: 'https://example.com/synthetic-editorial-surface',
            },
          ],
          media: [],
        },
      ],
    },
  },
};

async function openDictionary(page: Page) {
  await page.getByRole('button', { name: 'ことばを調べる', exact: true }).click();
  return page.getByRole('dialog', { name: 'ことばを調べる', exact: true });
}

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) => route.fulfill({ json: sources }));
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('a reader entering mid-chapter can look up a word without losing the passage', async ({
  page,
}) => {
  await page.goto('/#library/textbook/mold/2');
  const observation = page.locator('[data-source-id="synthetic-editorial-observation"]');
  const word = observation.getByRole('button', { name: '研磨の意味を読む', exact: true });
  await word.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(word).toBeInViewport();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(100);
  await word.click();

  const definition = page.getByRole('dialog', { name: '研磨の意味', exact: true });
  await expect(definition).toBeVisible();
  await expect(definition.locator('.book-word-short')).not.toBeEmpty();
  await expect(page).toHaveURL(/#library\/textbook\/mold\/2$/);
  await definition.getByRole('button', { name: '読んでいた本文に戻る', exact: true }).click();

  await expect(definition).toHaveCount(0);
  await expect(word).toBeInViewport();
  await expect(word).toBeFocused();
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore))
    .toBeLessThanOrEqual(1);
});

test('a reader can find a kanji term by its reading and narrow the dictionary by chapter', async ({
  page,
}) => {
  await page.goto('/#library/textbook/mold/2');
  const dictionary = await openDictionary(page);
  const query = dictionary.getByRole('textbox', { name: '用語を検索', exact: true });
  await query.fill('けんま');
  const result = dictionary.locator('.book-word-list').getByRole('button', { name: /^研磨/ });
  await expect(result).toBeVisible();
  await dictionary.getByLabel('用語の章', { exact: true }).selectOption('mold');
  await expect(result).toBeVisible();
  await dictionary.getByLabel('用語の章', { exact: true }).selectOption('skin');
  await expect(dictionary.getByRole('status')).toHaveText('0語');
  await expect(dictionary).toContainText('一致する言葉がありません');
  await dictionary.getByLabel('用語の章', { exact: true }).selectOption('all');
  await expect(result).toBeVisible();
  await result.click();

  const definition = page.getByRole('dialog', { name: '研磨の意味', exact: true });
  await expect(definition.locator('.book-word-reading')).toContainText('けんま');
  await definition.getByRole('button', { name: '用語一覧に戻る', exact: true }).click();
  await expect(query).toHaveValue('けんま');
  await expect(result).toBeVisible();
});

test('a section introduces its question before the record and lets readers reveal an explanation', async ({
  page,
}) => {
  await page.goto('/#library/textbook/mold/2');
  const narrative = page.locator('.book-narrative');
  const understanding = page.locator('.book-understanding');
  const observation = page.locator('[data-source-id="synthetic-editorial-observation"]');
  await expect(narrative).toBeVisible();
  await expect(narrative.locator('p').first()).not.toBeEmpty();
  expect(
    await narrative.evaluate(
      (element) =>
        !!(
          element.compareDocumentPosition(
            document.querySelector('[data-source-id="synthetic-editorial-observation"]')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await expect(observation).toBeAttached();
  const explanation = understanding.locator('details');
  await expect(explanation).not.toHaveAttribute('open');
  await expect(explanation.locator('p').first()).toBeHidden();
  await explanation.locator('summary').click();
  await expect(explanation).toHaveAttribute('open', '');
  await expect(explanation.locator('p').first()).toBeVisible();
  await expect(explanation.locator('p').first()).not.toBeEmpty();
});

test('the dictionary stays readable on a phone and can be closed from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#library/textbook/mold/2');
  const dictionary = await openDictionary(page);
  await dictionary.getByRole('textbox', { name: '用語を検索', exact: true }).fill('けんま');
  await dictionary.locator('.book-word-list').getByRole('button', { name: /^研磨/ }).click();
  const definition = page.getByRole('dialog', { name: '研磨の意味', exact: true });
  await expect(definition).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bounds = await definition.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const audit = await new AxeBuilder({ page })
    .include('.book-dictionary')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(definition).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ことばを調べる', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/#library\/textbook\/mold\/2$/);
});

test('the core comparison opens the cross-section drawing and returns to the same passage', async ({
  page,
}) => {
  await page.goto('/#library/textbook/skin/2');
  const openComparison = page.getByRole('button', {
    name: 'コアの継ぎ目を比べる図を開く',
    exact: true,
  });
  await openComparison.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(openComparison).toBeInViewport();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await openComparison.click();

  const comparison = page.getByRole('dialog', { name: 'コアの継ぎ目を比べる', exact: true });
  const drawing = comparison.getByRole('img', {
    name: 'コアの継ぎ目の断面。並ぶ状態と、乗り上げて段差を生む状態を比較し、前縁のコアを薄くする位置を示す概念図。',
    exact: true,
  });
  await expect(drawing).toBeVisible();
  await expect(drawing.getByText('端が並ぶ', { exact: true })).toBeVisible();
  await expect(drawing.getByText('片方が乗り上げる', { exact: true })).toBeVisible();
  await expect(drawing.getByText('重なりで段差ができる', { exact: true })).toBeVisible();
  expect(await drawing.locator('path').count()).toBeGreaterThan(0);
  await comparison.getByRole('button', { name: '本文に戻る', exact: true }).click();

  await expect(comparison).toHaveCount(0);
  await expect(openComparison).toBeInViewport();
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore))
    .toBeLessThanOrEqual(1);
});

test('a narrative reference opens the correct section and scrolls to its source record', async ({
  page,
}) => {
  await page.goto('/#library/textbook/mold/3');
  const reference = page.locator('.book-narrative-records').getByRole('link', {
    name: '第1章 1.2 · 検証用の別節にある表面観察',
    exact: true,
  });
  await expect(reference).toHaveAttribute('href', '#library/textbook/mold/2');
  await reference.click();

  await expect(page).toHaveURL(/#library\/textbook\/mold\/2$/);
  const record = page.locator('#book-record-mold-surface');
  await expect(record).toBeInViewport();
  await expect(
    record.getByRole('heading', { name: '検証用の別節にある表面観察', exact: true }),
  ).toBeInViewport();
  await expect(record).toContainText('別の節にある本文への移動を確かめるための架空記録');
});

test('choosing a term from the end of the dictionary starts at its definition heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#library/textbook/mold/2');
  const dictionary = await openDictionary(page);
  const last = dictionary.locator('.book-word-list button').last();
  await last.scrollIntoViewIfNeeded();
  expect(await dictionary.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await last.click();
  const heading = page.getByRole('dialog').locator('.modal-head h2');
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollTop)).toBe(0);
});

test('the finishing rehearsal preserves three pieces and removes only their carrying tape', async ({
  page,
}) => {
  await page.goto('/#library/textbook/finish/4');
  const visual = page.getByRole('complementary', { name: '工程を目で見る' });
  await expect(visual.locator('[data-masking-step="1"]')).toBeVisible();
  await visual.getByRole('button', { name: '2. 持ち上げる', exact: true }).click();
  await expect(visual.locator('[data-masking-step="2"]')).toBeVisible();
  await visual.getByRole('button', { name: '4. A だけ外す', exact: true }).click();
  await expect(visual.locator('[data-masking-step="4"]')).toBeVisible();
  await expect(visual.locator('[data-masking-pieces="B1 B2 B3"]')).toHaveCount(1);
  await expect(visual).toContainText('図案の B を紙に残し');
});

test('the masking drawing remains legible by scrolling inside a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#library/textbook/finish/2');
  await page.getByRole('button', { name: '運ぶテープと残すテープの図を開く', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '運ぶテープと残すテープ', exact: true });
  const region = dialog.getByRole('region', {
    name: '図案転写の拡大図。左右にスクロールできます',
    exact: true,
  });
  await expect(region).toBeVisible();
  const widths = await region.evaluate((element) => ({
    inner: element.scrollWidth,
    outer: element.clientWidth,
    svg: element.querySelector('svg')!.getBoundingClientRect().width,
  }));
  expect(widths.inner).toBeGreaterThan(widths.outer);
  expect(widths.svg).toBeGreaterThanOrEqual(560);
  await region.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
