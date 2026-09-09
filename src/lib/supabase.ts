import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { makeId } from '../domain/core';
import { parseTeamData } from '../domain';
import type { AuthSession, AuthUser, SyncEnvelope, TeamData } from '../domain/types';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const MEDIA_BUCKET = 'team-media';
export const SUPABASE_MEDIA_LIMIT = 50 * 1024 * 1024;
let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!projectUrl || !publishableKey)
    throw new Error(
      'チーム共有がまだ設定されていません。VITE_SUPABASE_URLとVITE_SUPABASE_PUBLISHABLE_KEYを設定してください。',
    );
  if (!client)
    client = createClient(projectUrl, publishableKey, {
      auth: {
        storageKey: 'meisters-baton-supabase-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(projectUrl && publishableKey);
}

function message(error: unknown, fallback: string): Error {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const translations: [string, string][] = [
    ['Invalid login credentials', 'メールアドレスまたはパスワードが違います。'],
    ['Email not confirmed', '確認メールのリンクを開いてからログインしてください。'],
    ['User already registered', 'このメールアドレスは登録済みです。ログインしてください。'],
    ['ALREADY_IN_TEAM', 'このアカウントはすでに工房へ参加しています。'],
    ['INVITE_NOT_FOUND', '招待コードが見つからないか、有効期限が切れています。'],
    ['INVALID_INVITE', '招待コードを確認してください。'],
    [
      'TEAM_NOT_EMPTY',
      '現在の工房に共有データまたはメンバーがいます。空の新規アカウントで参加してください。',
    ],
    ['OWNER_REQUIRED', '招待コードは工房の管理者だけが作れます。'],
    ['SYNC_CONFLICT', '別の端末で更新されています。共有から取得して差分を確認してください。'],
    ['TEAM_DATA_TOO_LARGE', '共有する文章データが12MBを超えています。'],
    ['DEMO_DATA_NOT_ALLOWED', 'サンプル資料は共有できません。'],
  ];
  return new Error(translations.find(([needle]) => raw.includes(needle))?.[1] ?? (raw || fallback));
}

async function view(session: Session): Promise<AuthSession> {
  const database = supabase();
  const { data: member, error: memberError } = await database
    .from('team_members')
    .select('team_id,display_name,role')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (memberError) throw message(memberError, '工房への所属を確認できませんでした。');
  if (!member)
    throw new Error(
      'このアカウントの工房がまだ作成されていません。登録した端末で確認メールを開くか、もう一度アカウントを作成してください。',
    );
  const { data: team, error: teamError } = await database
    .from('teams')
    .select('id,name')
    .eq('id', member.team_id)
    .single();
  if (teamError || !team) throw message(teamError, '工房を確認できませんでした。');
  const user: AuthUser = {
    id: session.user.id,
    email: session.user.email ?? '',
    name: member.display_name,
    teamId: team.id,
    teamName: team.name,
    role: member.role as AuthUser['role'],
  };
  return { token: session.access_token, user };
}

export async function restoreSupabaseAuth(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase().auth.getSession();
  if (error) throw message(error, 'ログイン状態を確認できませんでした。');
  return data.session ? view(data.session) : null;
}

export function onSupabaseAuthChange(listener: () => void): () => void {
  if (!isSupabaseConfigured()) return () => undefined;
  const { data } = supabase().auth.onAuthStateChange(() => {
    // Supabase recommends keeping async database work outside the auth callback.
    setTimeout(listener, 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function registerSupabase(
  email: string,
  password: string,
  displayName: string,
  teamName: string,
): Promise<AuthSession | null> {
  const database = supabase();
  const { data, error } = await database.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, team_name: teamName },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw message(error, 'アカウントを作成できませんでした。');
  if (!data.user) throw new Error('アカウント作成結果を確認できませんでした。');
  if (!data.session) return null;
  return view(data.session);
}

export async function loginSupabase(email: string, password: string): Promise<AuthSession> {
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw message(error, 'ログインできませんでした。');
  return view(data.session);
}

export async function logoutSupabase(): Promise<void> {
  const { error } = await supabase().auth.signOut({ scope: 'local' });
  if (error) throw message(error, 'ログアウトできませんでした。');
}

export async function getTeamSync(expected: AuthSession): Promise<SyncEnvelope> {
  const { data, error } = await supabase()
    .from('team_state')
    .select('version,data')
    .eq('team_id', expected.user.teamId)
    .single();
  if (error || !data) throw message(error, '共有の記録を取得できませんでした。');
  return { version: Number(data.version), data: parseTeamData(data.data) };
}

export async function replaceTeamSync(
  expected: AuthSession,
  version: number,
  data: TeamData,
): Promise<SyncEnvelope> {
  const valid = parseTeamData(data);
  const result = await supabase().rpc('replace_team_state', {
    p_expected_version: version,
    p_data: valid,
  });
  if (result.error) throw message(result.error, 'チームへ共有できませんでした。');
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error('共有結果を確認できませんでした。');
  const envelope = { version: Number(row.version), data: parseTeamData(row.data) };
  if (envelope.data.workspace.id !== expected.user.teamId)
    throw new Error('共有結果の工房を確認できませんでした。再接続してください。');
  return envelope;
}

export async function createTeamInvite(): Promise<{ code: string; expiresAt: string }> {
  const { data, error } = await supabase().rpc('rotate_team_invite');
  if (error) throw message(error, '招待コードを作成できませんでした。');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code || !row.expires_at) throw new Error('招待コードを確認できませんでした。');
  return { code: row.code, expiresAt: row.expires_at };
}

export async function joinSupabaseTeam(code: string): Promise<AuthSession> {
  const { error } = await supabase().rpc('join_team', { p_code: code });
  if (error) throw message(error, '招待された工房へ参加できませんでした。');
  const { data, error: sessionError } = await supabase().auth.getSession();
  if (sessionError || !data.session)
    throw message(sessionError, '参加後のログイン状態を確認できませんでした。');
  return view(data.session);
}

export async function uploadTeamMedia(expected: AuthSession, blob: Blob): Promise<string> {
  if (!blob.size) throw new Error('動画ファイルが空です。');
  if (blob.size > SUPABASE_MEDIA_LIMIT)
    throw new Error('Supabase無料枠で共有できる動画は1件50MBまでです。');
  const id = `${expected.user.teamId}/${makeId('media')}`;
  const { error } = await supabase().storage.from(MEDIA_BUCKET).upload(id, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw message(error, '動画を共有できませんでした。');
  return id;
}

export async function downloadTeamMedia(expected: AuthSession, id: string): Promise<Blob> {
  if (!id.startsWith(`${expected.user.teamId}/`))
    throw new Error('この動画は現在の工房に属していません。');
  const { data, error } = await supabase().storage.from(MEDIA_BUCKET).download(id);
  if (error || !data) throw message(error, '共有動画を取得できませんでした。');
  return data;
}

async function removeTeamMedia(teamId: string): Promise<void> {
  const database = supabase();
  for (;;) {
    const { data, error } = await database.storage.from(MEDIA_BUCKET).list(teamId, { limit: 1000 });
    if (error) throw message(error, '共有動画の削除準備に失敗しました。');
    const paths = (data ?? []).filter((item) => item.id).map((item) => `${teamId}/${item.name}`);
    if (!paths.length) return;
    const removed = await database.storage.from(MEDIA_BUCKET).remove(paths);
    if (removed.error) throw message(removed.error, '共有動画を削除できませんでした。');
    if (paths.length < 1000) return;
  }
}

export async function deleteSupabaseAccount(
  expected: AuthSession,
  password: string,
): Promise<void> {
  const database = supabase();
  const verified = await database.auth.signInWithPassword({
    email: expected.user.email,
    password,
  });
  if (verified.error) throw message(verified.error, '現在のパスワードを確認できませんでした。');
  const count = await database
    .from('team_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('team_id', expected.user.teamId);
  if (count.error) throw message(count.error, '工房のメンバー数を確認できませんでした。');
  if (count.count === 1) await removeTeamMedia(expected.user.teamId);
  const { error } = await database.rpc('delete_my_account');
  if (error) throw message(error, 'アカウントを削除できませんでした。');
  await database.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
