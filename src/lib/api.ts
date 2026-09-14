import type { AuthSession, Settings } from '../domain/types';
let auth: AuthSession | null = null;
let authOrigin = '';
function origin(settings: Pick<Settings, 'apiBaseUrl'>) {
  return new URL(settings.apiBaseUrl || location.origin).origin;
}
export function setAuthSession(value: AuthSession | null, apiBaseUrl = '') {
  auth = value;
  authOrigin = value ? origin({ apiBaseUrl }) : '';
}
export function assertAuthSession(
  expectedToken: string,
  settings: Pick<Settings, 'apiBaseUrl'>,
  expectedTeamId?: string,
) {
  if (
    !auth ||
    auth.token !== expectedToken ||
    authOrigin !== origin(settings) ||
    (expectedTeamId && auth.user.teamId !== expectedTeamId)
  )
    throw new Error(
      'チームの接続が変わったため、進行中の操作を止めました。接続先を確認してやり直してください。',
    );
}
export async function api<T>(
  settings: Pick<Settings, 'apiBaseUrl'>,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeout?: number;
    sessionToken?: string;
    sessionTeamId?: string;
  } = {},
): Promise<T> {
  const token = auth?.token;
  if (options.sessionToken)
    assertAuthSession(options.sessionToken, settings, options.sessionTeamId);
  if (token && authOrigin !== origin(settings))
    throw new Error('ログインしたサーバーと接続先が異なります。接続し直してください。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 360000);
  try {
    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Baton-Team': auth!.user.teamId } : {}),
      },
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (options.sessionToken)
      assertAuthSession(options.sessionToken, settings, options.sessionTeamId);
    if (!res.ok)
      throw new Error(
        payload.error?.message ??
          payload.error ??
          payload.message ??
          `接続に失敗しました（${res.status}）。`,
      );
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(
        '処理に時間がかかっています。記録は残っているので、後でもう一度お試しください。',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchRemoteMedia(
  settings: Settings,
  id: string,
  sessionToken?: string,
): Promise<Blob> {
  const expectedToken = sessionToken ?? auth?.token;
  if (!expectedToken) throw new Error('共有動画を取得するにはチームに接続してください。');
  assertAuthSession(expectedToken, settings);
  const res = await fetch(
    `${settings.apiBaseUrl.replace(/\/$/, '')}/api/media/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${expectedToken}` }, signal: AbortSignal.timeout(120000) },
  );
  assertAuthSession(expectedToken, settings);
  if (!res.ok) throw new Error('共有動画を取得できません。チームへの接続を確認してください。');
  const blob = await res.blob();
  assertAuthSession(expectedToken, settings);
  return blob;
}
