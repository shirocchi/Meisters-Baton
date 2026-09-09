import { z } from 'zod';

export const growiOrigin = 'https://wiki2.meister.tech';
export const wikiAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  bytes: z.number(),
  contentType: z.string(),
  url: z.string(),
  downloadUrl: z.string(),
  fileName: z.string().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  error: z.string().optional(),
});
export const wikiPageSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  body: z.string(),
  revisionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: z.string(),
  sha256: z.string(),
  isEmpty: z.boolean().optional(),
  unavailable: z.string().optional(),
  commentCount: z.number().default(0),
  attachments: z.array(wikiAssetSchema),
});
export const wikiArchiveSchema = z.object({
  format: z.literal('baton-growi-archive'),
  version: z.literal(1),
  origin: z.literal(growiOrigin),
  root: z.literal('/ペラ'),
  exportedAt: z.string(),
  expectedPages: z.number(),
  pages: z.array(wikiPageSchema),
  home: wikiPageSchema.optional(),
  diary: z.array(wikiPageSchema).optional(),
});
export type WikiPage = z.infer<typeof wikiPageSchema>;
export type WikiAsset = z.infer<typeof wikiAssetSchema>;
export type WikiArchive = z.infer<typeof wikiArchiveSchema>;
export function wikiRoute(id: string, heading?: string) {
  return `#library/wiki/${encodeURIComponent(id)}${heading ? `?heading=${encodeURIComponent(heading)}` : ''}`;
}
export function wikiLink(href: string, page: WikiPage, pages: WikiPage[]): string {
  if (!href) return '';
  if (href.startsWith('#')) return wikiRoute(page.id, href.slice(1));
  let url: URL;
  try {
    url = new URL(href, `${growiOrigin}${page.path}/`);
  } catch {
    return '';
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return '';
  if (url.origin !== growiOrigin) return url.href;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname).replace(/\/$/, '');
  } catch {
    return url.href;
  }
  const found = pages.find(
    (p) => p.path.replace(/\/$/, '') === pathname || `/${p.id}` === pathname,
  );
  return found ? wikiRoute(found.id, decodeURIComponent(url.hash.slice(1))) : url.href;
}
export function wikiAssetFor(href: string, assets: WikiAsset[]): WikiAsset | undefined {
  try {
    const url = new URL(href, growiOrigin);
    if (url.origin !== growiOrigin) return undefined;
    return assets.find((a) =>
      [a.url, a.downloadUrl, `/uploads/${a.fileName}`].includes(url.pathname),
    );
  } catch {
    return undefined;
  }
}
export function searchWiki(pages: WikiPage[], query: string) {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return pages.filter((p) =>
    words.every((word) =>
      `${p.path}\n${p.body}`.normalize('NFKC').toLocaleLowerCase().includes(word),
    ),
  );
}
/** GROWI's list macro remains navigable, without running macros or remote scripts. */
export function expandWikiLists(body: string, current: WikiPage, pages: WikiPage[]) {
  return body.replace(/\$lsx(?:\(([^\n)]*)\))?/g, (_match, args: string | undefined) => {
    const prefix = args?.trim().startsWith('/') ? args.split(',')[0].trim() : current.path;
    return (
      '\n' +
      pages
        .filter((p) => p.path.startsWith(prefix.replace(/\/$/, '') + '/'))
        .map(
          (p) =>
            `${'  '.repeat(Math.max(0, p.path.slice(prefix.length + 1).split('/').length - 1))}- [${p.title}](${growiOrigin}/${p.id})`,
        )
        .join('\n') +
      '\n'
    );
  });
}
