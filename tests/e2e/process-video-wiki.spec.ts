import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { connect, fixture } from './helpers/wikiFixture';
import { videoPlan, videoRecording } from '../helpers/processVideoFixture';
import { processVideoRecordingFingerprint } from '../../src/domain/processVideoWiki';
import type { WikiEdit } from '../../src/domain/wikiWorkshop';

async function setup(page: Page) {
  await connect(page);
  const edits: WikiEdit[] = [];
  const uploads = new Map<string, Buffer>();
  let conflict = false;
  await page.route('**/rest/v1/wiki_page_edits*', (route) => route.fulfill({ json: edits }));
  await page.route('**/storage/v1/object/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/authenticated/', '/');
    if (route.request().method() === 'POST') {
      uploads.set(path, route.request().postDataBuffer()!);
      return route.fulfill({ json: { Key: path } });
    }
    const bytes = uploads.get(path);
    return bytes ? route.fulfill({ body: bytes, contentType: 'video/mp4' }) : route.fallback();
  });
  await page.route('**/rest/v1/rpc/save_wiki_page', (route) => {
    if (conflict) {
      conflict = false;
      return route.fulfill({ status: 409, json: { message: 'WIKI_CONFLICT' } });
    }
    const p = route.request().postDataJSON();
    const old = edits.find((e) => e.page_id === p.p_page_id);
    if ((old?.version ?? 0) !== p.p_expected_version)
      return route.fulfill({ status: 409, json: { message: 'WIKI_CONFLICT' } });
    const next = {
      page_id: p.p_page_id,
      title: p.p_title,
      body: p.p_body,
      version: (old?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
      author: '試験メンバー',
      reason: p.p_reason,
      events: p.p_events,
      media: p.p_media,
    };
    if (old) edits.splice(edits.indexOf(old), 1, next);
    else edits.push(next);
    return route.fulfill({ json: next });
  });
  await page.route('**/api/process-video', async (route) => {
    const record = route.request().postDataJSON().recording;
    return route.fulfill({
      json: {
        id: 'run-e2e',
        recordingId: record.id,
        recordingFingerprint: await processVideoRecordingFingerprint(record),
        teamId: '22222222-2222-4222-8222-222222222222',
        createdAt: new Date().toISOString(),
        skillSha256: 'a'.repeat(64),
        status: 'storyboard-draft',
        plan: videoPlan,
        sources: [
          {
            id: 'recording:note',
            title: '作業メモ',
            route: `#evidence/${record.id}`,
            sha256: createHash('sha256').update(record.notes).digest('hex'),
          },
        ],
        limitations: [],
      },
    });
  });
  await page.goto('/');
  await page.evaluate(async (record) => {
    const url = '/src/lib/storage.ts';
    const { loadSettings, saveSettings, loadData, saveData } = await import(url);
    await saveSettings({ ...(await loadSettings()), aiConsent: true, apiBaseUrl: location.origin });
    const data = await loadData();
    await saveData({ ...data, recordings: [...data.recordings, record] });
  }, videoRecording);
  await page.goto(`/#recording/${videoRecording.id}`);
  await page.reload();
  await page.getByText('作業の3D解説動画を作る', { exact: true }).click();
  await page.getByRole('button', { name: 'Codexで制作構成を作る', exact: true }).click();
  await page.getByRole('button', { name: '構成を確認してMP4を書き出す', exact: true }).click();
  await expect(page.getByLabel('保存した3D解説動画')).toBeVisible({ timeout: 60000 });
  await page
    .getByRole('combobox', { name: '掲載するWikiページ', exact: true })
    .selectOption('skin');
  await page.getByRole('combobox', { name: '掲載する工程', exact: true }).selectOption('真空引き');
  await expect(page.getByRole('button', { name: '掲載内容を確認する', exact: true })).toBeEnabled();
  return {
    edits,
    uploads,
    setConflict: () => {
      conflict = true;
    },
  };
}

test.describe('generated MP4 to existing Wiki (mock shared service, real MP4)', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires local Supabase fixtures');
  test('preview, publish, restore, seek, and preserve original evidence on desktop and mobile', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const db = await setup(page);
    await page.getByRole('button', { name: '掲載内容を確認する', exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.process-video-publication')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(db.uploads.size).toBe(0);
    expect(db.edits).toHaveLength(0);
    await page
      .locator('.process-video-publication')
      .screenshot({ path: info.outputPath('publication-preview.png') });
    await page.getByRole('button', { name: '確認した内容でWikiへ掲載する', exact: true }).click();
    await expect(page.getByRole('button', { name: '掲載したWikiを開く' })).toBeVisible();
    expect(db.uploads.size).toBe(1);
    expect(db.edits).toHaveLength(1);
    expect(db.edits[0].body).toContain('非公開の検証本文4819');
    expect(db.edits[0].body).toContain('説明用の概念図');
    expect(db.edits[0].events[0].recordingId).toBe(videoRecording.id);
    expect(db.edits[0].media[0].processVideo?.cues).toHaveLength(2);
    await page.reload();
    await page.getByText('作業の3D解説動画を作る', { exact: true }).click();
    await page.getByRole('button', { name: '掲載したWikiを開く' }).click();
    await page.locator('.process-video-cues').first().scrollIntoViewIfNeeded();
    const video = page.getByLabel(videoPlan.title, { exact: true }).first();
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveJSProperty('videoWidth', 1920);
    await page.getByRole('button', { name: '0:04 終了状態を見る' }).first().click();
    await expect(video).toHaveJSProperty('currentTime', 4);
    await expect(video).toHaveJSProperty('paused', true);
    await video.evaluate(async (node: HTMLVideoElement) => {
      node.muted = true;
      await node.play();
    });
    await expect(video).toHaveJSProperty('ended', true);
    await page.setViewportSize({ width: 390, height: 844 });
    await video.scrollIntoViewIfNeeded();
    await video.evaluate(async (node: HTMLVideoElement) => {
      node.currentTime = 4;
      await node.play();
    });
    await expect(page.getByLabel('モニターを展開', { exact: true })).toBeVisible();
    await expect(video).toHaveJSProperty('ended', true);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: info.outputPath('wiki-video-mobile.png') });
    expect(errors).toEqual([]);
  });
  test('conflict keeps draft and retries with the already uploaded MP4', async ({ page }) => {
    const db = await setup(page);
    db.setConflict();
    await page.getByRole('button', { name: '掲載内容を確認する', exact: true }).click();
    await page.getByRole('button', { name: '確認した内容でWikiへ掲載する', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('別の更新');
    expect(db.edits).toHaveLength(0);
    expect(db.uploads.size).toBe(1);
    await expect(page.getByLabel('動画に添える説明')).toHaveValue(videoPlan.summary);
    await page.getByRole('button', { name: '確認した内容でWikiへ掲載する', exact: true }).click();
    await expect(page.getByRole('button', { name: '掲載したWikiを開く' })).toBeVisible();
    expect(db.uploads.size).toBe(1);
  });
  test('a changed recording disables publication of the old video', async ({ page }) => {
    const db = await setup(page);
    await page.evaluate(async (id) => {
      const path = '/src/lib/storage.ts';
      const { loadData, saveData } = await import(path);
      const data = await loadData();
      await saveData({
        ...data,
        recordings: data.recordings.map((record: typeof videoRecording) =>
          record.id === id ? { ...record, notes: '後から訂正された作業メモ' } : record,
        ),
      });
    }, videoRecording.id);
    await page.reload();
    await page.getByText('作業の3D解説動画を作る', { exact: true }).click();
    await expect(page.getByText(/制作後に記録や回答が変わった/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: '掲載内容を確認する', exact: true }),
    ).toBeDisabled();
    expect(db.edits).toHaveLength(0);
    expect(db.uploads.size).toBe(0);
  });
});
