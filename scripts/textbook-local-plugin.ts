import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
/** Local-only curated source preview. Never copied into dist or exposed in production. */
export function textbookLocalSources(): Plugin {
  const folder = resolve('.verification/textbook-review');
  return {
    name: 'textbook-local-sources',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (!pathname.startsWith('/__textbook/')) return next();
        const host = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.exec(
          req.headers.host ?? '',
        )?.[1];
        if (!host || !['GET', 'HEAD'].includes(req.method ?? '')) {
          res.statusCode = 403;
          res.end();
          return;
        }
        try {
          const raw = JSON.parse(await readFile(resolve(folder, 'source-curriculum.json'), 'utf8'));
          const sourceRoot = raw.sourceRoot;
          const media: Array<{ path: string; id: string }> = [];
          for (const stage of Object.values(raw.stages) as any[])
            for (const practice of stage.practice)
              for (const item of practice.media ?? []) {
                const id = String(media.length);
                media.push({ path: item.path, id });
                item.localUrl = `/__textbook/media/${id}`;
                delete item.path;
              }
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          if (pathname === '/__textbook/sources') {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({ version: raw.version, stages: raw.stages, localArchive: true }),
            );
            return;
          }
          const item = media.find((m) => pathname === `/__textbook/media/${m.id}`);
          if (!item) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const root = await realpath(sourceRoot);
          const file = await realpath(item.path);
          if (!file.startsWith(root + sep)) {
            res.statusCode = 403;
            res.end();
            return;
          }
          const extension = file.split('.').at(-1)?.toLowerCase();
          const mime = (
            {
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              png: 'image/png',
              webp: 'image/webp',
              gif: 'image/gif',
              mp4: 'video/mp4',
              mov: 'video/quicktime',
            } as Record<string, string>
          )[extension ?? ''];
          if (!mime) {
            res.statusCode = 415;
            res.end();
            return;
          }
          const bytes = await readFile(file);
          res.setHeader('Content-Type', mime);
          res.setHeader('Accept-Ranges', 'bytes');
          if (req.headers.range) {
            const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
            const start = range?.[1]
              ? Number(range[1])
              : Math.max(0, bytes.length - Number(range?.[2]));
            const end =
              range?.[1] && range[2]
                ? Math.min(Number(range[2]), bytes.length - 1)
                : bytes.length - 1;
            if (!range || !Number.isSafeInteger(start) || start >= bytes.length || start > end) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${bytes.length}`);
              res.end();
              return;
            }
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
            res.setHeader('Content-Length', end - start + 1);
            res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
            return;
          }
          res.setHeader('Content-Length', bytes.length);
          res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch {
          res.statusCode = 404;
          res.end('Local textbook sources unavailable');
        }
      });
    },
  };
}
