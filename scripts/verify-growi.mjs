import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(process.env.GROWI_OUTPUT || '.data/growi');
const a = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (a.pages.length !== a.expectedPages || new Set(a.pages.map((p) => p.id)).size !== a.pages.length)
  throw new Error('Page listing count/identity mismatch');
for (const p of a.pages)
  if (hash(Buffer.from(p.body)) !== p.sha256) throw new Error('Body hash mismatch: ' + p.id);
const items = a.pages.flatMap((p) => p.attachments);
const downloaded = items.filter((a) => a.sha256);
const unique = [...new Map(downloaded.map((a) => [a.sha256, a])).values()];
for (const f of downloaded) {
  const b = await readFile(path.join(root, 'media', f.sha256));
  if (b.length !== f.bytes || hash(b) !== f.sha256)
    throw new Error('Attachment integrity mismatch: ' + f.id);
}
const refs = [
  ...new Set(
    a.pages.flatMap((p) =>
      [...p.body.matchAll(/\/(?:attachment|download)\/([a-f0-9]{24})/g)].map((m) => m[1]),
    ),
  ),
];
const report = {
  verifiedAt: new Date().toISOString(),
  pages: {
    listed: a.pages.length,
    readable: a.pages.filter((p) => !p.unavailable).length,
    unavailable: a.pages
      .filter((p) => p.unavailable)
      .map((p) => ({ id: p.id, path: p.path, error: p.unavailable })),
  },
  diaryPages: a.diary.length,
  attachments: {
    registered: items.length,
    downloaded: downloaded.length,
    uniqueFiles: unique.length,
    uniqueBytes: unique.reduce((s, a) => s + a.bytes, 0),
    unavailable: items
      .filter((a) => !a.sha256)
      .map((a) => ({
        id: a.id,
        url: a.url,
        name: a.name,
        error: a.error || 'Original file missing from source storage',
      })),
  },
  bodyReferences: {
    count: refs.length,
    verified: refs.filter((id) => downloaded.some((a) => a.id === id)).length,
    unavailable: refs.filter((id) => !downloaded.some((a) => a.id === id)),
  },
};
await writeFile(path.join(root, 'verification.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    ...report,
    attachments: { ...report.attachments, unavailable: report.attachments.unavailable.length },
  }),
);
