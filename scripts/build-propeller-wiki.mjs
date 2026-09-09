#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJsonLines } from './discord-archive-lib.mjs';
import { buildPropellerWikiBackup } from './propeller-wiki-lib.mjs';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('使い方: --archive <path> --out <path>');
    options[key.slice(2)] = value;
  }
  if (!options.archive || !options.out || !options.specs)
    throw new Error('--archive、--out、--specs（非公開の下書き仕様JSON）は必須です。');
  return options;
}

const options = parseArgs(process.argv.slice(2));
const archiveRoot = path.resolve(options.archive);
const outputRoot = path.resolve(options.out);
const manifest = JSON.parse(await readFile(path.join(archiveRoot, 'manifest.json'), 'utf8'));
const messages = await readJsonLines(path.join(archiveRoot, 'messages.jsonl'));
const privateSpecifications = JSON.parse(await readFile(path.resolve(options.specs), 'utf8'));
const backup = buildPropellerWikiBackup(manifest, messages, privateSpecifications);
await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, 'プロペラWiki下書き.json'),
  `${JSON.stringify(backup, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(outputRoot, 'README.md'),
  `# アプリ投入用 Wiki下書き

\`プロペラWiki下書き.json\` をMeister's Batonの「技術Wiki」→「Wiki下書きを取り込む」から選択します。

- ペラ日記を主資料にした8記事・29項目
- すべて「下書き・確認待ち」で取り込み
- 各項目からDiscord原文へ戻れる
- 添付名・容量・SHA-256を保持（本体は \`../01_一次アーカイブ/media/\`）
- 未確定の材料条件・真空引き・回転試験安全手順を3件の質問として登録

重要: このJSONは一次資料を自動整理したもので、現行手順や安全基準として未承認です。経験者と安全責任者が確認するまで公開しないでください。
`,
  'utf8',
);
console.log(
  `Wiki下書きを生成: ${backup.data.articles.length}記事 / ${backup.data.articles.flatMap((article) => article.claims).length}項目 / ${backup.data.requests.length}確認質問`,
);
console.log(`保存先: ${outputRoot}`);
