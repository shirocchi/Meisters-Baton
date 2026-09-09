import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const origin = 'https://wiki2.meister.tech';
const output = path.resolve(process.env.GROWI_OUTPUT || '.data/growi');
const cookies = new Map();
async function request(endpoint, init = {}, hops = 0) {
  if (hops > 4) throw new Error('Too many source redirects');
  const url = new URL(endpoint, origin);
  if (url.origin !== origin) throw new Error('Unexpected authenticated destination');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(url.pathname.startsWith('/attachment/') ? 900000 : 30000),
    ...init,
    redirect: 'manual',
    headers: {
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...init.headers,
    },
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const split = pair.indexOf('=');
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  if (response.status >= 300 && response.status < 400) {
    const target = new URL(response.headers.get('location'), url);
    if (target.origin === origin) return request(target.href, init, hops + 1);
    throw new Error(`External attachment redirect: ${target.origin}`);
  }
  if (!response.ok) throw new Error(`GROWI ${response.status}: ${url.pathname}`);
  return response;
}
const login = await (await request('/login')).text();
const csrf = JSON.parse(login.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)[1]).props
  .pageProps.csrfToken;
await request('/_api/v3/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({
    loginForm: { username: process.env.GROWI_USERNAME, password: process.env.GROWI_PASSWORD },
    _csrf: csrf,
  }),
});
delete process.env.GROWI_PASSWORD;
await mkdir(output, { recursive: true });
let listing = [];
let total = Infinity;
for (let page = 1; listing.length < total; page++) {
  const result = await (
    await request(`/_api/v3/pages/list?path=%2F%E3%83%9A%E3%83%A9&limit=100&page=${page}`)
  ).json();
  total = result.totalCount;
  if (!result.pages.length && listing.length < total) throw new Error('Incomplete listing');
  listing.push(...result.pages);
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(path.join(output, 'pages'), { recursive: true });
await mkdir(path.join(output, 'media'), { recursive: true });
const pages = [];
const failures = [];
for (const item of listing) {
  if (item.path !== '/ペラ' && !item.path.startsWith('/ペラ/'))
    throw new Error('Outside requested scope');
  const target = path.join(output, 'pages', `${item._id}.json`);
  let saved;
  try {
    saved = JSON.parse(await readFile(target, 'utf8'));
  } catch {}
  if (saved?.revisionId === item.revision) {
    pages.push(saved);
    console.log(`Cached ${pages.length}/${total} ${item.path}`);
    continue;
  }
  let p;
  let unavailable;
  try {
    p = item.isEmpty
      ? { ...item, revision: null }
      : (await (await request(`/_api/v3/page?pageId=${item._id}`)).json()).page;
  } catch (e) {
    unavailable = e.message;
    p = { ...item, revision: null };
    failures.push({ pageId: item._id, path: item.path, error: unavailable });
  }
  const attachments = [];
  for (let n = 1; !unavailable; n++) {
    const { paginateResult: a } = await (
      await request(`/_api/v3/attachment/list?pageId=${p._id}&limit=100&pageNumber=${n}`)
    ).json();
    attachments.push(...a.docs);
    if (!a.hasNextPage) {
      if (attachments.length !== a.totalDocs) throw new Error('Attachment pagination mismatch');
      break;
    }
  }
  const media = attachments.map((a) => ({
    id: a._id,
    name: a.originalName,
    bytes: a.fileSize,
    contentType: a.fileFormat,
    url: a.filePathProxied,
    downloadUrl: a.downloadPathProxied,
    fileName: a.fileName,
  }));
  const doc = {
    id: p._id,
    path: p.path,
    title: p.path.split('/').at(-1),
    parentId: p.parent,
    revisionId: p.revision?._id ?? null,
    body: p.revision?.body ?? '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    author: p.lastUpdateUser?.username ?? '',
    commentCount: p.commentCount ?? 0,
    isEmpty: p.isEmpty ?? false,
    unavailable,
    attachments: media,
  };
  doc.sha256 = hash(Buffer.from(doc.body));
  await writeFile(target, JSON.stringify(doc, null, 2));
  pages.push(doc);
  console.log(`Saved ${pages.length}/${total} ${p.path}: ${media.length} attachments`);
}
const archive = {
  format: 'baton-growi-archive',
  version: 1,
  origin,
  root: '/ペラ',
  exportedAt: new Date().toISOString(),
  expectedPages: total,
  pages,
  failures,
};
await writeFile(path.join(output, 'archive.json'), JSON.stringify(archive, null, 2));
console.log(
  JSON.stringify({
    pages: pages.length,
    attachments: pages.flatMap((p) => p.attachments).length,
    failures,
  }),
);
if (process.argv.includes('--media')) {
  const items = pages
    .flatMap((p) => p.attachments.map((a) => ({ p, a })))
    .sort((x, y) => x.a.bytes - y.a.bytes);
  let cursor = 0;
  await mkdir(path.join(output, 'media-map'), { recursive: true });
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < items.length) {
        const { p, a } = items[cursor++];
        try {
          const cached = await readFile(
            path.join(output, 'media-map', a.id + '.json'),
            'utf8',
          ).catch(() => null);
          if (cached) {
            Object.assign(a, JSON.parse(cached));
            continue;
          }
          const r = await request(a.url);
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length !== a.bytes)
            throw new Error(`Size mismatch: ${bytes.length}/${a.bytes}`);
          a.sha256 = hash(bytes);
          await writeFile(path.join(output, 'media', a.sha256), bytes);
          await writeFile(
            path.join(output, 'media-map', a.id + '.json'),
            JSON.stringify({ sha256: a.sha256 }),
          );
          console.log(`Media ${cursor}/${items.length} ${a.name} ${a.bytes}`);
        } catch (e) {
          failures.push({ pageId: p.id, attachmentId: a.id, error: e.message });
          console.log(`FAILED ${a.id}: ${e.message}`);
        }
      }
    }),
  );
  await writeFile(path.join(output, 'archive.json'), JSON.stringify(archive, null, 2));
  console.log(
    JSON.stringify({
      downloaded: items.filter((x) => x.a.sha256).length,
      total: items.length,
      failures,
    }),
  );
}
