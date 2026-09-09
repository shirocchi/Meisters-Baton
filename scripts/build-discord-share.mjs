#!/usr/bin/env node
import path from 'node:path';
import { buildSharePackage, verifySharePackage } from './discord-share-lib.mjs';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (key === '--verify-only') {
      options.verifyOnly = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('使い方: --archive <path> --out <path>');
    options[key.slice(2)] = value;
    index += 2;
  }
  if (!options.archive || !options.out) throw new Error('--archive と --out は必須です。');
  return options;
}

const options = parseArgs(process.argv.slice(2));
const archiveRoot = path.resolve(options.archive);
const outputRoot = path.resolve(options.out);
const result = options.verifyOnly ? null : await buildSharePackage(archiveRoot, outputRoot);
const verified = await verifySharePackage(archiveRoot, outputRoot);
if (!verified.ok) throw new Error(`共有版の検証に失敗しました。\n${verified.errors.join('\n')}`);
if (result)
  console.log(
    `共有版を生成: ${result.stats.messages}メッセージ / ${result.stats.attachments}添付 / Markdown ${result.outputs.markdownPages}ページ`,
  );
console.log(
  `検証OK: ${verified.messageCount}メッセージ / ${verified.attachmentCount}添付参照 / Markdown ${verified.markdownPageCount}ページ`,
);
console.log(`保存先: ${outputRoot}`);
