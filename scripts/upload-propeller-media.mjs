// Administrator-only, one-time ingestion. End users never run an import.
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--archive') || !args.includes('--backup'))
  throw new Error(
    'Usage: node scripts/upload-propeller-media.mjs --archive <directory> --backup <private JSON> [--apply]',
  );
const root = await realpath(option('--archive'));
const backup = JSON.parse(await readFile(option('--backup'), 'utf8'));
const attachments = new Map();
for (const article of backup.data.articles)
  for (const claim of article.claims)
    for (const evidence of claim.evidence)
      for (const item of evidence.sourceAttachments ?? []) attachments.set(item.sha256, item);
const files = [];
for (const item of attachments.values()) {
  if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid content hash');
  const filename = await realpath(path.resolve(root, item.mediaPath));
  const relative = path.relative(root, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Attachment path is outside the selected archive');
  const bytes = await readFile(filename);
  if (
    bytes.length !== item.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== item.sha256
  )
    throw new Error('Attachment size/hash does not match the archive');
  files.push({ item, bytes });
}
console.log(
  `Validated ${files.length} attachments / ${files.reduce((sum, file) => sum + file.bytes.length, 0)} bytes.`,
);
if (!args.includes('--apply')) {
  console.log('Dry run only. No network requests or uploads.');
} else {
  const origin = new URL(process.env.SUPABASE_URL ?? '');
  if (
    origin.protocol !== 'https:' ||
    !/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname) ||
    origin.username ||
    origin.password
  )
    throw new Error('SUPABASE_URL must identify the intended hosted project');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error(
      'An administrator must supply SUPABASE_SERVICE_ROLE_KEY in the process environment, never in source code or VITE_*.',
    );
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const bucketUrl = `${origin.origin}/storage/v1/bucket/propeller-wiki-media`;
  const bucketResponse = await fetch(bucketUrl, { headers, redirect: 'error' });
  if (!bucketResponse.ok || (await bucketResponse.json()).public !== false)
    throw new Error('The private Wiki bucket could not be verified. Nothing uploaded.');
  for (const { item, bytes } of files) {
    const objectUrl = `${origin.origin}/storage/v1/object`;
    const readUrl = `${objectUrl}/authenticated/propeller-wiki-media/${item.sha256}`;
    const existing = await fetch(readUrl, { headers, redirect: 'error' });
    if (existing.ok) {
      if (
        createHash('sha256')
          .update(Buffer.from(await existing.arrayBuffer()))
          .digest('hex') !== item.sha256
      )
        throw new Error('An existing object has unexpected bytes. No overwrite attempted.');
      continue;
    }
    const failure = await existing.json().catch(() => ({}));
    if (
      ![400, 404].includes(existing.status) ||
      (existing.status === 400 && failure.statusCode !== '404' && failure.error !== 'not_found')
    )
      throw new Error(`Cannot inspect existing object (HTTP ${existing.status}).`);
    const response = await fetch(`${objectUrl}/propeller-wiki-media/${item.sha256}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': item.contentType,
        'Cache-Control': 'private, no-store',
        'x-upsert': 'false',
      },
      body: bytes,
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(
        `Upload stopped (HTTP ${response.status}); existing objects were not overwritten.`,
      );
    const verify = await fetch(readUrl, { headers, redirect: 'error', cache: 'no-store' });
    if (
      !verify.ok ||
      createHash('sha256')
        .update(Buffer.from(await verify.arrayBuffer()))
        .digest('hex') !== item.sha256
    )
      throw new Error('Uploaded object failed its read-back hash check.');
  }
  console.log('All referenced attachments are present and verified in the private bucket.');
}
