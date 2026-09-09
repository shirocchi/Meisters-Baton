import { z } from 'zod';
import { workshopMediaSchema, type WikiEdit, type WikiEvent } from '../domain/wikiWorkshop';
import type { AuthSession } from '../domain/types';
const editSchema = z.object({
  page_id: z.string(),
  title: z.string(),
  body: z.string(),
  version: z.number().int(),
  updated_at: z.string(),
  author: z.string(),
  reason: z.string(),
  events: z.array(
    z.object({
      recordingId: z.string(),
      fingerprint: z.string(),
      heading: z.string(),
      integratedAt: z.string(),
      recording: z
        .object({
          id: z.string(),
          title: z.string(),
          frames: z.array(z.unknown()),
          answers: z.array(z.unknown()),
        })
        .passthrough(),
    }),
  ),
  media: z.array(workshopMediaSchema),
});
async function request(auth: AuthSession, path: string, signal?: AbortSignal, body?: unknown) {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error('Wikiの共有先が設定されていません。');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ?? AbortSignal.timeout(30000),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (String(payload?.message).includes('WIKI_CONFLICT'))
      throw Error(
        '別の更新が先に保存されました。入力は残っています。最新の本文と比較してから保存してください。',
      );
    throw Error('Wikiの更新を保存・取得できません。接続と閲覧権限を確認してください。');
  }
  return payload;
}
export async function loadWikiEdits(auth: AuthSession, signal?: AbortSignal): Promise<WikiEdit[]> {
  return z
    .array(editSchema)
    .parse(
      await request(
        auth,
        `wiki_page_edits?team_id=eq.${encodeURIComponent(auth.user.teamId)}&select=*`,
        signal,
      ),
    ) as unknown as WikiEdit[];
}
export async function loadWikiHistory(
  auth: AuthSession,
  pageId: string,
  signal?: AbortSignal,
): Promise<WikiEdit[]> {
  return z
    .array(editSchema)
    .parse(
      await request(
        auth,
        `wiki_page_revisions?team_id=eq.${encodeURIComponent(auth.user.teamId)}&page_id=eq.${encodeURIComponent(pageId)}&select=*&order=version.desc&limit=50`,
        signal,
      ),
    ) as unknown as WikiEdit[];
}
export async function saveWikiEdit(
  auth: AuthSession,
  edit: Omit<WikiEdit, 'version' | 'updated_at' | 'author'>,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<WikiEdit> {
  return editSchema.parse(
    await request(auth, 'rpc/save_wiki_page', signal, {
      p_page_id: edit.page_id,
      p_title: edit.title,
      p_body: edit.body,
      p_expected_version: expectedVersion,
      p_reason: edit.reason,
      p_events: edit.events as WikiEvent[],
      p_media: edit.media,
    }),
  ) as unknown as WikiEdit;
}
