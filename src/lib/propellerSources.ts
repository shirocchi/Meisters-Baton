import { z } from 'zod';
const attachment = z.object({
  filename: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  mediaPath: z.string(),
  contentType: z.string(),
});
const evidence = z.object({
  id: z.string(),
  quote: z.string(),
  sourceLabel: z.string().optional(),
  sourceUrl: z
    .string()
    .url()
    .refine((url) => new URL(url).origin === 'https://discord.com'),
  sourceAttachments: z.array(attachment).optional(),
});
export const propellerSourceSchema = z.object({
  title: z.string(),
  summary: z.string(),
  claims: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      evidence: z.array(evidence),
      review: z.literal('draft'),
    }),
  ),
});
export type PropellerSource = z.infer<typeof propellerSourceSchema>;
export type PropellerAttachment = z.infer<typeof attachment>;
function config() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error('一次資料の共有サーバーはまだ接続されていません。');
  return { url: url.replace(/\/$/, ''), key };
}
function headers(token: string, key: string) {
  return { apikey: key, Authorization: `Bearer ${token}` };
}
export async function loadPropellerSources(
  slug: string,
  token: string,
  signal: AbortSignal,
): Promise<PropellerSource | null> {
  const { url, key } = config();
  const response = await fetch(
    `${url}/rest/v1/propeller_wiki_sources?slug=eq.${encodeURIComponent(slug)}&select=content`,
    { headers: headers(token, key), signal, cache: 'no-store' },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'ログイン状態または開発メンバー権限を確認してください。'
        : '一次資料を取得できませんでした。通信状態を確認して再試行してください。',
    );
  const rows = z.array(z.object({ content: propellerSourceSchema })).parse(await response.json());
  return rows[0]?.content ?? null;
}
export async function loadPropellerAttachment(
  item: PropellerAttachment,
  token: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('添付資料の識別子が不正です。');
  const { url, key } = config();
  const response = await fetch(
    `${url}/storage/v1/object/authenticated/propeller-wiki-media/${item.sha256}`,
    { headers: headers(token, key), signal, cache: 'no-store' },
  );
  if (!response.ok)
    throw new Error(
      'この添付はまだ共有サーバーに登録されていないか、閲覧権限がありません。Discord原文でも確認できます。',
    );
  return response.blob();
}
