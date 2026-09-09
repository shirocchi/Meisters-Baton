import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

async function checkAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, failure: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
}

test('mobile: a new expert answer becomes reviewed searchable knowledge and survives restart', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工房の記録', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '作業を記録', exact: true })).toBeVisible();
  await expect(page.getByText('その手の「なぜ」を、')).toHaveCount(0);
  await page.getByRole('button', { name: '今日の作業を残す' }).click();
  await page.getByLabel(/作業の名前/).fill('試験用治具の引き継ぎ');
  await page.getByLabel(/作業メモ/).fill('青い印を確認する工程。練習用のテスト記録です。');
  await page.getByRole('button', { name: '保存して、判断を残す' }).click();
  await page.getByRole('button', { name: '手動で判断を残す' }).click();
  await checkAccessible(page);
  const answers = [
    'まず治具の青い印を指さして確認しました。',
    'バトン固有条件734。二人で青い印を照合したときに次へ進みました。',
    '印が見えないときは止めて、担当者に確かめます。',
  ];
  for (let i = 0; i < answers.length; i++) {
    await page.getByLabel('あなたの言葉で').fill(answers[i]);
    await page
      .getByRole('button', { name: i < 2 ? '回答を保存して次へ' : '回答を保存', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Wikiの下書きを作る' }).click();
  await expect(
    page.getByRole('heading', { name: '試験用治具の引き継ぎ', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '確認済みWikiとして公開' })).toBeDisabled();
  await expect(page.locator('.claim-body').filter({ hasText: 'バトン固有条件734' })).toBeVisible();
  await checkAccessible(page);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: '内容を確認した', exact: true }).first().click();
  await page.getByRole('button', { name: '確認済みWikiとして公開' }).click();
  await page.getByRole('button', { name: 'Wikiに公開する', exact: true }).click();
  await expect(page.getByText('確認済み・引き継ぎ可能', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('確認済み・引き継ぎ可能', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'この知識を探してみる' }).click();
  await page.getByLabel('先輩の知恵に質問する').fill('バトン固有条件734');
  await page.getByRole('button', { name: '知恵を探す', exact: true }).click();
  await expect(page.locator('.answer-card')).toContainText(answers[1]);
  await page.getByRole('button', { name: '回答原文を見る' }).first().click();
  await expect(page.getByRole('dialog').locator('blockquote')).toHaveText(answers[1]);
  await checkAccessible(page);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByLabel('先輩の知恵に質問する').fill('量子ワープ未知工程');
  await page.getByRole('button', { name: '知恵を探す', exact: true }).click();
  await expect(page.getByText('この判断は、まだ残っていません。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '次に確かめたい質問に残す' }).click();
  await expect(page.locator('.request-card')).toContainText('量子ワープ未知工程');
  await page.reload();
  await expect(page.locator('.request-card')).toContainText('量子ワープ未知工程');
  expect(errors).toEqual([]);
});

test('editing published knowledge requires another review and keeps the original evidence', async ({
  page,
}) => {
  await page.goto('/#library/records');
  await page.locator('.wiki-row-main').first().click();
  await page.getByRole('button', { name: '編集', exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: '本文', exact: true })
    .fill('変更後のテスト用の記述。原文を確認すること。');
  await page.getByRole('button', { name: '変更を保存する' }).click();
  await expect(page.getByText('下書き・確認待ち', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '確認済みWikiとして公開' })).toBeDisabled();
  await page.getByRole('button', { name: '根拠', exact: true }).click();
  await expect(page.locator('.evidence-index')).not.toContainText('変更後のテスト用の記述');
  await page.getByRole('button', { name: '変更履歴', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('内容を編集');
});

test('real video bytes are decoded, frames extracted, stored and replayed after reload', async ({
  page,
}) => {
  await page.goto('/#capture');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const parts: Blob[] = [];
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.ondataavailable = (e) => parts.push(e.data);
    recorder.start();
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? '#174c43' : '#d4e4d9';
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = '#e1a842';
      ctx.fillRect(20 + i * 8, 65, 50, 30);
      await new Promise((r) => setTimeout(r, 70));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer()));
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'synthetic-workshop.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from(bytes),
    });
  await page.getByLabel(/作業の名前/).fill('動画保存のテスト');
  await page.getByRole('button', { name: '保存して、判断を残す' }).click();
  await expect(page.getByRole('heading', { name: '動画保存のテスト', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.frame-strip img')).toHaveCount(3);
  await page.reload();
  const video = page.locator('video.video-player');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.locator('.frame-strip button').last().click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
});

test('sample records stay labeled and local backup can be restored without duplicating records', async ({
  page,
}) => {
  await page.goto('/#settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click();
  const file = await download;
  await mkdir('test-results/backups', { recursive: true });
  const path = 'test-results/backups/seed.json';
  await file.saveAs(path);
  await page.locator('input[type=file]').setInputFiles(path);
  await page.getByRole('button', { name: '今の記録に追加' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#library/records');
  await expect(page.locator('.wiki-row')).toHaveCount(3);
  await page.goto('/#settings');
  await page.getByLabel('サンプルを表示する', { exact: true }).uncheck();
  await page.goto('/#library/records');
  await expect(page.locator('.wiki-row')).toHaveCount(0);
});

test('working screens fit narrow phones and have accessible names and text contrast', async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['home', 'capture', 'library', 'ask', 'settings']) {
      await page.goto(`/#${route}`);
      await expect(page.locator('main h1')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['home', 'capture', 'library', 'ask', 'settings']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('main h1')).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      route,
    ).toEqual([]);
  }
});

test('an unfinished interview is recovered and a record can be deliberately deleted', async ({
  page,
}) => {
  await page.goto('/#capture');
  await page.getByLabel(/作業の名前/).fill('中断して戻る記録');
  await page.getByLabel(/作業メモ/).fill('途中の入力もなくさないことを確認する。');
  await page.getByRole('button', { name: '保存して、判断を残す' }).click();
  await page.getByRole('button', { name: '手動で判断を残す' }).click();
  await page.getByLabel('あなたの言葉で').fill('入力途中の固有条件998。まだ回答確定前。');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'あなたの言葉で' })).toHaveValue(
    '入力途中の固有条件998。まだ回答確定前。',
  );
  await page.locator('.record-details > summary').click();
  await page.getByRole('button', { name: 'この作業記録を削除する' }).click();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('heading', { name: '中断して戻る記録', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'この作業記録を削除する' }).click();
  await page.getByRole('button', { name: '作業記録と関連Wikiを削除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '技術Wiki', exact: true })).toBeVisible();
  await expect(page.locator('.recording-list')).not.toContainText('中断して戻る記録');
  await page.reload();
  await expect(page.locator('.recording-list')).not.toContainText('中断して戻る記録');
});
