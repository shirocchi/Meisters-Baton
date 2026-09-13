import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { connect, fixture } from './helpers/wikiFixture';
import type { WikiArchive, WikiAsset } from '../../src/domain/growiWiki';
import type { WikiEdit } from '../../src/domain/wikiWorkshop';
import { PROCESS_STEPS } from '../../src/components/atlas/processStages';

// Deliberately synthetic geometry. Production CAD and photographs stay out of the repository.
const packed = (values: number[]) => Buffer.from(new Uint16Array(values).buffer).toString('base64');
const parts = ['upper', 'under', 'spar', 'ribs', 'web-core', 'roving', 'belt'].map((group, i) => ({
  id: group,
  group,
  assembly: group === 'under' ? 'under' : 'upper',
  color: '#47515a',
  min: [0, i, 100],
  scale: [0.005, 0.001, 0.02],
  positions: packed([0, 0, 0, 65535, 0, 0, 0, 65535, 65535]),
  indices: packed([0, 1, 2]),
}));
const model = JSON.stringify({
  body: { parts },
  local: { parts },
  profile: {
    upper: [
      [0, 0],
      [0.5, 0.1],
      [1, 0],
    ],
    under: [
      [0, 0],
      [0.5, -0.03],
      [1, 0],
    ],
  },
});
const sha = createHash('sha256').update(model).digest('hex');
const modelAsset: WikiAsset = {
  id: 'test-model',
  name: '架空の模型',
  bytes: Buffer.byteLength(model),
  sha256: sha,
  contentType: 'application/json',
  url: '/atlas/model',
  downloadUrl: '/atlas/model',
  sourceSlug: `atlas-asset-${sha}`,
};
const readingSpace = Array.from(
  { length: 9 },
  (_, i) =>
    `検証用の説明 ${i + 1}。ここには実際の設計値を含めず、手順の読み進め方を確認するための文章を置きます。`,
).join('\n\n');
const overview = {
  ...fixture.pages[0],
  id: 'atlas-test-overview',
  title: 'ウェブ組み立て',
  path: '/ペラ/26代/ウェブ組み立て',
  body: `検証用の技術資料。\n\n## ウェブを立てる\n\n既存の作業手順を残す。\n\n${readingSpace}\n\n## 型の工程を読む\n\n[ウェブ治具の詳細](/ペラ/26代/ウェブ治具の詳細)\n\n${readingSpace}\n\n## 外皮の工程を読む\n\n![架空の工程写真](/attachment/test-image)\n\n${readingSpace}`,
  attachments: [modelAsset],
};
const processNames = [
  ['mold', '型を作る'],
  ['skin', '外皮積層'],
  ['flange', 'フランジ'],
  ['web', '内部部材'],
  ['join', '貼り合わせ'],
  ['finish', '仕上げ'],
] as const;
const processPages = processNames.map(([id, title]) => ({
  ...overview,
  id: `atlas-test-${id}`,
  title,
  path: `/ペラ/26代/${title}`,
  body: `検証用の${title}。\n\n## 工程の準備\n\n${readingSpace}\n\n## 次の作業\n\n${readingSpace}`,
  attachments: [],
}));
const detailPage = {
  ...overview,
  id: 'atlas-test-web-detail',
  title: 'ウェブ治具の詳細',
  path: '/ペラ/26代/ウェブ治具の詳細',
  body: `検証用の治具ページ。\n\n## 治具を合わせる\n\n${readingSpace}\n\n## 溝に差し込む\n\n${readingSpace}`,
  attachments: [],
};
const archive: WikiArchive = {
  ...fixture,
  pages: [...fixture.pages, overview, ...processPages, detailPage],
  atlas: {
    version: 1,
    modelAssetId: modelAsset.id,
    stages: [
      {
        id: 'overview',
        pageId: overview.id,
        number: '00',
        short: '全体像',
        model: 'blade',
        local: false,
        photoId: 'test-image',
        photoCaption: '架空の試験写真',
        sources: ['skin'],
        related: ['mold'],
        sections: [
          { heading: 'ウェブを立てる', stage: 'overview', step: 0 },
          { heading: '型の工程を読む', stage: 'mold', step: 2 },
          { heading: '外皮の工程を読む', stage: 'skin', step: 3, photoId: 'test-image' },
        ],
      },
      ...processNames.map(([id, short], index) => ({
        id,
        pageId: processPages[index].id,
        number: String(index + 1).padStart(2, '0'),
        short,
        model: id === 'mold' ? ('mold' as const) : ('blade' as const),
        local: false,
        photoId: 'test-image',
        photoCaption: '架空の試験写真',
        sources: ['skin'],
        related: ['overview'],
        sections: [
          { heading: '工程の準備', step: 0 },
          { heading: '次の作業', step: 2 },
        ],
      })),
    ],
    details: [
      {
        pageId: detailPage.id,
        stageId: 'web',
        step: 1,
        sections: [
          { heading: '治具を合わせる', step: 1 },
          { heading: '溝に差し込む', step: 2 },
        ],
        sources: ['skin'],
      },
    ],
  },
};
async function setup(page: Page) {
  await connect(page, archive);
  const edits: WikiEdit[] = [];
  await page.route('**/rest/v1/propeller_wiki_sources*', (route) =>
    route.fulfill({
      json: [
        {
          content:
            new URL(route.request().url()).searchParams.get('slug') ===
            `eq.${modelAsset.sourceSlug}`
              ? { encoding: 'base64', data: Buffer.from(model).toString('base64') }
              : archive,
        },
      ],
    }),
  );
  await page.route('**/rest/v1/wiki_page_edits*', (route) => route.fulfill({ json: edits }));
  await page.route('**/rest/v1/rpc/save_wiki_page', (route) => {
    const p = route.request().postDataJSON(),
      old = edits.find((e) => e.page_id === p.p_page_id);
    const edit: WikiEdit = {
      page_id: p.p_page_id,
      title: p.p_title,
      body: p.p_body,
      version: (old?.version ?? 0) + 1,
      updated_at: '2026-09-10',
      author: '試験メンバー',
      reason: p.p_reason,
      events: p.p_events,
      media: p.p_media,
    };
    if (old) edits.splice(edits.indexOf(old), 1, edit);
    else edits.push(edit);
    return route.fulfill({ json: edit });
  });
  return edits;
}
async function readSection(page: Page, title: string) {
  await page.getByRole('article', { name: 'Wiki本文' }).evaluate((root, title) => {
    const heading = Array.from(root.querySelectorAll<HTMLElement>('[data-wiki-heading]')).find(
      (element) => element.childNodes[0]?.textContent?.trim() === title,
    );
    if (!heading) throw new Error(`Missing fixture heading: ${title}`);
    heading.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, title);
}
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
// Tests use synthetic archives; never load a developer's private textbook sources.
test.beforeEach(async ({ page }) => {
  await page.route('**/__textbook/sources', (route) =>
    route.fulfill({ json: { version: 1, stages: {} } }),
  );
});

test.describe('production Wiki atlas', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires Supabase fixtures');

  test('opens the latest atlas, explains materials and mold stages, and keeps old Wiki links', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page);
    await page.goto('/#library/atlas/overview');
    await expect(page.locator('.atlas-copy h2').first()).toHaveText('ウェブ組み立て');
    await expect(page.locator('.atlas-model canvas')).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.wiki-atlas')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByRole('button', { name: '部材を知る', exact: true }).click();
    await page.locator('[data-legend] [data-group="spar"]').click();
    await expect(page.locator('[data-detail]')).toContainText('ペラスパー');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '組み合わせを見る', exact: true }).click();
    await expect(page.locator('[data-control="explode"]')).toHaveValue('0');
    await page.getByRole('button', { name: '模型を大きく表示' }).click();
    await expect(page.getByRole('dialog').locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.locator('.atlas-stages').getByRole('link', { name: '01 型を作る' }).click();
    for (let i = 0; i < PROCESS_STEPS.mold.length; i++) {
      await page.getByLabel('工程図の手順', { exact: true }).selectOption(String(i));
      await expect(page.locator('.process-visual')).toHaveAttribute('data-process-step', String(i));
      await expect(page.locator('.process-scene')).toHaveAttribute(
        'aria-label',
        `${PROCESS_STEPS.mold[i].title}。${PROCESS_STEPS.mold[i].detail}`,
      );
    }
    await page.getByRole('button', { name: '実写真', exact: true }).click();
    await expect(page.locator('.atlas-visual img')).toBeVisible();
    await page.getByRole('link', { name: 'これまでのWiki' }).click();
    await expect(page).toHaveURL(/#library\/wiki\/home$/);
    await page.goto('/#library/atlas/overview');
    await page.getByRole('button', { name: 'Wikiを検索' }).click();
    await page.getByLabel('Wiki全文検索').fill('非公開の検証本文4819');
    await page.locator('.atlas-results a').click();
    await expect(page.locator('.gw-markdown')).toContainText('非公開の検証本文4819');
    expect(errors).toEqual([]);
  });
  test('edits the shared page and integrates a captured record into that same atlas article', async ({
    page,
  }) => {
    const edits = await setup(page);
    await page.goto('/#library/atlas/overview');
    await page.getByRole('button', { name: '本文を編集', exact: true }).click();
    await page.getByLabel('Wikiの本文').fill(overview.body + '\n\n次の代へ残す判断。');
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect(page.locator('.atlas-copy')).toContainText('次の代へ残す判断。');
    await page.reload();
    await expect(page.locator('.atlas-copy')).toContainText('次の代へ残す判断。');
    await page.getByRole('button', { name: '作業を記録', exact: true }).click();
    await page.getByLabel(/作業の名前/).fill('ウェブ組み立て');
    await page.getByLabel(/作業メモ/).fill('ウェブの当たり位置を合わせた。');
    await page.getByRole('button', { name: '保存して、判断を残す' }).click();
    await expect
      .poll(() => edits.find((e) => e.page_id === overview.id)?.events.length, { timeout: 15000 })
      .toBe(1);
    await page.goto('/#library');
    await page
      .locator('#book-section-overview-0')
      .getByRole('button', { name: 'この章の付箋', exact: true })
      .click();
    await expect(page.getByRole('dialog').locator('.book-note')).toContainText('ウェブ組み立て');
    await page.getByRole('dialog').locator('.book-note').click();
    await expect(page.getByRole('dialog')).toContainText('ウェブの当たり位置を合わせた。');
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.goto('/#library/atlas/overview');
    await expect(page.locator('.atlas-copy')).toContainText('ウェブの当たり位置を合わせた。');
    await expect(page.locator('.atlas-copy')).toContainText('次の代へ残す判断。');
    await page.getByRole('button', { name: '元の記録と映像を確認' }).click();
    await expect(page.getByRole('dialog')).toContainText('ウェブの当たり位置を合わせた。');
  });
  test('mobile controls fit and failed model requests can be retried without hiding the article', async ({
    page,
  }) => {
    await setup(page);
    let failed = true;
    await page.route(
      `**/rest/v1/propeller_wiki_sources?slug=eq.${modelAsset.sourceSlug}*`,
      (route) => (failed ? route.fulfill({ json: [] }) : route.fallback()),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#library/atlas/overview');
    await expect(page.locator('.atlas-visual [role="alert"]')).toBeVisible();
    await expect(page.locator('.atlas-copy')).toContainText('既存の作業手順');
    failed = false;
    await page.getByRole('button', { name: '再試行', exact: true }).click();
    await expect(page.locator('.atlas-model canvas')).toBeVisible();
    await page.getByRole('button', { name: '部材を知る', exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      );
    }
    await page.getByRole('button', { name: '本文を編集', exact: true }).click();
    await expect(page.getByLabel('Wikiの本文')).toBeVisible();
  });

  test('each manufacturing stage has its own seekable visual, keyboard controls and reduced-motion playback', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await page.goto('/#library/atlas/mold');
    for (const [id, name] of processNames) {
      await page
        .getByRole('navigation', { name: 'プロペラ製作の工程' })
        .getByRole('link', { name: new RegExp(name) })
        .click();
      const process = page.locator('.process-visual');
      const slider = process.getByRole('slider', { name: '工程図のシークバー' });
      await expect(process).toHaveAttribute('data-process-stage', id);
      await expect(process.locator('.process-scene')).toBeVisible();
      const accessibility = await new AxeBuilder({ page })
        .include('.process-visual')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations.map(({ id }) => id)).toEqual([]);
      await expect(
        process.getByLabel('工程図の手順', { exact: true }).locator('option'),
      ).toHaveCount(PROCESS_STEPS[id].length);
      await slider.focus();
      await slider.press('End');
      await expect(process).toHaveAttribute(
        'data-process-step',
        String(PROCESS_STEPS[id].length - 1),
      );
      await slider.press('Home');
      await expect(process).toHaveAttribute('data-process-step', '0');
      await process.getByRole('button', { name: '次の手順を表示', exact: true }).click();
      await expect(slider).toHaveValue('1');
      // Reduced motion takes one discrete step and does not keep advancing afterward.
      await page.waitForTimeout(250);
      await expect(slider).toHaveValue('1');
      const toggle = process.getByRole('button', { name: '部材名', exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      if (id === 'flange') {
        await expect(process.locator('.process-scene')).toContainText('upper：ロービング 6 本');
        await process.getByRole('button', { name: 'under', exact: true }).click();
        await expect(process.locator('.process-scene')).toContainText('under：ロービング 4 本');
      }
      for (let step = 0; step < PROCESS_STEPS[id].length; step++) {
        await process.getByLabel('工程図の手順', { exact: true }).selectOption(String(step));
        await expect(process).toHaveAttribute('data-process-step', String(step));
        await expect(process.locator('.process-scene')).toHaveAttribute(
          'aria-label',
          `${PROCESS_STEPS[id][step].title}。${PROCESS_STEPS[id][step].detail}`,
        );
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByLabel('工程図の手順', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: '工程を再生', exact: true }).click();
    await expect
      .poll(async () => Number(await page.getByLabel('工程図のシークバー').inputValue()))
      .toBeGreaterThan(0.05);
    await page.getByRole('button', { name: '工程の再生を一時停止', exact: true }).click();
    const paused = await page.getByLabel('工程図のシークバー').inputValue();
    await page.waitForTimeout(150);
    expect(await page.getByLabel('工程図のシークバー').inputValue()).toBe(paused);
    expect(errors).toEqual([]);
  });

  for (const width of [1024, 1366, 1440]) {
    test(`desktop ${width}: header scrolls away before navigation and visual pin and detail links restore reading position`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 768 });
      await setup(page);
      await page.goto('/#library/atlas/overview');
      await expect(page.locator('.atlas-model canvas')).toBeVisible();
      const left = page.getByRole('complementary', { name: '工程を目で見る' });
      const right = page.getByRole('article', { name: 'Wiki本文' });
      const initialLeft = (await left.boundingBox())!;
      const initialRight = (await right.boundingBox())!;
      expect(initialRight.x).toBeGreaterThanOrEqual(initialLeft.x + initialLeft.width);
      expect(Math.abs(initialRight.y - initialLeft.y)).toBeLessThanOrEqual(2);
      const nav = page.getByRole('navigation', { name: 'プロペラ製作の工程' });
      const initialNav = (await nav.boundingBox())!;
      await page.mouse.move(initialRight.x + 80, initialRight.y + 100);
      await page.mouse.wheel(0, 80);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect.poll(async () => (await left.boundingBox())!.y).toBeLessThan(initialLeft.y - 40);
      expect((await nav.boundingBox())!.y).toBeGreaterThan(0);
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), initialNav.y);
      await expect.poll(async () => (await nav.boundingBox())!.y).toBeCloseTo(0, 0);
      const pinnedLeft = (await left.boundingBox())!;
      expect(pinnedLeft.y).toBeLessThan(90);
      expect(pinnedLeft.y + pinnedLeft.height).toBeLessThanOrEqual(768);
      expect(pinnedLeft.height).toBeGreaterThan(640);
      await page.screenshot({ path: 'test-results/wiki-pinned-' + width + '.png' });

      await readSection(page, '型の工程を読む');
      await expect(page.locator('.atlas-follow')).toContainText('型の工程を読む');
      await expect(left.locator('.process-visual')).toHaveAttribute('data-process-stage', 'mold');
      await expect(left.getByRole('slider')).toHaveValue('2');
      expect((await left.boundingBox())!.y).toBeCloseTo(pinnedLeft.y, 0);
      expect((await nav.boundingBox())!.y).toBeCloseTo(0, 0);

      await left.getByLabel('工程図の手順', { exact: true }).selectOption('1');
      await expect(
        left.getByRole('button', { name: '本文に連動する', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await readSection(page, '外皮の工程を読む');
      await expect(left.locator('.process-visual')).toHaveAttribute('data-process-stage', 'mold');
      await expect(left.getByRole('slider')).toHaveValue('1');
      await left.getByRole('button', { name: '本文に連動する', exact: true }).click();
      await expect(page.locator('.atlas-follow')).toContainText('外皮の工程を読む');
      await expect(left.locator('.process-visual')).toHaveAttribute('data-process-stage', 'skin');
      await expect(left.getByRole('slider')).toHaveValue('3');
      await expect(right.locator('.gw-markdown img.gw-image')).toBeVisible();
      expect((await left.boundingBox())!.y).toBeCloseTo(pinnedLeft.y, 0);
      const inlineImage = await right.locator('.gw-markdown img.gw-image').elementHandle();
      const beforeVisualSwitch = await page.evaluate(() => window.scrollY);
      await left.getByRole('button', { name: '実写真', exact: true }).click();
      await expect(left.locator('.atlas-visual-body img')).toBeVisible();
      await expect(left.locator('figcaption')).toHaveText('fixture.svg');
      expect(await inlineImage!.evaluate((image) => image.isConnected)).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(beforeVisualSwitch);
      await left.getByRole('button', { name: '動かして見る', exact: true }).click();
      await expect(left.locator('.process-visual')).toHaveAttribute('data-process-stage', 'skin');

      await readSection(page, '型の工程を読む');
      await expect(left.getByRole('slider')).toHaveValue('2');
      const previousScroll = await page.evaluate(() => window.scrollY);
      const detailLink = right.getByRole('link', { name: 'ウェブ治具の詳細', exact: true }).first();
      const linkColor = await detailLink.evaluate((element) => getComputedStyle(element).color);
      const textColor = await right
        .locator('.gw-markdown')
        .evaluate((element) => getComputedStyle(element).color);
      expect(linkColor).not.toBe(textColor);
      await detailLink.click();
      await expect(page).toHaveURL(/#library\/wiki\/atlas-test-web-detail$/);
      await expect(right.locator('h2').first()).toHaveText('ウェブ治具の詳細');
      await expect(left.locator('.process-visual')).toHaveAttribute('data-process-stage', 'web');
      await expect(left.getByRole('slider')).toHaveValue('1');
      const detailLeft = (await left.boundingBox())!;
      expect((await right.boundingBox())!.x).toBeGreaterThanOrEqual(
        detailLeft.x + detailLeft.width,
      );
      await readSection(page, '溝に差し込む');
      await expect(left.getByRole('slider')).toHaveValue('2');
      expect((await left.boundingBox())!.y).toBeCloseTo(pinnedLeft.y, 0);
      await page.goBack();
      await expect(page).toHaveURL(/#library\/atlas\/overview$/);
      await expect(right.locator('h2').first()).toHaveText(overview.title);
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - previousScroll))
        .toBeLessThanOrEqual(3);
      await expect(left.getByRole('slider')).toHaveValue('2');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
});
