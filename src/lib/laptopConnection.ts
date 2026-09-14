export const LAPTOP_API_URL = 'http://127.0.0.1:8787';

/** A user-initiated, anonymous probe. Never send the app session to an unverified service. */
export async function checkLaptopConnection(fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(`${LAPTOP_API_URL}/api/health`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error(
      'このPCのCodex接続口に届きません。このPCで起動スクリプトを実行し、ブラウザーに表示されるローカルネットワーク接続を許可してください。',
    );
  }
  const value = await response.json().catch(() => null);
  if (
    !response.ok ||
    value?.ok !== true ||
    value?.aiConfigured !== true ||
    value?.provider !== 'codex-chatgpt' ||
    value?.scope !== 'loopback'
  )
    throw Error('Meister’s BatonのCodex接続口を確認できません。起動中のアプリを確認してください。');
  return { ok: true, aiConfigured: true, model: 'Codex（ChatGPTログイン）' };
}
