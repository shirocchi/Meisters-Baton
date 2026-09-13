import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BookSources } from '../../src/domain/bookSources';

// Synthetic observations and artwork: no private source text or photographs enter the tests.
const photoCaption = '検証用の架空写真：コアの位置を指して照合する';
const sourceUrl = 'https://example.com/textbook-test-observation';
const sources: BookSources = {
  version: 1,
  stages: {
    skin: {
      intro: '検証用の架空教材です。製造条件を示すものではありません。',
      practice: [
        {
          id: 'synthetic-core-observation',
          stepId: 'core',
          status: 'prototype',
          title: '検証用のコア配置の観察',
          paragraphs: [
            'これは画面の読み方を確かめるための架空の観察記録です。写真の位置と図の位置を見比べます。',
          ],
          actions: ['図のコアを見つける。', '写真の位置を指して、図と対応する場所を説明する。'],
          check: '図と写真の対応を説明できるかを確かめます。製造の合否は判定しません。',
          sources: [{ messageId: 'synthetic-observation', date: '2026-01-15', url: sourceUrl }],
          media: [
            {
              filename: 'synthetic-core.jpg',
              caption: photoCaption,
              messageId: 'synthetic-observation',
              date: '2026-01-15',
              url: sourceUrl,
              localUrl: '/__textbook/media/synthetic-core',
            },
          ],
        },
      ],
    },
  },
};
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#ede5d4"/><path d="M100 230 Q390 60 700 210 L680 260 Q390 130 120 275Z" fill="#a97837"/><text x="40" y="360" font-size="24" fill="#242b2c">SYNTHETIC TEST IMAGE</text></svg>`;

async function mockSources(page: Page) {
  await page.route('**/__textbook/sources', (route) => route.fulfill({ json: sources }));
  await page.route('**/__textbook/media/synthetic-core', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: artwork }),
  );
}

const steps = (page: Page) => page.getByLabel('工程図の手順', { exact: true });
const chapterNav = (page: Page) => page.getByRole('navigation', { name: '教科書の章' });
const pagination = (page: Page) => page.getByRole('navigation', { name: '本のページをめくる' });

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.beforeEach(async ({ page }) => {
  await mockSources(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('introduction and chapter deep links connect the reading position to the relevant process', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#library');
  await expect(page.getByRole('heading', { name: 'つくるものを知る', exact: true })).toBeVisible();
  await expect(chapterNav(page).getByRole('button')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'この本の読み方', exact: true })).toBeVisible();
  await expect(page.locator('.book-visual canvas')).toBeVisible();

  await page.goto('/#library/textbook/skin/2');
  await expect(
    page.getByRole('heading', { name: 'コアを挟んで外皮をつくる', exact: true }),
  ).toBeVisible();
  await expect(steps(page)).toHaveValue('2');
  await expect(page.locator('.book-look strong')).toHaveText('バルサのコアを位置決めする');
  await page
    .locator('.book-step[data-step="3"]')
    .evaluate((section) => section.scrollIntoView({ block: 'start' }));
  await expect(steps(page)).toHaveValue('3');
  await expect(page.locator('.book-look strong')).toHaveText('内側のCFRPを±45°で重ねる');

  await steps(page).selectOption('0');
  await expect(page).toHaveURL(/#library\/textbook\/skin\/1$/);
  await expect(page.getByRole('heading', { name: '含浸と外側の積層', exact: true })).toBeVisible();
  await expect(steps(page)).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('playing one action stops on that action without silently moving the reader to another step', async ({
  page,
}) => {
  await page.goto('/#library/textbook/skin/2');
  await expect(steps(page)).toHaveValue('2');
  await page.getByRole('button', { name: 'この動作を再生', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '工程の再生を一時停止', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByLabel('この動作の進み具合').inputValue()))
    .toBeGreaterThan(0.9);
  await expect(page.getByRole('button', { name: 'この動作を再生', exact: true })).toBeVisible();
  await expect(steps(page)).toHaveValue('2');
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await expect(page.locator('.book-look strong')).toHaveText('バルサのコアを位置決めする');
});

test('reduced motion shows the same action endpoint and keeps its explanation selected', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#library/textbook/skin/2');
  await page.getByRole('button', { name: 'この動作の完了状態を表示', exact: true }).click();
  await expect(steps(page)).toHaveValue('2');
  await expect(page.getByLabel('この動作の進み具合')).toHaveValue('1');
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await expect(page.getByRole('button', { name: '工程の再生を一時停止', exact: true })).toHaveCount(
    0,
  );
});

test('a dated observation retains its source and photograph when enlarged', async ({ page }) => {
  await page.goto('/#library/textbook/skin/2');
  const observation = page.locator('[data-source-id="synthetic-core-observation"]');
  await expect(observation).toContainText('2026-01-15 の記録から · 試作時の記録');
  await observation
    .getByRole('button', { name: `写真を拡大：${photoCaption}`, exact: true })
    .scrollIntoViewIfNeeded();
  await expect(observation.getByRole('img', { name: photoCaption })).toBeVisible();
  await expect
    .poll(
      async () =>
        await observation
          .getByRole('img', { name: photoCaption, exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(observation.locator('.book-actions li')).toHaveCount(2);
  await observation
    .getByRole('button', { name: `写真を拡大：${photoCaption}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: photoCaption, exact: true });
  await expect(dialog.getByRole('img', { name: photoCaption })).toBeVisible();
  await expect(dialog).toContainText('2026-01-15 の製作記録');
  await expect(dialog.getByRole('link', { name: 'Discordの原記録', exact: true })).toHaveAttribute(
    'href',
    sourceUrl,
  );
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
});

test('page turns cross chapters of different lengths and browser back restores the visible page', async ({
  page,
}) => {
  await page.goto('/#library/textbook/flange/0');
  await pagination(page).getByRole('button', { name: '前のページ', exact: true }).click();
  await expect(page).toHaveURL(/#library\/textbook\/skin\/5$/);
  await expect(
    page.getByRole('heading', { name: '章末演習・次の工程へ渡す', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.book-running')).toContainText('第2章');
  await pagination(page).getByRole('button', { name: '次のページ', exact: true }).click();
  await expect(page).toHaveURL(/#library\/textbook\/flange\/0$/);
  await expect(page.getByRole('heading', { name: 'この章を読む前に', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#library\/textbook\/skin\/5$/);
  await expect(
    page.getByRole('heading', { name: '章末演習・次の工程へ渡す', exact: true }),
  ).toBeVisible();
  await expect(chapterNav(page).getByRole('button', { name: /02 外皮を積層する/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.reload();
  await expect(page.locator('.book-running')).toContainText('第2章');
  await expect(
    page.getByRole('heading', { name: '章末演習・次の工程へ渡す', exact: true }),
  ).toBeVisible();
});

test('a bookmark survives reload and returns to its chapter and section from the contents', async ({
  page,
}) => {
  await page.goto('/#library/textbook/skin/2');
  await page.getByRole('button', { name: 'しおり', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'しおりを挟みました', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'しおりを挟みました', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await chapterNav(page)
    .getByRole('button', { name: /01 型をつくる/ })
    .click();
  await page.getByRole('button', { name: '目次', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /しおりのページへ 外皮を積層する/ })
    .click();
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await expect(
    page.getByRole('heading', { name: 'コアを挟んで外皮をつくる', exact: true }),
  ).toBeVisible();
  await expect(steps(page)).toHaveValue('2');
});

test('phone reading opens the matching visual and returns to the same text without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.goto('/#library/textbook/skin/2');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const textStep = page.locator('.book-step[data-step="3"]');
  await textStep.getByRole('button', { name: 'この動きを図で見る', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '工程を目で見る', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('工程図の手順', { exact: true })).toHaveValue('3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: '本文に戻る', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    textStep.getByRole('heading', { name: '内側のCFRPを±45°で重ねる', exact: true }),
  ).toBeInViewport();
  await expect(page).toHaveURL(/#library\/textbook\/skin\/2$/);
  await page.screenshot({ path: testInfo.outputPath('textbook-phone.png') });
});

test('book controls have accessible names and readable contrast', async ({ page }, testInfo) => {
  await page.goto('/#library/textbook/skin/2');
  await expect(page.locator('[data-source-id="synthetic-core-observation"]')).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('.book-reader')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('textbook-spread.png'), fullPage: true });
});

test('a chapter ends with a paper rehearsal and an explanation to reveal after trying it', async ({
  page,
}) => {
  await page.goto('/#library/textbook/skin/5');
  const rehearsal = page.locator('.book-rehearsal');
  await expect(rehearsal).toContainText('章末演習 · 学習用に編集した練習');
  await expect(
    rehearsal.getByRole('heading', { name: '紙を重ね、外皮に残る3層を取り出す', exact: true }),
  ).toBeVisible();
  await expect(rehearsal).toContainText('紙7枚');
  await expect(rehearsal.locator('.book-actions li')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '章末演習の図', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await rehearsal.getByRole('button', { name: '演習で使う図を開く' }).click();
  const diagram = page.getByRole('dialog', { name: '工程を目で見る', exact: true });
  await diagram.getByRole('button', { name: '外皮に残る3層を確かめる', exact: true }).click();
  await expect(diagram.getByRole('img')).toHaveAccessibleName(/外側CF・バルサコア・内側CFの3層/);
  await diagram.getByRole('button', { name: '本文に戻る', exact: true }).click();
  const example = rehearsal.locator('.book-worked-example p');
  await expect(example).toBeHidden();
  await rehearsal.getByText('手を動かしたら、説明例と比べる', { exact: true }).click();
  await expect(example).toBeVisible();
  await expect(example).toContainText('凹型に触れていた外側のCF');
  await expect(rehearsal.locator('.book-observation')).toContainText(
    '紙を重ねても、しわや浮きの合否までは判断できません',
  );
  await expect(
    page.getByRole('button', { name: 'この工程の作業を記録する', exact: true }),
  ).toBeVisible();
});

test('an internal reference returns to the earlier chapter at its heading, without inheriting the old scroll', async ({
  page,
}) => {
  await page.goto('/#library/textbook/web/4');
  await page.locator('.book-page-footer').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await page
    .getByRole('link', { name: '第3章「underは、実際のウェブ上端から位置を写す」へ戻ります' })
    .click();
  await expect(page).toHaveURL(/#library\/textbook\/flange\/1$/);
  await expect(
    page.getByRole('heading', { name: '対象と位置を確認する', exact: true }),
  ).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
