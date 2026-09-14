import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { ProcessVideoPlan } from '../../src/domain/processVideo';
test('renders an actual silent 1080p MP4 from a labeled test-only 3D scene', async ({
  page,
}, info) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Test harness only: the normal UI obtains plans from the authenticated runtime.
    const moduleUrl = '/src/lib/processVideoRender.ts';
    const { renderProcessMp4, canRenderMp4 } = (await import(
      moduleUrl
    )) as typeof import('../../src/lib/processVideoRender');
    if (!canRenderMp4()) return { supported: false as const };
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const zero = { x: 0, y: 0, z: 0 };
    const plan: ProcessVideoPlan = {
      title: '描画の検証専用',
      summary: '実際の製法ではない',
      missingEvidence: [],
      models: [
        {
          id: 'test-object',
          label: 'テスト用部材',
          shape: 'box',
          size: { x: 2, y: 1, z: 0.15 },
          color: 'teal',
          sourceIds: ['test-only'],
        },
      ],
      scenes: [
        {
          title: 'テスト用の部材配置',
          action: '描画の動作確認',
          visual: '検証専用の概念図',
          caption: 'これは描画試験です。実際の製法ではありません。',
          uncertainty: '出典：テストデータ',
          sourceIds: ['test-only'],
          seconds: 4,
          start: [{ modelId: 'test-object', position: { x: 0, y: 0, z: 1 }, rotation: zero }],
          end: [{ modelId: 'test-object', position: zero, rotation: zero }],
        },
      ],
    };
    const blob = await renderProcessMp4(plan, canvas, () => {});
    const video = document.createElement('video');
    video.src = URL.createObjectURL(blob);
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(Error('cannot decode MP4'));
    });
    const metadata = {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };
    // Decode and seek to the beginning, operation midpoint, and final state.
    for (const time of [0.15, 2, 3.7]) {
      video.currentTime = time;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(Error('seek failed'));
      });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    URL.revokeObjectURL(video.src);
    return { supported: true as const, ...metadata, base64: btoa(binary), bytes: blob.size };
  });
  test.skip(!result.supported, 'This browser cannot encode H.264 MP4.');
  if (!result.supported) return;
  expect(result.width).toBe(1920);
  expect(result.height).toBe(1080);
  expect(result.duration).toBeGreaterThan(3.5);
  expect(result.bytes).toBeGreaterThan(1000);
  await writeFile(info.outputPath('render-fixture.mp4'), Buffer.from(result.base64!, 'base64'));
  await page
    .locator('canvas')
    .last()
    .screenshot({ path: info.outputPath('render-final.png') });
});
