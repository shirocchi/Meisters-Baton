import { wikiArchiveSchema, type WikiArchive, type WikiAsset } from '../domain/growiWiki';
function config(token: string) {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error('技術Wikiの共有サーバーがまだ設定されていません。');
  return {
    url: url.replace(/\/$/, ''),
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  };
}
export async function loadGrowiWiki(token: string, signal: AbortSignal): Promise<WikiArchive> {
  const { url, headers } = config(token);
  const response = await fetch(
    `${url}/rest/v1/propeller_wiki_sources?slug=eq.growi-archive-v1&select=content`,
    { headers, signal, cache: 'no-store' },
  );
  if (!response.ok)
    throw new Error('技術Wikiを取得できません。通信状態とログイン状態を確認してください。');
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.length)
    throw new Error('この工房にはペラWikiの閲覧権限がないか、資料の準備が完了していません。');
  return wikiArchiveSchema.parse(data[0].content);
}
export async function loadWikiAsset(asset: WikiAsset, token: string, signal: AbortSignal) {
  if (!asset.sha256) throw new Error('元Wikiの添付ファイルを取得できていません。');
  const { url, headers } = config(token);
  const r = await fetch(
    `${url}/storage/v1/object/authenticated/propeller-wiki-media/${asset.sha256}`,
    { headers, signal, cache: 'no-store' },
  );
  if (!r.ok) throw new Error('添付を読み込めません。通信状態または閲覧権限を確認してください。');
  const buffer = await r.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  if (buffer.byteLength !== asset.bytes || digest !== asset.sha256)
    throw new Error('添付の内容が保存時と一致しません。');
  return new Blob([buffer], { type: asset.contentType });
}
