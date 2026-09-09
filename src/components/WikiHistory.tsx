import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useBaton } from '../state';
import { useWiki } from '../wikiState';
import { loadWikiHistory } from '../lib/wikiWorkshop';
import type { WikiEdit } from '../domain/wikiWorkshop';
import type { WikiPage } from '../domain/growiWiki';
export function WikiHistory({
  page,
  render,
}: {
  page: WikiPage;
  render: (body: string) => ReactNode;
}) {
  const { auth } = useBaton();
  const wiki = useWiki();
  const [history, setHistory] = useState<WikiEdit[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<WikiEdit>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = wiki.edits.find((e) => e.page_id === page.id);
  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    void loadWikiHistory(auth, page.id, controller.signal)
      .then(setHistory)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [auth?.token, page.id, current?.version]);
  return (
    <section className="ww-history">
      <h2>更新履歴</h2>
      <p>自動反映と手動編集の前の状態を保存しています。復元しても現在の版は履歴に残ります。</p>
      {error && <p role="alert">{error}</p>}
      <div className="ww-history-layout">
        <div className="ww-versions">
          <div className="ww-version-current">
            <strong>現在の版 {current?.version ?? 0}</strong>
            <small>{current?.reason ?? '取り込んだ原文'}</small>
          </div>
          {history.map((item) => (
            <button
              className={selected?.version === item.version ? 'active' : ''}
              key={item.version}
              onClick={() => {
                setSelected(item);
                setConfirm(false);
              }}
            >
              <strong>
                版 {item.version} · {item.author}
              </strong>
              <small>{new Date(item.updated_at).toLocaleString('ja-JP')}</small>
              <span>{item.reason}</span>
            </button>
          ))}
          {!history.length && <p>まだ変更履歴がありません。</p>}
        </div>
        {selected && (
          <div className="ww-revision-preview">
            <div className="ww-section-heading">
              <h3>版 {selected.version} の本文</h3>
              <button className="button" onClick={() => setConfirm(true)}>
                <RotateCcw size={16} />
                この版に戻す
              </button>
            </div>
            {confirm && (
              <div className="ww-restore">
                <p>版 {selected.version} の本文を新しい版として保存します。</p>
                <button className="button" onClick={() => setConfirm(false)}>
                  キャンセル
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await wiki.save(
                        page,
                        selected.title,
                        selected.body,
                        `版 ${selected.version} の本文を復元`,
                        current?.version ?? 0,
                        [
                          ...new Map(
                            [...(current?.media ?? []), ...selected.media].map((m) => [m.id, m]),
                          ).values(),
                        ],
                      );
                      setConfirm(false);
                      setSelected(undefined);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  本文を復元する
                </button>
              </div>
            )}
            <div className="gw-markdown">{render(selected.body)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
