import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public/icon.svg'), 'utf8');
const mark = source.match(/<g[\s\S]*<\/g>/)?.[0];
if (!mark) throw new Error('The brand SVG must contain its mark in a g element.');
const svg = (content, viewBox = '0 0 128 128') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>`);
const square = svg(`<rect width="128" height="128" fill="#174c43"/>${mark}`);
// Centered brand shape sits inside the adaptive icon's 66dp safe zone on a 108dp canvas.
const foreground = svg(
  `<g transform="translate(13.04 13.04) scale(.64)">${mark}</g>`,
  '0 0 108 108',
);
const monochrome = Buffer.from(foreground.toString().replaceAll('#e9bd63', '#fff'));
const maskable = svg(
  `<rect width="128" height="128" fill="#174c43"/><g transform="translate(16 16) scale(.75)">${mark}</g>`,
);
async function png(input, size, target, background) {
  await mkdir(path.dirname(path.join(root, target)), { recursive: true });
  let pipeline = sharp(input).resize(size, size);
  if (background) pipeline = pipeline.flatten({ background });
  await pipeline.png().toFile(path.join(root, target));
}
await png(Buffer.from(source), 192, 'public/icons/icon-192.png');
await png(maskable, 512, 'public/icons/icon-512.png', '#174c43');
await png(
  square,
  1024,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  '#174c43',
);
await png(square, 512, 'resources/store-icon-512.png', '#174c43');
for (const [density, scale] of Object.entries({
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
})) {
  const folder = `android/app/src/main/res/mipmap-${density}`;
  await png(square, 48 * scale, `${folder}/ic_launcher.png`, '#174c43');
  const circle = svg(`<circle cx="64" cy="64" r="64" fill="#174c43"/>${mark}`);
  await png(circle, 48 * scale, `${folder}/ic_launcher_round.png`);
  await png(foreground, 108 * scale, `${folder}/ic_launcher_foreground.png`);
  await png(monochrome, 108 * scale, `${folder}/ic_launcher_monochrome.png`);
}
const androidResources = path.join(root, 'android/app/src/main/res');
for (const folder of await readdir(androidResources, { withFileTypes: true })) {
  if (!folder.isDirectory() || !folder.name.startsWith('drawable')) continue;
  const files = await readdir(path.join(androidResources, folder.name));
  if (!files.includes('splash.png')) continue;
  const target = path.join(androidResources, folder.name, 'splash.png');
  const metadata = await sharp(target).metadata();
  const size = Math.max(1, Math.round(Math.min(metadata.width, metadata.height) * 0.2));
  const logo = await sharp(square).resize(size, size).png().toBuffer();
  await sharp({
    create: { width: metadata.width, height: metadata.height, channels: 3, background: '#f5f7f6' },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${target}.new.png`);
  // Writing through a buffer avoids replacing an input file while Sharp is still reading it.
  await writeFile(target, await readFile(`${target}.new.png`));
  const { unlink } = await import('node:fs/promises');
  await unlink(`${target}.new.png`);
}
const splash = svg(
  `<rect width="128" height="128" fill="#f5f7f6"/><g transform="translate(47 47) scale(.265625)"><rect width="128" height="128" rx="30" fill="#174c43"/>${mark}</g>`,
);
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await png(splash, 2732, `ios/App/App/Assets.xcassets/Splash.imageset/${file}`, '#f5f7f6');
console.log('Generated PWA, Android adaptive, iOS and store icons plus native launch images.');
