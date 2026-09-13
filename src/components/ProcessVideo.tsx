import { useEffect, useRef, useState } from 'react';
import { useBaton } from '../state';
import type { Recording } from '../domain/types';
import type { ProcessVideoRun, WikiConnection } from '../domain/processVideo';
import { api, assertAuthSession } from '../lib/api';
import { canRenderMp4, renderProcessMp4 } from '../lib/processVideoRender';
import {
  loadProcessVideos,
  saveProcessVideo,
  type SavedProcessVideo,
} from '../lib/processVideoStorage';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function ProcessVideo({ record }: { record: Recording }) {
  const { auth, settings, navigate } = useBaton();
  const [query, setQuery] = useState(record.title);
  const [check, setCheck] = useState<WikiConnection>();
  const [saved, setSaved] = useState<SavedProcessVideo>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const cancel = useRef<AbortController | null>(null);
  const operation = useRef(0);
  useEffect(() => {
    operation.current++;
    let active = true;
    setSaved(undefined);
    setCheck(undefined);
    setBusy('');
    setError('');
    if (auth)
      void loadProcessVideos(auth.user.teamId, record.id)
        .then((rows) => {
          if (active) setSaved(rows[0]);
        })
        .catch(() => {
          if (active) setError('保存済み動画を読み出せませんでした。');
        });
    return () => {
      operation.current++;
      active = false;
      cancel.current?.abort();
    };
  }, [auth?.user.teamId, auth?.user.id, record.id]);
  useEffect(() => {
    if (!saved?.mp4) {
      setVideoUrl('');
      return;
    }
    const url = URL.createObjectURL(saved.mp4);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [saved?.mp4]);
  const run = async (action: 'check' | 'run') => {
    if (!auth) return;
    const id = operation.current;
    const guard = () => {
      if (id !== operation.current) throw Error('画面が変わったため生成を中止しました。');
      assertAuthSession(auth.token, settings, auth.user.teamId);
    };
    setError('');
    setBusy(action === 'check' ? 'Wiki接続を確認中' : 'Codexが制作構成を作成中');
    try {
      const body =
        action === 'check'
          ? { action, query, teamId: auth.user.teamId }
          : {
              action,
              query,
              teamId: auth.user.teamId,
              consent: settings.aiConsent,
              recording: record,
            };
      const result = await api<ProcessVideoRun | WikiConnection>(settings, '/api/process-video', {
        method: 'POST',
        body,
        sessionToken: auth.token,
        sessionTeamId: auth.user.teamId,
        timeout: 360000,
      });
      guard();
      if (action === 'check') setCheck(result as WikiConnection);
      else {
        const value = { run: result as ProcessVideoRun };
        await saveProcessVideo(value, guard);
        guard();
        setSaved(value);
      }
    } catch (e) {
      if (id === operation.current) setError((e as Error).message);
    } finally {
      if (id === operation.current) setBusy('');
    }
  };
  const render = async () => {
    if (!saved || !canvas.current || !auth) return;
    const snapshot = saved,
      session = auth;
    const id = operation.current;
    const guard = () => {
      if (id !== operation.current) throw Error('画面が変わったため書き出しを中止しました。');
      assertAuthSession(session.token, settings, session.user.teamId);
    };
    setError('');
    setBusy('MP4を書き出し中');
    setProgress(0);
    cancel.current = new AbortController();
    try {
      const mp4 = await renderProcessMp4(
        snapshot.run.plan,
        canvas.current,
        setProgress,
        cancel.current.signal,
      );
      assertAuthSession(session.token, settings, session.user.teamId);
      const hash = await crypto.subtle.digest('SHA-256', await mp4.arrayBuffer());
      const value = {
        ...snapshot,
        mp4,
        sha256: Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join(''),
      };
      await saveProcessVideo(value, guard);
      guard();
      setSaved(value);
    } catch (e) {
      if (id === operation.current) setError((e as Error).message);
    } finally {
      if (id === operation.current) {
        setBusy('');
        cancel.current = null;
      }
    }
  };
  if (record.isDemo) return null;
  return (
    <details className="settings-details process-video">
      <summary>作業の3D解説動画を作る</summary>
      <p>作業記録と閲覧できるWikiから制作構成を作り、MP4をこの端末に保存します。</p>
      <p>
        生成するのは製法確認前の概念図です。材料の変形や手・工具の動作を含む、すべての製法を再現するものではありません。
      </p>
      {import.meta.env.VITE_BATON_VERIFICATION === 'true' && (
        <p>接続検証モード：記録のWikiへの自動反映は停止しています。</p>
      )}
      {!auth ? (
        <button className="button" onClick={() => navigate('settings')}>
          ログイン設定へ
        </button>
      ) : (
        <>
          {!settings.apiBaseUrl && (
            <button className="button" onClick={() => navigate('settings')}>
              Codexの接続を設定する
            </button>
          )}
          <label>
            関連するWikiの検索語
            <input
              value={query}
              maxLength={300}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!!busy}
            />
          </label>
          <div className="button-row">
            <button
              className="button"
              disabled={!!busy || !query.trim() || !settings.apiBaseUrl}
              onClick={() => void run('check')}
            >
              Wiki接続を確認
            </button>
            <button
              className="button primary"
              disabled={!!busy || !query.trim() || !settings.aiConsent || !settings.apiBaseUrl}
              onClick={() => void run('run')}
            >
              Codexで制作構成を作る
            </button>
          </div>
          {!settings.aiConsent && <p>生成するには、工房の設定でAIへの送信を有効にしてください。</p>}
          {check && (
            <p role="status">
              ログイン中のアカウントでWiki取得成功：取込本文{check.importedPages}件、編集
              {check.editedPages ?? '未取得'}件、作業Wiki{check.appArticles ?? '未取得'}件。添付：
              {check.attachment.status === 'verified' ? '取得・ハッシュ一致' : '未確認'}。AI：
              {check.aiConfigured ? '設定済み' : '未接続'}。
            </p>
          )}
          {saved && (
            <>
              <h3>{saved.run.plan.title}</h3>
              <p>{saved.run.plan.summary}</p>
              <p>
                製法確認前の概念図です。下記の構成と未確認条件を確認してから書き出してください。
              </p>
              <ol>
                {saved.run.plan.scenes.map((scene, i) => (
                  <li key={i}>
                    <strong>{scene.title}</strong>
                    <p>{scene.action}</p>
                    <p>{scene.uncertainty}</p>
                  </li>
                ))}
              </ol>
              {saved.run.plan.missingEvidence.length > 0 && (
                <ul>
                  {saved.run.plan.missingEvidence.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={!!busy || !canRenderMp4()}
                  onClick={() => void render()}
                >
                  構成を確認してMP4を書き出す
                </button>
                {saved.mp4 && (
                  <button
                    className="button"
                    onClick={() => download(saved.mp4!, `${saved.run.id}.mp4`)}
                  >
                    MP4をダウンロード
                  </button>
                )}
                <button
                  className="button"
                  onClick={() =>
                    download(
                      new Blob(
                        [JSON.stringify({ run: saved.run, sha256: saved.sha256 }, null, 2)],
                        { type: 'application/json' },
                      ),
                      `${saved.run.id}.json`,
                    )
                  }
                >
                  制作データ・出典を保存
                </button>
              </div>
              {!canRenderMp4() && <p>MP4書き出しには対応するChromeまたはEdgeが必要です。</p>}
            </>
          )}
          <canvas
            ref={canvas}
            width={1920}
            height={1080}
            style={{ width: '100%', display: busy === 'MP4を書き出し中' ? 'block' : 'none' }}
            aria-label="MP4の描画中プレビュー"
          />
          {busy && (
            <p role="status">
              {busy}
              {busy === 'MP4を書き出し中'
                ? ` ${Math.round(progress * 100)}%・この画面を表示したままお待ちください`
                : ''}
            </p>
          )}
          {busy === 'MP4を書き出し中' && (
            <button className="button" onClick={() => cancel.current?.abort()}>
              書き出しを中断
            </button>
          )}
          {videoUrl && (
            <>
              <video
                controls
                src={videoUrl}
                style={{ width: '100%' }}
                aria-label="保存した3D解説動画"
              />
              <p>MP4をこの端末に保存済み。人による製法・理解の確認は未完了です。</p>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </details>
  );
}
