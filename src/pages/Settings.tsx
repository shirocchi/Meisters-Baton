import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Check,
  ChevronDown,
  CloudDownload,
  CloudUpload,
  Download,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge, Modal, PageTitle } from '../components/ui';
import { useBaton } from '../state';
import { createDemoData, createEmptyData, parseTeamData } from '../domain';
import type { AuthSession, AuthUser, SyncEnvelope, TeamData } from '../domain/types';
import type { WikiConnection } from '../domain/processVideo';
import { api, assertAuthSession } from '../lib/api';
import { checkLaptopConnection, LAPTOP_API_URL } from '../lib/laptopConnection';
import {
  createTeamInvite,
  deleteSupabaseAccount,
  downloadTeamMedia,
  getTeamSync,
  isSupabaseConfigured,
  joinSupabaseTeam,
  loginSupabase,
  logoutSupabase,
  registerSupabase,
  replaceTeamSync,
  uploadTeamMedia,
} from '../lib/supabase';
import {
  BACKUP_NOTICE,
  clearLocalData,
  exportBackup,
  getMedia,
  importBackup,
  mergeTeamData,
  putMedia,
  saveData,
  saveSettings,
  defaultSettings,
} from '../lib/storage';
import { downloadFile } from '../lib/media';

// A baseline is kept only for the current app session, never with credentials on disk.
const syncBaselines = new Map<string, SyncEnvelope>();
// Opening a second Settings instance must not let a previous asynchronous operation
// apply results after the connection, account, or local workspace has changed.
let settingsOperation = 0;
const collections = ['recordings', 'articles', 'requests', 'activity'] as const;
const settingsSections = [
  { id: 'settings-profile', label: '記録する人と工房' },
  { id: 'settings-team', label: 'チームで引き継ぐ' },
  { id: 'settings-ai', label: 'AIとチーム共有' },
  { id: 'settings-backup', label: '記録を手元に残す' },
  { id: 'settings-about', label: 'このアプリについて' },
  { id: 'settings-data', label: 'データの管理' },
];
type CollectionItem = TeamData[(typeof collections)[number]][number];
function validUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    ['id', 'email', 'name', 'teamId', 'teamName'].every(
      (key) => typeof user[key] === 'string' && Boolean(user[key]),
    ) &&
    (user.role === 'owner' || user.role === 'member')
  );
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? '';
}
function content(item: CollectionItem): string {
  if ('frames' in item) {
    const { frames: _frames, mediaId: _media, remoteMediaId: _remote, ...value } = item;
    return stable(value);
  }
  if ('bookmarked' in item) {
    const { bookmarked: _bookmark, ...value } = item;
    return stable(value);
  }
  return stable(item);
}
/** No demonstration recordings, articles, or linked activity cross the team boundary. */
export function shareableData(data: TeamData): TeamData {
  const result = { ...data };
  result.recordings = result.recordings.filter(
    (record) => !record.isDemo && record.analysis?.mode !== 'demo',
  );
  const recordingIds = new Set(result.recordings.map((record) => record.id));
  result.articles = result.articles.filter(
    (article) => !article.isDemo && recordingIds.has(article.recordingId),
  );
  const articleIds = new Set(result.articles.map((article) => article.id));
  result.requests = result.requests.filter(
    (request) => !request.articleId || articleIds.has(request.articleId),
  );
  const ids = new Set([
    ...recordingIds,
    ...articleIds,
    ...result.requests.map((request) => request.id),
  ]);
  result.activity = result.activity.filter(
    (activity) => !activity.targetId || ids.has(activity.targetId),
  );
  return result;
}
/** Three-way merge: keep every record and never silently replace divergent edits. */
export function reconcileTeamData(
  local: TeamData,
  remote: TeamData,
  baseline?: TeamData,
): TeamData {
  const merged = structuredClone(local);
  const additions = createEmptyData(local.workspace.name);
  for (const collection of collections) {
    const items = merged[collection] as CollectionItem[];
    const previous = baseline?.[collection] as CollectionItem[] | undefined;
    for (const incoming of remote[collection]) {
      const index = items.findIndex((item) => item.id === incoming.id);
      if (index < 0) {
        (additions[collection] as CollectionItem[]).push(structuredClone(incoming));
        continue;
      }
      const current = items[index];
      const before = previous?.find((item) => item.id === incoming.id);
      const same = content(current) === content(incoming);
      if (
        !same &&
        (!before || (content(current) !== content(before) && content(incoming) !== content(before)))
      ) {
        throw new Error(
          `「${'title' in current ? current.title : 'text' in current ? current.text : '記録'}」が端末と共有先で異なります。上書きせず停止しました。両方をバックアップし、内容を確認してください。`,
        );
      }
      if (same || (before && content(current) === content(before))) {
        let value: CollectionItem = structuredClone(incoming);
        if ('frames' in current && 'frames' in value)
          value = {
            ...value,
            mediaId: current.mediaId,
            frames: current.frames.length ? current.frames : value.frames,
          };
        if ('bookmarked' in current && 'bookmarked' in value)
          value = { ...value, bookmarked: current.bookmarked };
        items[index] = value;
      }
    }
  }
  const combined = structuredClone(merged);
  for (const collection of collections)
    (combined[collection] as CollectionItem[]).push(...additions[collection]);
  return parseTeamData(combined);
}
export function validateApiBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('https://から始まる接続先を入力してください。');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && local && !Capacitor.isNativePlatform())
  )
    throw new Error('接続先はHTTPSを使ってください。開発用ブラウザーではlocalhostも使えます。');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error(
      '接続先にはサーバーのアドレスだけを入力してください。パスや認証情報は含められません。',
    );
  return url.origin;
}

export function SettingsPage() {
  const { data, settings, auth, mutate, configure, setAuth, toast, navigate } = useBaton();
  const [name, setName] = useState(settings.displayName);
  const [workshop, setWorkshop] = useState(data.workspace.name);
  const [baseUrl, setBaseUrl] = useState(settings.apiBaseUrl);
  const [health, setHealth] = useState<{
    ok: boolean;
    aiConfigured: boolean;
    model: string;
  } | null>(null);
  const [wikiConnection, setWikiConnection] = useState<WikiConnection | null>(null);
  useEffect(() => {
    setWikiConnection(null);
  }, [auth?.user.id, auth?.user.teamId, settings.apiBaseUrl]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [syncNote, setSyncNote] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [modal, setModal] = useState<'clear' | 'delete' | 'join' | 'push' | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [notices, setNotices] = useState<string | null>(null);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState('');
  const noticesRequest = useRef<AbortController | null>(null);
  useEffect(() => () => noticesRequest.current?.abort(), []);
  const loadNotices = async () => {
    setNoticesOpen(true);
    setNoticesError('');
    if (notices !== null) return;
    noticesRequest.current?.abort();
    const controller = new AbortController();
    noticesRequest.current = controller;
    setNoticesLoading(true);
    try {
      const response = await fetch('/third-party-notices.txt', { signal: controller.signal });
      if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
        throw new Error('ライセンスを読み込めませんでした。');
      const text = await response.text();
      if (!text.trim()) throw new Error('ライセンスを読み込めませんでした。');
      if (!controller.signal.aborted) setNotices(text);
    } catch (cause) {
      if (!controller.signal.aborted)
        setNoticesError(
          'ライセンスを読み込めませんでした。通信が利用できる状態で再度お試しください。',
        );
    } finally {
      if (noticesRequest.current === controller) setNoticesLoading(false);
    }
  };
  const [importFile, setImportFile] = useState<{
    name: string;
    text: string;
    count: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(0);
  const currentData = useRef(data);
  currentData.current = data;
  const syncKey = auth ? `supabase|${auth.user.id}|${auth.user.teamId}` : '';
  const actual = shareableData(data);
  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return;
    operationRef.current = ++settingsOperation;
    setBusy(label);
    setError('');
    try {
      await task();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '操作を完了できませんでした。もう一度お試しください。',
      );
    } finally {
      setBusy('');
    }
  };
  const assertCurrentOperation = () => {
    if (operationRef.current !== settingsOperation)
      throw new Error(
        '別の設定操作が始まったため、この処理を停止しました。現在のチームを確認して再実行してください。',
      );
  };
  const assertSession = () => {
    assertCurrentOperation();
    if (!auth) throw new Error('チームにログインしてください。');
    assertAuthSession(auth.token, settings, auth.user.teamId);
  };
  const teamMutate = (fn: (current: TeamData) => TeamData) =>
    mutate((current) => {
      assertSession();
      return fn(current);
    });
  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    void run('保存中', async () => {
      if (!name.trim() || !workshop.trim()) throw new Error('表示名と工房名を入力してください。');
      await configure({ displayName: name.trim() });
      await mutate((value) => ({
        ...value,
        workspace: { ...value.workspace, name: workshop.trim() },
      }));
      toast('表示名と、この端末の工房名を保存しました');
    });
  };
  const connect = (event: FormEvent) => {
    event.preventDefault();
    void run('接続中', async () => {
      if (mode === 'register' && !name.trim())
        throw new Error('先に記録に使う表示名を入力してください。');
      if (!isSupabaseConfigured()) throw new Error('Supabaseの接続情報がまだ設定されていません。');
      const session =
        mode === 'login'
          ? await loginSupabase(email.trim(), password)
          : await registerSupabase(email.trim(), password, name.trim(), teamName.trim());
      assertCurrentOperation();
      if (!session) {
        setPassword('');
        setSyncNote('確認メールを送りました。メール内のリンクを開いてからログインしてください。');
        toast('確認メールを送りました');
        return;
      }
      if (
        !session ||
        typeof session.token !== 'string' ||
        !session.token ||
        !validUser(session.user)
      )
        throw new Error('ログイン情報を取得できませんでした。Supabaseの設定を確認してください。');
      setAuth(session);
      setPassword('');
      setInvite(null);
      setSyncNote('接続しました。取得・送信は下のボタンから行えます。');
      toast(`${session.user.teamName}に接続しました`);
    });
  };
  const assertWorkspace = () => {
    assertSession();
    if (!auth) throw new Error('チームにログインしてください。');
    // Local workspaces use workspace_ IDs; a server-assigned UUID binds a shared workspace.
    if (
      !data.workspace.id.startsWith('workspace_') &&
      data.workspace.id !== auth.user.teamId &&
      (actual.recordings.length || actual.articles.length || actual.requests.length)
    )
      throw new Error(
        'この端末には別のチームの記録があります。バックアップして端末の記録を消去してから、接続先の記録を取得してください。別チームへ自動では共有しません。',
      );
  };
  const getRemote = async () => {
    assertSession();
    const remote = await getTeamSync(auth!);
    assertSession();
    if (!remote || !Number.isSafeInteger(remote.version) || remote.version < 0)
      throw new Error('共有先の情報を確認できません。再接続してください。');
    remote.data = parseTeamData(remote.data);
    if (!auth || remote.data.workspace.id !== auth.user.teamId)
      throw new Error('共有先のチームを確認できません。再接続してください。');
    return remote;
  };
  const pull = () =>
    void run('共有の記録を取得中', async () => {
      assertWorkspace();
      const remote = await getRemote();
      const merged = reconcileTeamData(
        currentData.current,
        remote.data,
        syncBaselines.get(syncKey)?.data,
      );
      let unavailable = 0;
      for (const record of merged.recordings) {
        assertSession();
        if (!record.remoteMediaId || (record.mediaId && (await getMedia(record.mediaId)))) continue;
        try {
          const blob = await downloadTeamMedia(auth!, record.remoteMediaId);
          assertSession();
          record.mediaId = await putMedia(blob);
        } catch {
          assertSession();
          unavailable++;
        }
      }
      await teamMutate((current) => {
        // If a page in the same app changed data while media loaded, recheck before committing.
        const safe = reconcileTeamData(current, remote.data, syncBaselines.get(syncKey)?.data);
        return {
          ...safe,
          workspace: remote.data.workspace,
          recordings: safe.recordings.map((record) => ({
            ...record,
            mediaId:
              merged.recordings.find((item) => item.id === record.id)?.mediaId ?? record.mediaId,
          })),
        };
      });
      assertSession();
      syncBaselines.set(syncKey, remote);
      setWorkshop(remote.data.workspace.name);
      setSyncNote(
        `共有の記録を取得しました。${unavailable ? `動画${unavailable}件は保存できませんでした。再度取得すると再試行できます。` : '動画もこの端末から再生できます。'}`,
      );
      toast(
        unavailable
          ? '文章を取得しました。一部の動画は再取得が必要です'
          : '共有の記録をこの端末に保存しました',
      );
    });
  const push = () =>
    void run('チームへ送信中', async () => {
      assertWorkspace();
      setModal(null);
      const initial = structuredClone(currentData.current);
      const remote = await getRemote();
      const merged = reconcileTeamData(
        shareableData(initial),
        remote.data,
        syncBaselines.get(syncKey)?.data,
      );
      for (const record of merged.recordings) {
        assertSession();
        if (record.remoteMediaId || !record.mediaId) continue;
        const blob = await getMedia(record.mediaId);
        if (!blob)
          throw new Error(
            `「${record.title}」の元動画がこの端末にありません。元動画を保存した端末から共有してください。`,
          );
        if (blob.size > 50 * 1024 * 1024)
          throw new Error(
            `「${record.title}」の動画がSupabase無料枠の共有上限50MBを超えています。端末の記録は残っています。`,
          );
        const mediaId = await uploadTeamMedia(auth!, blob);
        assertSession();
        if (!mediaId)
          throw new Error('動画の共有結果を取得できませんでした。端末の元動画は残っています。');
        record.remoteMediaId = mediaId;
        await teamMutate((current) => ({
          ...current,
          workspace: { id: auth!.user.teamId, name: auth!.user.teamName },
          recordings: current.recordings.map((item) =>
            item.id === record.id ? { ...item, remoteMediaId: mediaId } : item,
          ),
        }));
      }
      const outgoing = {
        ...merged,
        workspace: remote.data.workspace,
        recordings: merged.recordings.map((record) => ({
          ...record,
          mediaId: undefined,
          frames: [],
        })),
      };
      // The version belongs to the GET above. Concurrent writes are rejected by the server with 409.
      const result = await replaceTeamSync(auth!, remote.version, outgoing);
      assertSession();
      if (!result || !Number.isSafeInteger(result.version) || result.version <= remote.version)
        throw new Error(
          '共有結果を確認できませんでした。もう一度「共有から取得」で確認してください。',
        );
      result.data = parseTeamData(result.data);
      if (result.data.workspace.id !== auth!.user.teamId)
        throw new Error('共有結果のチームを確認できませんでした。再接続してください。');
      try {
        await teamMutate((current) => ({
          ...reconcileTeamData(current, result.data, initial),
          workspace: result.data.workspace,
        }));
      } catch (cause) {
        throw new Error(
          `チームへの共有は完了しましたが、端末側の変更を確認する必要があります。${cause instanceof Error ? cause.message : 'バックアップしてから共有の記録を取得してください。'}`,
        );
      }
      assertSession();
      syncBaselines.set(syncKey, result);
      setWorkshop(result.data.workspace.name);
      setSyncNote('端末の記録を共有しました。他の端末では「共有から取得」で受け取れます。');
      toast('チームへ共有しました');
    });
  const logout = () =>
    void run('接続を終了中', async () => {
      try {
        await logoutSupabase();
      } finally {
        assertSession();
        syncBaselines.delete(syncKey);
        setAuth(null);
        setInvite(null);
        setSyncNote('');
      }
      toast('接続を終了しました。端末の記録は残っています');
    });

  return (
    <>
      <PageTitle
        label="作業に合った、あなたの工房へ"
        title="工房の設定"
        back={() => navigate('home')}
      >
        <Badge tone="green">ベータ版</Badge>
      </PageTitle>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="processing" role="status">
          <LoaderCircle className="spinning" size={18} />
          {busy}
        </div>
      )}
      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-section" id="settings-profile" tabIndex={-1}>
            <div className="settings-heading">
              <Settings2 size={21} />
              <div>
                <h2>記録する人と工房</h2>
                <p>これから残す記録に使う名前です。</p>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <fieldset disabled={!!busy}>
                <div className="form-two">
                  <label>
                    表示名
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={80}
                      required
                      autoComplete="nickname"
                      placeholder="記録する人の名前"
                    />
                  </label>
                  <label>
                    この端末の工房名
                    <input
                      value={workshop}
                      onChange={(event) => setWorkshop(event.target.value)}
                      maxLength={120}
                      required
                    />
                  </label>
                </div>
                <button className="button" type="submit">
                  <Save size={17} />
                  名前を保存
                </button>
              </fieldset>
            </form>
            <div className="setting-row">
              <div>
                <strong>サンプルを表示する</strong>
                <p>架空の教材で、記録から引き継ぎまでを試せます。</p>
              </div>
              <input
                type="checkbox"
                className="setting-check"
                aria-label="サンプルを表示する"
                checked={settings.demoVisible}
                disabled={!!busy}
                onChange={(event) =>
                  void run('保存中', () => configure({ demoVisible: event.target.checked }))
                }
              />
            </div>
            {!data.recordings.some((record) => record.isDemo) && (
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  void run('サンプルを追加中', async () => {
                    await mutate((current) => mergeTeamData(current, createDemoData()));
                    await configure({ demoVisible: true });
                    toast('サンプルを追加しました');
                  })
                }
              >
                <Plus size={16} />
                サンプル資料を追加
              </button>
            )}
          </section>

          <section className="settings-section" id="settings-team" tabIndex={-1}>
            <div className="settings-heading">
              <Users size={22} />
              <div>
                <h2>チームで引き継ぐ</h2>
                <p>端末だけでも使えます。共有するときに接続してください。</p>
              </div>
            </div>
            {auth ? (
              <>
                <div className="connected-team">
                  <span className="team-avatar">{auth.user.teamName.slice(0, 1)}</span>
                  <div>
                    <strong>{auth.user.teamName}</strong>
                    <small>
                      {auth.user.email} · {auth.user.role === 'owner' ? '管理者' : 'メンバー'}
                    </small>
                  </div>
                  <Badge tone="green">接続中</Badge>
                </div>
                <div className="sync-panel">
                  <h3>記録を受け渡す</h3>
                  <p>
                    この端末の実記録 {actual.recordings.length}件・Wiki {actual.articles.length}
                    件。サンプルは共有しません。送信すると、このチームのメンバーが下書き・回答・動画も閲覧できます。
                  </p>
                  <div className="button-row">
                    <button className="button" disabled={!!busy} onClick={pull}>
                      <CloudDownload size={18} />
                      共有から取得
                    </button>
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => {
                        setError('');
                        setModal('push');
                      }}
                    >
                      <CloudUpload size={18} />
                      端末の記録を共有
                    </button>
                  </div>
                  {syncNote && (
                    <p className="sync-status" role="status">
                      <Check size={16} />
                      {syncNote}
                    </p>
                  )}
                  <small>
                    取得は既存の記録を残して追加します。両方で変更された記録は上書きせず停止します。Supabase無料枠では動画の共有は1件50MBまでです。
                  </small>
                </div>
                <details className="settings-details">
                  <summary>更新が衝突したとき</summary>
                  <p>
                    再接続前の編集など、どちらの変更を残すべきか判別できない場合も停止します。端末側は下の「JSONを書き出す」、共有側はこのボタンで保存し、内容を比較してください。動画本体は別に保管してください。
                  </p>
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() =>
                      void run('共有側をバックアップ中', async () => {
                        const remote = await getRemote();
                        await downloadFile(
                          exportBackup(remote.data),
                          `meisters-baton-team-${new Date().toISOString().slice(0, 10)}.json`,
                        );
                        toast('共有側の文章をバックアップしました。端末の記録は変更していません');
                      })
                    }
                  >
                    <Download size={17} />
                    共有側のJSONを書き出す
                  </button>
                </details>
                {auth.user.role === 'owner' && (
                  <details className="settings-details team-action-details invite-details">
                    <summary>
                      <span className="team-action-summary-icon" aria-hidden="true">
                        <UserPlus size={19} />
                      </span>
                      <span className="team-action-summary-copy">
                        <strong>メンバーを招待する</strong>
                        <small>招待コードを発行して、この工房に追加</small>
                      </span>
                      <ChevronDown
                        className="team-action-summary-chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="team-action-details-body">
                      <p>
                        招待コードを相手に渡してください。新しく作ると古いコードは無効になります。
                      </p>
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() =>
                          void run('招待コードを作成中', async () =>
                            setInvite(await createTeamInvite()),
                          )
                        }
                      >
                        <KeyRound size={17} />
                        {invite ? '招待コードを作り直す' : '招待コードを作る'}
                      </button>
                      {invite && (
                        <label className="invite-code">
                          招待コード（選択してコピー）
                          <input
                            readOnly
                            value={invite.code}
                            onFocus={(event) => event.target.select()}
                          />
                          <small>
                            有効期限: {new Date(invite.expiresAt).toLocaleString('ja-JP')}
                          </small>
                        </label>
                      )}
                    </div>
                  </details>
                )}
                <details className="settings-details team-action-details join-details">
                  <summary>
                    <span className="team-action-summary-icon" aria-hidden="true">
                      <LogIn size={19} />
                    </span>
                    <span className="team-action-summary-copy">
                      <strong>招待されたチームに参加する</strong>
                      <small>受け取った招待コードを入力して参加</small>
                    </span>
                    <ChevronDown
                      className="team-action-summary-chevron"
                      size={18}
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="team-action-details-body">
                    <p>
                      参加しても端末の記録は残ります。別のチームに共有済みの記録は自動で送信しません。現在のチームを管理していて共有データがある場合は、空のアカウントから参加してください。
                    </p>
                    <label>
                      招待コード
                      <input
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        maxLength={20}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={!!busy || !/^[A-F0-9]{20}$/.test(joinCode.trim())}
                      onClick={() => setModal('join')}
                    >
                      この招待で参加する
                    </button>
                  </div>
                </details>
                <button className="text-button" disabled={!!busy} onClick={logout}>
                  <LogOut size={16} />
                  接続を終了
                </button>
              </>
            ) : (
              <>
                <div className="auth-mode" role="group" aria-label="接続方法">
                  <button
                    className={`button ${mode === 'login' ? 'active' : ''}`}
                    disabled={!!busy}
                    onClick={() => setMode('login')}
                  >
                    ログイン
                  </button>
                  <button
                    className={`button ${mode === 'register' ? 'active' : ''}`}
                    disabled={!!busy}
                    onClick={() => setMode('register')}
                  >
                    チームを作る
                  </button>
                </div>
                <form onSubmit={connect}>
                  <fieldset disabled={!!busy}>
                    <label>
                      メールアドレス
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        maxLength={254}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      パスワード
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={10}
                        maxLength={128}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      />
                      <small>10文字以上。ベータではパスワードの再発行に対応していません。</small>
                    </label>
                    {mode === 'register' && (
                      <label>
                        共有するチーム名
                        <input
                          value={teamName}
                          onChange={(event) => setTeamName(event.target.value)}
                          required
                          maxLength={120}
                          placeholder="例：Meister / プロペラ班"
                        />
                      </label>
                    )}
                    <button className="button primary" type="submit">
                      <Users size={17} />
                      {mode === 'login' ? 'チームに接続' : 'アカウントとチームを作成'}
                    </button>
                  </fieldset>
                </form>
                <p className="privacy-hint">
                  アカウント作成時はメールアドレス・表示名・チーム名を設定先のサーバーへ送ります。記録の共有は接続後に選べます。
                </p>
              </>
            )}
          </section>

          <section className="settings-section" id="settings-ai" tabIndex={-1}>
            <div className="settings-heading">
              <ShieldCheck size={22} />
              <div>
                <h2>AIとチーム共有</h2>
                <p>チーム共有はSupabaseへ、AIは指定したサーバーへ接続します。</p>
              </div>
            </div>
            <label className="consent-setting">
              <input
                type="checkbox"
                checked={settings.aiConsent}
                disabled={!!busy}
                onChange={(event) =>
                  void run('保存中', () => configure({ aiConsent: event.target.checked }))
                }
              />
              <span>
                <strong>AIへの送信を有効にする</strong>
                <small>
                  解析・生成を選んだときに、抽出画像、メモ、回答、必要なチームの知識を設定したサーバー経由でOpenAIへ送ります。動画の音声は解析しません。無効にしても手動の聞き取りは使えます。
                </small>
              </span>
            </label>
            <details className="settings-details">
              <summary>AIサーバーの接続先を設定する</summary>
              {!Capacitor.isNativePlatform() && (
                <>
                  <p>
                    このサイトを開いているPCのCodexを使えます。PC側の接続口を起動し、CodexへChatGPTでログインしてください。生成中はPCとインターネット接続が必要です。
                  </p>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run('このPCのCodexを確認中', async () => {
                        const result = await checkLaptopConnection();
                        assertCurrentOperation();
                        await configure({ apiBaseUrl: LAPTOP_API_URL });
                        setBaseUrl(LAPTOP_API_URL);
                        setHealth(result);
                        toast('このPCのCodexに接続しました');
                      })
                    }
                  >
                    このPCのCodexに接続
                  </button>
                  <p className="privacy-hint">
                    ブラウザーにローカルネットワークへの接続許可が表示された場合は、このPCの接続口を使うために許可してください。APIキーの入力は不要です。
                  </p>
                </>
              )}
              <p>
                AI解析を使う場合だけサーバーのアドレスを入力します。アカウントとWiki共有は、ビルド時に設定されたSupabaseへ直接接続します。
              </p>
              <label>
                サーバーのアドレス
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://baton.example.com"
                  autoComplete="url"
                  spellCheck={false}
                />
              </label>
              <div className="button-row">
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() =>
                    void run('接続先を保存中', async () => {
                      const url = validateApiBaseUrl(baseUrl);
                      if (url !== settings.apiBaseUrl) {
                        setHealth(null);
                      }
                      await configure({ apiBaseUrl: url });
                      setBaseUrl(url);
                      toast('接続先を保存しました');
                    })
                  }
                >
                  接続先を保存
                </button>
                <button
                  className="button"
                  disabled={!!busy || !baseUrl.trim() || baseUrl.trim() !== settings.apiBaseUrl}
                  onClick={() =>
                    void run('接続を確認中', async () => {
                      const result = await api<{
                        ok: boolean;
                        aiConfigured: boolean;
                        model: string;
                      }>(settings, '/api/health', { timeout: 15000 });
                      if (!result.ok) throw new Error('サーバーが応答を受け付けていません。');
                      setHealth(result);
                    })
                  }
                >
                  接続を確認
                </button>
              </div>
              {health && (
                <p className="connection-status" role="status">
                  <Badge tone="green">サーバー接続OK</Badge>
                  <Badge tone={health.aiConfigured ? 'green' : 'amber'}>
                    {health.aiConfigured ? 'AI利用可能' : 'AI未設定・手動で利用できます'}
                  </Badge>
                </p>
              )}
              <button
                className="button"
                disabled={!!busy || !auth || !settings.apiBaseUrl}
                onClick={() =>
                  void run('Wiki閲覧権限を確認中', async () => {
                    if (!auth) return;
                    setWikiConnection(null);
                    const result = await api<WikiConnection>(settings, '/api/process-video', {
                      method: 'POST',
                      body: { action: 'check', query: '外皮', teamId: auth.user.teamId },
                      sessionToken: auth.token,
                      sessionTeamId: auth.user.teamId,
                      timeout: 60000,
                    });
                    assertCurrentOperation();
                    assertAuthSession(auth.token, settings, auth.user.teamId);
                    setWikiConnection(result);
                  })
                }
              >
                Wiki閲覧権限を確認
              </button>
              {!auth && <small>アプリにログインすると、Wikiも読めるか確認できます。</small>}
              {wikiConnection && (
                <p role="status">
                  取込Wiki {wikiConnection.importedPages}件・編集{' '}
                  {wikiConnection.editedPages ?? '未確認'}件・作業記事{' '}
                  {wikiConnection.appArticles ?? '未確認'}件を参照できます。 添付:{' '}
                  {wikiConnection.attachment.status === 'verified'
                    ? '取得・一致確認済み'
                    : '未確認'}
                  。
                </p>
              )}
              <small>
                AIを使わない場合は空欄で構いません。スマートフォンアプリからAIを使う場合は、外部から到達できるHTTPSの接続先が必要です。
              </small>
            </details>
          </section>

          <section className="settings-section" id="settings-backup" tabIndex={-1}>
            <div className="settings-heading">
              <Download size={22} />
              <div>
                <h2>記録を手元に残す</h2>
                <p>文章と判断をバックアップし、あとから追加で読み込めます。</p>
              </div>
            </div>
            <p>{BACKUP_NOTICE}</p>
            <div className="button-row">
              <button
                className="button"
                disabled={!!busy}
                onClick={() =>
                  void run('バックアップを作成中', async () => {
                    await downloadFile(
                      exportBackup(data),
                      `meisters-baton-${new Date().toISOString().slice(0, 10)}.json`,
                    );
                    toast('バックアップを書き出しました。元動画も別に保管してください');
                  })
                }
              >
                <Download size={17} />
                JSONを書き出す
              </button>
              <button className="button" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                <Upload size={17} />
                バックアップを読み込む
              </button>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file)
                  void run('ファイルを確認中', async () => {
                    if (file.size > 50 * 1024 * 1024)
                      throw new Error('50MB以内のバックアップを選んでください。');
                    const text = await file.text();
                    const incoming = importBackup(text);
                    setImportFile({ name: file.name, text, count: incoming.recordings.length });
                  });
              }}
            />
            <p className="privacy-hint">
              読み込みは今の記録へ追加します。同じ記録に異なる内容がある場合は、置き換えず中止します。
            </p>
          </section>
          <section className="settings-section" id="settings-about" tabIndex={-1}>
            <h2>このアプリについて</h2>
            <p>利用しているライブラリとフォントの著作権・ライセンスを確認できます。</p>
            <button className="button" disabled={!!busy} onClick={() => void loadNotices()}>
              ライセンスとクレジット
            </button>
          </section>
        </div>
        <aside className="settings-aside">
          <nav className="settings-index" aria-label="設定の項目">
            <h2>設定の項目</h2>
            {settingsSections.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  const section = document.getElementById(id);
                  section?.scrollIntoView({ block: 'start' });
                  section?.focus({ preventScroll: true });
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <section className="privacy-card">
            <ShieldCheck size={28} />
            <h2>
              技術を残す。
              <br />
              公開する範囲は選ぶ。
            </h2>
            <p>
              普段の記録はこの端末に保存します。AIへの送信とチームへの共有は、それぞれ自分で選べます。
            </p>
            <p>
              端末内の削除は共有先へ反映されません。共有済みの記録はチームで保持され、サーバー上の個別削除は運用管理者へ依頼してください。
            </p>
            <p>
              退会しても他のメンバーがいるチームの記録は残ります。管理者が退会すると別のメンバーへ管理を引き継ぎます。最後の1人が退会した場合は、チームの共有記録と動画も削除されます。
            </p>
            <small>
              メール確認の有無はSupabaseの運用設定に従います。このベータはパスワード再発行に未対応です。公開運用前に提供者の窓口・プライバシー方針を確定してください。
            </small>
          </section>
          <section className="settings-danger" id="settings-data" tabIndex={-1}>
            <h3>データの管理</h3>
            <button
              className="text-button danger"
              disabled={!!busy}
              onClick={() => {
                setError('');
                setModal('clear');
              }}
            >
              <Trash2 size={16} />
              この端末の記録をすべて消去
            </button>
            {auth && (
              <button
                className="text-button danger"
                disabled={!!busy}
                onClick={() => {
                  setDeletePassword('');
                  setError('');
                  setModal('delete');
                }}
              >
                アカウントを削除する
              </button>
            )}
            <small>消去前にバックアップと元動画を保管してください。</small>
          </section>
        </aside>
      </div>

      {noticesOpen && (
        <Modal
          title="ライセンスとクレジット"
          close={() => {
            noticesRequest.current?.abort();
            setNoticesOpen(false);
          }}
        >
          <div className="modal-body">
            <p>このアプリに含まれるライブラリ・フォントのライセンス原文です。</p>
            {noticesLoading && <p role="status">ライセンスを読み込んでいます…</p>}
            {noticesError && (
              <>
                <p className="error-banner" role="alert">
                  {noticesError}
                </p>
                <button className="button" onClick={() => void loadNotices()}>
                  再読み込み
                </button>
              </>
            )}
            {notices !== null && (
              <pre
                tabIndex={0}
                role="region"
                aria-label="ライセンス原文"
                style={{
                  maxHeight: '60dvh',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: 16,
                  background: 'var(--bg)',
                  borderRadius: 12,
                }}
              >
                {notices}
              </pre>
            )}
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === 'clear'
              ? 'この端末の記録を消去しますか？'
              : modal === 'delete'
                ? 'アカウントを削除しますか？'
                : modal === 'join'
                  ? '招待されたチームに移りますか？'
                  : 'このチームへ記録を共有しますか？'
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="modal-body">
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {modal === 'clear' ? (
              <>
                <p>
                  この端末の動画、回答、Wiki、設定をすべて消去します。共有サーバーにある記録は残ります。この操作は元に戻せません。
                </p>
                <p>消去後は空の工房を開きます。サンプルも自動では追加しません。</p>
                <button
                  className="button danger"
                  disabled={!!busy}
                  onClick={() =>
                    void run('端末の記録を消去中', async () => {
                      await clearLocalData();
                      await saveData(createEmptyData());
                      await saveSettings({
                        ...defaultSettings,
                        demoVisible: false,
                        onboardingDone: true,
                      });
                      setAuth(null);
                      syncBaselines.clear();
                      location.reload();
                    })
                  }
                >
                  端末のデータをすべて消去
                </button>
              </>
            ) : modal === 'delete' ? (
              <>
                <p>
                  ログイン情報を削除して接続を終了します。端末の記録は残ります。他のメンバーがいるチームの共有記録は残り、最後の1人の場合はチームの記録と動画も削除されます。
                </p>
                <label>
                  現在のパスワード
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                    maxLength={128}
                  />
                </label>
                <button
                  className="button danger"
                  disabled={!!busy || !deletePassword}
                  onClick={() =>
                    void run('アカウントを削除中', async () => {
                      await deleteSupabaseAccount(auth!, deletePassword);
                      assertCurrentOperation();
                      syncBaselines.delete(syncKey);
                      setAuth(null);
                      setDeletePassword('');
                      setInvite(null);
                      setModal(null);
                      toast('アカウントを削除しました。端末の記録は残っています');
                    })
                  }
                >
                  アカウントを削除
                </button>
              </>
            ) : modal === 'join' ? (
              <>
                <p>
                  現在の共有チームから移動します。端末の記録は残り、新しいチームには自動で共有しません。
                </p>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    void run('チームに参加中', async () => {
                      const session = await joinSupabaseTeam(joinCode.trim());
                      assertCurrentOperation();
                      if (!validUser(session.user))
                        throw new Error(
                          '参加したチームの情報を確認できませんでした。再接続してください。',
                        );
                      syncBaselines.delete(syncKey);
                      setAuth(session);
                      setInvite(null);
                      setJoinCode('');
                      setSyncNote('');
                      setModal(null);
                      toast(`${session.user.teamName}に参加しました`);
                    })
                  }
                >
                  招待されたチームに参加
                </button>
              </>
            ) : (
              <>
                <p>
                  <strong>{auth?.user.teamName}</strong>へ、この端末の実記録
                  {actual.recordings.length}件・Wiki{actual.articles.length}
                  件を送ります。動画・作業メモ・回答・下書きもチーム内で共有されます。
                </p>
                <p>サンプルは送りません。共有先にある記録を自動で削除することはありません。</p>
                <button className="button primary" disabled={!!busy} onClick={push}>
                  <CloudUpload size={17} />
                  この内容をチームへ送信
                </button>
              </>
            )}
            <button className="button" disabled={!!busy} onClick={() => setModal(null)}>
              キャンセル
            </button>
          </div>
        </Modal>
      )}
      {importFile && (
        <Modal
          title="バックアップを追加しますか？"
          close={() => {
            if (!busy) setImportFile(null);
          }}
        >
          <div className="modal-body">
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <p>
              {importFile.name} / 記録{importFile.count}件
            </p>
            <p>
              今の記録を残して追加します。動画本体は含まれていません。既存の記録と内容が衝突した場合は読み込みを中止します。
            </p>
            <div className="button-row">
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() =>
                  void run('バックアップを読み込み中', async () => {
                    await mutate((current) => importBackup(importFile.text, current));
                    setImportFile(null);
                    toast('バックアップを追加しました');
                  })
                }
              >
                今の記録に追加
              </button>
              <button className="button" disabled={!!busy} onClick={() => setImportFile(null)}>
                キャンセル
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
