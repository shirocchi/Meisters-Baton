import { test, expect, type Page } from '@playwright/test';
import { connect, fixture } from './helpers/wikiFixture';
import type { WikiEdit } from '../../src/domain/wikiWorkshop';
async function editable(page: Page) {
  await connect(page);
  const edits: WikiEdit[] = [];
  const revisions: WikiEdit[] = [];
  await page.route('**/rest/v1/wiki_page_edits*', (route) => route.fulfill({ json: edits }));
  await page.route('**/rest/v1/wiki_page_revisions*', (route) =>
    route.fulfill({
      json: revisions
        .filter(
          (r) => r.page_id === new URL(route.request().url()).searchParams.get('page_id')?.slice(3),
        )
        .sort((a, b) => b.version - a.version),
    }),
  );
  await page.route('**/rest/v1/rpc/save_wiki_page', async (route) => {
    const payload = route.request().postDataJSON();
    const old = edits.find((e) => e.page_id === payload.p_page_id);
    const original = [fixture.home!, ...fixture.pages].find((p) => p.id === payload.p_page_id)!;
    if (payload.p_expected_version !== (old?.version ?? 0))
      return route.fulfill({ status: 409, json: { message: 'WIKI_CONFLICT' } });
    revisions.push(
      old
        ? { ...old }
        : {
            page_id: original.id,
            title: original.title,
            body: original.body,
            version: 0,
            updated_at: '2026-09-09T00:00:00Z',
            author: '元Wiki',
            reason: '取り込んだ原文',
            events: [],
            media: [],
          },
    );
    const next = {
      page_id: payload.p_page_id,
      title: payload.p_title,
      body: payload.p_body,
      version: (old?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
      author: '試験メンバー',
      reason: payload.p_reason,
      events: payload.p_events,
      media: payload.p_media,
    };
    if (old) edits.splice(edits.indexOf(old), 1, next);
    else edits.push(next);
    return route.fulfill({ json: next });
  });
  return {
    edits,
    revisions,
  };
}
test('monitor stays minimized across source pages, guides, history and reload', async ({
  page,
}) => {
  await connect(page);
  await page.goto('/#library');
  await page.getByLabel('モニターを最小化', { exact: true }).click();
  await page.locator('.gw-markdown').getByRole('link', { name: '外皮の原文' }).click();
  await expect(page.getByLabel('モニターを展開', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '工程解説ガイド' }).click();
  await expect(page.getByLabel('モニターを展開', { exact: true })).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByLabel('モニターを展開', { exact: true })).toBeVisible();
  await page.getByLabel('モニターを展開', { exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('モニターを最小化', { exact: true })).toBeVisible();
});
test.describe('editable workshop Wiki', () => {
  test.skip(!process.env.BATON_TEST_SUPABASE, 'Requires Supabase fixtures');
  test('manual edit, conflict preservation, revision and restore', async ({ page }) => {
    const db = await editable(page);
    await page.goto('/#library/wiki/skin');
    await page.getByLabel('モニターを最小化', { exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const body = page.getByRole('textbox', { name: 'Wikiの本文' });
    await body.fill('# 外皮積層\n\n## 真空引き\n\n職人が補足した手元の判断。');
    await page.getByRole('button', { name: '仕上がりを見る' }).click();
    await expect(page.locator('.ww-editor-preview')).toContainText('職人が補足');
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.gw-markdown')).toContainText('職人が補足');
    expect(db.edits[0].version).toBe(1);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await body.fill('競合しても保持する下書き');
    db.revisions.push({ ...db.edits[0] });
    db.edits[0] = { ...db.edits[0], version: 2, body: '並行して反映された別の記録' };
    const refreshed = page.waitForResponse('**/rest/v1/wiki_page_edits*');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(page.locator('.gw-markdown').first()).toContainText('並行して反映');
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect(page.getByRole('alert')).toContainText('別の更新');
    await expect(body).toHaveValue('競合しても保持する下書き');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: '保存せず閉じる' }).click();
    await page.getByRole('button', { name: '履歴', exact: true }).click();
    await page.getByRole('button', { name: /版 0 · 元Wiki/ }).click();
    await page.getByRole('button', { name: 'この版に戻す' }).click();
    await page.getByRole('button', { name: '本文を復元する' }).click();
    await expect.poll(() => db.edits[0].version).toBe(3);
    await page.getByRole('button', { name: '手順', exact: true }).click();
    await expect(page.locator('.gw-markdown')).toContainText('非公開の検証本文4819');
    expect(db.revisions).toHaveLength(3);
  });
  test('renaming a subsection keeps subsequent input in that subsection', async ({ page }) => {
    const db = await editable(page);
    await page.goto('/#library/wiki/skin');
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page.getByLabel('編集する範囲').selectOption({ label: '真空引き' });
    const body = page.getByRole('textbox', { name: 'Wikiの本文' });
    await body.fill('## 真空引きの判断\n\n書き直した工程。');
    await body.press('End');
    await body.pressSequentially('追記した判断。');
    await expect(body).not.toHaveValue(/# 外皮積層/);
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect.poll(() => db.edits[0]?.body).toContain('# 外皮積層');
    expect(db.edits[0].body).toContain('追記した判断。');
  });
  test('a captured record automatically updates a source subsection and stays undoable', async ({
    page,
  }) => {
    const db = await editable(page);
    await page.goto('/#capture');
    await page.getByRole('textbox', { name: /作業の名前/ }).fill('外皮の真空引き');
    await page
      .getByRole('textbox', { name: /作業メモ/ })
      .fill('シール端から空気が入った。貼り直すと音が止まった。');
    await page.getByRole('button', { name: '保存して、判断を残す' }).click();
    await expect.poll(() => db.edits.length, { timeout: 15000 }).toBe(1);
    expect(db.edits[0].page_id).toBe('skin');
    expect(db.edits[0].events).toHaveLength(1);
    expect(db.edits[0].body).toContain('シール端');
    expect(db.edits[0].body).toContain('非公開の検証本文4819');
    await page.goto('/#library/wiki/skin');
    await expect(page.locator('.gw-markdown')).toContainText('シール端');
    await page.getByRole('button', { name: '元の記録と映像を確認' }).click();
    await expect(page.getByRole('dialog')).toContainText('シール端');
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.reload();
    expect(db.edits[0].version).toBe(1);
    await page.getByLabel('モニターを最小化', { exact: true }).click();
    await page.getByRole('button', { name: '履歴', exact: true }).click();
    await page.getByRole('button', { name: /版 0 · 元Wiki/ }).click();
    await page.getByRole('button', { name: 'この版に戻す' }).click();
    await page.getByRole('button', { name: '本文を復元する' }).click();
    await expect.poll(() => db.edits[0].version).toBe(2);
    await page.reload();
    await expect(page.locator('.gw-markdown')).not.toContainText('シール端');
    expect(db.edits[0].version).toBe(2);
  });
  test('one rejected record does not block another record from reaching the Wiki', async ({
    page,
  }) => {
    const db = await editable(page);
    await page.route('**/rest/v1/rpc/save_wiki_page', (route) => {
      if (route.request().postDataJSON().p_reason.includes('失敗する記録'))
        return route.fulfill({ status: 503, json: { message: 'temporary error' } });
      return route.fallback();
    });
    for (const title of ['外皮の真空引き 失敗する記録', '外皮の真空引き 続きの記録']) {
      await page.goto('/#capture');
      await page.getByLabel(/作業の名前/).fill(title);
      await page.getByLabel(/作業メモ/).fill('漏れた位置を記録する。');
      await page.getByRole('button', { name: '保存して、判断を残す' }).click();
      await expect(page).not.toHaveURL(/#capture$/);
    }
    await expect
      .poll(() => db.edits[0]?.events[0]?.recording.title, { timeout: 15000 })
      .toBe('外皮の真空引き 続きの記録');
    await page.goto('/#library');
    await expect(page.locator('.ww-pending-row')).toContainText('失敗する記録');
  });
  test('media browsing and mobile editing keep controls visible', async ({ page }) => {
    await editable(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#library/wiki/skin');
    await page.getByLabel('モニターを最小化', { exact: true }).click();
    await page.getByRole('button', { name: '写真・動画', exact: true }).click();
    await expect(page.locator('.ww-gallery img')).toBeVisible();
    await page.getByLabel('fixture.svgを拡大').click();
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Wikiの本文' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.verification/wiki-editor-mobile.png' });
  });
  test('an image added in the editor renders privately in the article', async ({ page }) => {
    const db = await editable(page);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="green"/></svg>';
    await page.route(
      (url) =>
        url.pathname.includes('/storage/v1/object/') && url.pathname.includes('/team-media/'),
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ json: { Key: 'fixture', Id: 'fixture' } })
          : route.fulfill({ contentType: 'image/svg+xml', body: svg }),
    );
    await page.goto('/#library/wiki/skin');
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page
      .getByRole('dialog')
      .locator('input[type=file]')
      .setInputFiles({
        name: '手元の写真.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(svg),
      });
    await expect(page.getByRole('textbox', { name: 'Wikiの本文' })).toContainText('#media/');
    await page.getByRole('button', { name: '変更を保存' }).click();
    await expect.poll(() => db.edits[0]?.media.length).toBe(1);
    await expect(page.getByRole('img', { name: '手元の写真.svg', exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('#media/');
  });
  test('imported video is linked automatically, shared once, and plays from the Wiki', async ({
    page,
  }) => {
    const db = await editable(page);
    await page.goto('/#capture');
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext('2d')!;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const parts: Blob[] = [];
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.ondataavailable = (e) => parts.push(e.data);
      recorder.start();
      for (let i = 0; i < 15; i++) {
        context.fillStyle = i % 2 ? '#476459' : '#bececa';
        context.fillRect(0, 0, 320, 180);
        await new Promise((r) => setTimeout(r, 80));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      return Array.from(
        new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer()),
      );
    });
    let uploads = 0;
    await page.route(
      (url) =>
        url.pathname.includes('/storage/v1/object/') && url.pathname.includes('/team-media/'),
      (route) => {
        if (route.request().method() === 'POST') {
          uploads++;
          expect(route.request().postDataBuffer()).toEqual(Buffer.from(bytes));
          expect(route.request().headers()['content-type']).toBe('video/webm');
          return route.fulfill({ json: { Key: 'fixture', Id: 'fixture' } });
        }
        return route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) });
      },
    );
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'vacuum.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
    await page.getByLabel(/作業の名前/).fill('外皮の真空引き');
    await page.getByRole('button', { name: '保存して、判断を残す' }).click();
    await expect
      .poll(() => db.edits[0]?.events[0]?.recording.remoteMediaId, { timeout: 15000 })
      .toBeTruthy();
    expect(uploads).toBe(1);
    await page.goto('/#library/wiki/skin');
    await page.locator('.ww-inline-recording').scrollIntoViewIfNeeded();
    await expect(page.locator('.ww-inline-recording video')).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.ww-inline-recording video').evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await page.locator('.ww-inline-recording video').evaluate((v) => {
      v.setAttribute('data-kept', 'yes');
      window.scrollTo(0, 0);
    });
    await expect(page.locator('.ww-inline-recording video')).toHaveAttribute('data-kept', 'yes');
    await page.getByRole('button', { name: '元の記録と映像を確認' }).click();
    const video = page.getByRole('dialog').locator('video');
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(1);
    await page.locator('.ww-frame-strip button').last().click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.reload();
    expect(uploads).toBe(1);
  });
});
