import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, Heading2, Link2, List, Save, Upload, Eye } from 'lucide-react';
import { Modal } from './ui';
import { wikiSections, type WorkshopMedia } from '../domain/wikiWorkshop';
import type { WikiPage } from '../domain/growiWiki';
import { useBaton } from '../state';
import { useWiki } from '../wikiState';
import { uploadTeamMedia } from '../lib/supabase';
import { makeId } from '../domain';

export function WikiEditor({
  page,
  version,
  initialSection = '',
  close,
  render,
}: {
  page: WikiPage;
  version: number;
  initialSection?: string;
  close: () => void;
  render: (body: string, media: WorkshopMedia[]) => ReactNode;
}) {
  const { auth } = useBaton();
  const wiki = useWiki();
  const [base] = useState(page);
  const [baseVersion] = useState(version);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [selected, setSelected] = useState(() =>
    wikiSections(page.body).find((s) => s.title === initialSection),
  );
  const [error, setError] = useState('');
  const [media, setMedia] = useState(wiki.edits.find((e) => e.page_id === page.id)?.media ?? []);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [comparison, setComparison] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sections = wikiSections(body);
  const text = selected ? body.slice(selected.start, selected.end) : body;
  const change = (value: string) => {
    if (!selected) return setBody(value);
    const rest = body.slice(selected.end);
    const separator = rest && !value.endsWith('\n') && !rest.startsWith('\n') ? '\n' : '';
    setBody(body.slice(0, selected.start) + value + separator + rest);
    setSelected({ ...selected, end: selected.start + value.length });
  };
  const dirty = title !== base.title || body !== base.body;
  const requestClose = () => (dirty ? setDiscard(true) : close());
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  const insert = (before: string, after = '') => {
    const area = input.current;
    const start = area?.selectionStart ?? text.length,
      end = area?.selectionEnd ?? text.length;
    change(text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + before.length, end + before.length);
    });
  };
  const upload = async (file?: File) => {
    if (!file || !auth) return;
    setBusy(true);
    setError('');
    try {
      if (!/^(image|video)\//.test(file.type))
        throw Error('画像または動画ファイルを選んでください。');
      const remotePath = await uploadTeamMedia(auth, file);
      const item = {
        id: makeId('wiki-media'),
        name: file.name,
        type: file.type,
        bytes: file.size,
        remotePath,
      };
      setMedia((previous) => [...previous, item]);
      insert(
        `\n${file.type.startsWith('image/') ? '!' : ''}[${file.name.replace(/[\[\]]/g, '')}](#media/${item.id})\n`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await wiki.save(base, title, body, '本文を手動編集', baseVersion, media);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${page.title}を編集`} wide close={requestClose}>
      <div className="ww-editor">
        <label>
          ページ名
          <input
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
          />
        </label>
        <div className="ww-editor-controls">
          <label>
            編集する範囲
            <select
              aria-label="編集する範囲"
              disabled={busy}
              value={selected ? String(selected.start) : ''}
              onChange={(e) =>
                setSelected(sections.find((s) => String(s.start) === e.target.value))
              }
            >
              <option value="">ページ全体</option>
              {sections.map((s, i) => (
                <option key={i} value={String(s.start)}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
            <Eye size={17} />
            {preview ? '編集へ戻る' : '仕上がりを見る'}
          </button>
        </div>
        <div className="ww-toolbar" aria-label="文字の書式">
          <button disabled={busy} title="見出し" onClick={() => insert('\n## ')}>
            <Heading2 size={19} />
            見出し
          </button>
          <button disabled={busy} title="太字" onClick={() => insert('**', '**')}>
            <Bold size={18} />
            太字
          </button>
          <button disabled={busy} onClick={() => insert('\n- ')}>
            <List size={18} />
            箇条書き
          </button>
          <button disabled={busy} onClick={() => insert('[', '](https://)')}>
            <Link2 size={18} />
            リンク
          </button>
          <button disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload size={18} />
            画像・動画
          </button>
          <input
            hidden
            type="file"
            ref={fileInput}
            accept="image/*,video/*"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
        <p className="ww-help">文字を選んで書式を付けられます。保存するたびに前の版が残ります。</p>
        {preview ? (
          <div className="gw-markdown ww-editor-preview">{render(body, media)}</div>
        ) : (
          <textarea
            ref={input}
            aria-label="Wikiの本文"
            disabled={busy}
            value={text}
            onChange={(e) => change(e.target.value)}
            spellCheck={false}
          />
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="button"
              onClick={async () => {
                await wiki.refresh();
                setComparison(true);
              }}
            >
              最新の本文と比較
            </button>
          </div>
        )}
        {comparison && (
          <details open>
            <summary>保存先の最新本文（編集中の文章は上に残っています）</summary>
            <pre className="gw-source">{wiki.pages.find((p) => p.id === page.id)?.body}</pre>
            <p>必要な変更をコピーしてから閉じ、最新の版で編集を開き直してください。</p>
          </details>
        )}
        <div className="ww-editor-footer">
          <button className="button" onClick={requestClose}>
            キャンセル
          </button>
          <button
            className="button primary"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            <Save size={18} />
            {busy ? '保存中…' : '変更を保存'}
          </button>
        </div>
        {discard && (
          <div className="ww-discard" role="alert">
            <p>保存していない変更があります。</p>
            <button className="button" onClick={() => setDiscard(false)}>
              編集を続ける
            </button>
            <button className="button danger" onClick={close}>
              保存せず閉じる
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
