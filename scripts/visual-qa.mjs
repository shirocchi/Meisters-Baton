import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--disable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173');
await page.getByRole('heading', { name: '工房の記録', exact: true }).waitFor();
await page.evaluate(() => document.fonts.ready);
console.log(
  await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    ready: document.readyState,
  })),
);
await page.screenshot({ path: '.verification/home-desktop.png', fullPage: true });
const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
await writeFile(
  '.verification/accessibility.json',
  JSON.stringify(
    a11y.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
    null,
    2,
  ),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '.verification/home-mobile.png', fullPage: true });
const overflow = await page.evaluate(() => ({
  viewport: innerWidth,
  width: document.documentElement.scrollWidth,
}));
for (const route of ['capture', 'library', 'ask', 'settings']) {
  await page.goto(`http://127.0.0.1:5173/#${route}`);
  await page.locator('main').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.verification/${route}-mobile.png`, fullPage: true });
}
await page.goto('http://127.0.0.1:5173/#library');
await page.locator('.wiki-row-main').first().click();
await page.getByRole('heading', { name: '積層前に、繊維の向きを確かめる', exact: true }).waitFor();
await page.screenshot({ path: '.verification/article-mobile.png', fullPage: true });
await page.getByRole('button', { name: '映像と対話をひらく' }).click();
await page.getByText('サンプル体験', { exact: true }).waitFor();
await page.screenshot({ path: '.verification/interview-mobile.png', fullPage: true });
await page.goto('http://127.0.0.1:5173');
await page.setViewportSize({ width: 1440, height: 1000 });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: '.verification/home-preview.png' });
console.log(
  JSON.stringify({
    errors,
    overflow,
    accessibility: a11y.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
  }),
);
await browser.close();
