import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(process.env.GROWI_OUTPUT || '.data/growi');
const diaryRoot = process.env.DISCORD_ARCHIVE;
const backupPath = process.env.DISCORD_WIKI_BACKUP;
if (!diaryRoot || !backupPath)
  throw new Error('DISCORD_ARCHIVE and DISCORD_WIKI_BACKUP are required');
const hash = (body) => createHash('sha256').update(body).digest('hex');
const archive = JSON.parse(await readFile(path.join(root, 'archive.json'), 'utf8'));
for (const page of archive.pages)
  for (const asset of page.attachments) {
    const saved = await readFile(path.join(root, 'media-map', asset.id + '.json'), 'utf8').catch(
      () => null,
    );
    if (saved) Object.assign(asset, JSON.parse(saved));
  }
const backup = JSON.parse(await readFile(backupPath, 'utf8'));
const now = new Date().toISOString();
function page(id, title, body) {
  return {
    id,
    title,
    path: `/ペラ日記/${title}`,
    body,
    revisionId: null,
    createdAt: now,
    updatedAt: now,
    author: 'ペラ日記から整理（確認待ち）',
    sha256: hash(body),
    commentCount: 0,
    attachments: [],
  };
}
archive.diary = backup.data.articles.map((a) =>
  page(
    'diary-' + a.id.replace('discord_article_', ''),
    a.title,
    '# ' +
      a.title +
      '\n\n' +
      a.summary +
      '\n\n> ペラ日記の記録から整理した確認待ちのページです。原文と製作条件を照合して利用してください。\n\n' +
      a.claims
        .map(
          (c) =>
            `## ${c.title}\n\n${c.body}\n\n` +
            c.evidence
              .map(
                (e) =>
                  `### ${e.sourceLabel || '根拠の原文'}\n\n${e.quote
                    .split('\n')
                    .map((l) => '> ' + l)
                    .join('\n')}\n\n[Discord原文](${e.sourceUrl})\n`,
              )
              .join('\n'),
        )
        .join('\n'),
  ),
);
const messages = (await readFile(path.join(diaryRoot, 'messages.jsonl'), 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse)
  .filter((m) => m.channel_id === '1391736630737633290')
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
const months = [...new Set(messages.map((m) => m.timestamp.slice(0, 7)))];
for (const month of months) {
  const items = messages.filter((m) => m.timestamp.startsWith(month));
  const body =
    `# ペラ日記 ${month}\n\n26代ペラ日記の原文 ${items.length}投稿。写真・動画は投稿末尾のDiscord原文で確認できます。\n\n` +
    items
      .map(
        (m) =>
          `## ${m.timestamp.slice(0, 10)} ${m.author?.global_name || m.author?.username || '投稿者'}\n\n${m.content || '（本文なし・添付のみ）'}\n\n` +
          (m.attachments ?? []).map((a) => `- 添付：${a.filename}`).join('\n') +
          `\n\n[Discord原文](https://discord.com/channels/1384740821034729567/${m.channel_id}/${m.id})\n`,
      )
      .join('\n');
  const p = page('diary-month-' + month, 'ペラ日記 ' + month, body);
  p.createdAt = items[0].timestamp;
  p.updatedAt = items.at(-1).timestamp;
  p.author = '26代ペラ日記（原文）';
  archive.diary.push(p);
}
const body = await readFile(path.join(root, 'home.md'), 'utf8');
archive.home = {
  ...page('home', 'カーボンモノコックマニュアル', body),
  path: '/カーボンモノコックマニュアル',
  author: 'Meister Wiki × 26代ペラ日記（統合・確認待ち）',
};
await writeFile(path.join(root, 'package.json'), JSON.stringify(archive));
console.log(
  JSON.stringify({
    wikiPages: archive.pages.length,
    diaryPages: archive.diary.length,
    diaryMessages: messages.length,
    attachments: archive.pages.flatMap((p) => p.attachments).length,
    downloaded: archive.pages.flatMap((p) => p.attachments).filter((a) => a.sha256).length,
  }),
);
