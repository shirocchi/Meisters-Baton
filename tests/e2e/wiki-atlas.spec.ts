import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { connect, fixture } from './helpers/wikiFixture';
import type { WikiArchive, WikiAsset } from '../../src/domain/growiWiki';
import type { WikiEdit } from '../../src/domain/wikiWorkshop';

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
const overview = {
  ...fixture.pages[0],
  id: 'atlas-test-overview',
  title: 'ウェブ組み立て',
  path: '/ペラ/26代/ウェブ組み立て',
  body: '検証用の技術資料。\n\n## ウェブを立てる\n\n既存の作業手順を残す。',
  attachments: [modelAsset],
};
const mold = { ...overview, id: 'atlas-test-mold', title: '型製作', path: '/ペラ/26代/型製作' };
const archive: WikiArchive = {
  ...fixture,
  pages: [...fixture.pages, overview, mold],
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
      },
      {
        id: 'mold',
        pageId: mold.id,
        number: '01',
        short: '型を作る',
        model: 'mold',
        local: false,
        photoId: 'test-image',
        photoCaption: '架空の試験写真',
        sources: ['skin'],
        related: ['overview'],
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
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.describe('production Wiki atlas', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires Supabase fixtures');

  test('opens the latest atlas, explains materials and mold stages, and keeps old Wiki links', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page);
    await page.goto('/#library');
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
    for (let i = 0; i < 7; i++) {
      await page.locator(`[data-stage="${i}"]`).click();
      await expect(page.locator('#stage-number')).toHaveText(String(i + 1).padStart(2, '0'));
    }
    await page.getByRole('button', { name: '実写真', exact: true }).click();
    await expect(page.locator('.atlas-visual img')).toBeVisible();
    await page.getByRole('link', { name: 'これまでのWiki' }).click();
    await expect(page).toHaveURL(/#library\/wiki\/home$/);
    await page.goto('/#library');
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
    await page.goto('/#library');
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
    await page.goto('/#library');
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
});
