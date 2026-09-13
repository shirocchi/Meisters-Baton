import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { BOOK_GLOSSARY, type BookTerm } from '../../domain/bookGlossary';
import { Modal } from '../ui';

const TermContext = createContext<(term: BookTerm) => void>(() => {});
export function BookLanguage({
  onTerm,
  children,
}: {
  onTerm: (term: BookTerm) => void;
  children: ReactNode;
}) {
  return <TermContext.Provider value={onTerm}>{children}</TermContext.Provider>;
}
const entries = new Map<string, BookTerm>();
for (const term of BOOK_GLOSSARY)
  for (const name of [term.term, ...term.aliases]) {
    if (name.length > 1 && !entries.has(name)) entries.set(name, term);
  }
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = [...entries.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|');

/** Keep original text intact; definitions stay beside the reading position, never in a new route. */
export function BookText({ children }: { children: string }) {
  const onTerm = useContext(TermContext);
  const pieces = useMemo(() => {
    const out: Array<string | { text: string; term: BookTerm }> = [];
    const seen = new Set<string>();
    let end = 0;
    if (!pattern) return [children];
    for (const match of children.matchAll(new RegExp(pattern, 'g'))) {
      const start = match.index!;
      const word = match[0];
      const term = entries.get(word)!;
      if (
        /^[A-Za-z]+$/.test(word) &&
        /[A-Za-z]/.test((children[start - 1] ?? '') + (children[start + word.length] ?? ''))
      )
        continue;
      if (seen.has(term.id)) continue;
      out.push(children.slice(end, start), { text: word, term });
      end = start + word.length;
      seen.add(term.id);
    }
    out.push(children.slice(end));
    return out;
  }, [children]);
  return (
    <>
      {pieces.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <button
            key={index}
            type="button"
            className="book-term"
            aria-label={`${part.text}の意味を読む`}
            title={part.term.short}
            onClick={() => onTerm(part.term)}
          >
            {part.text}
          </button>
        ),
      )}
    </>
  );
}

function MoldWords() {
  return (
    <figure className="book-word-figure">
      <svg
        viewBox="0 0 520 155"
        role="img"
        aria-label="凸型は作りたい面の形が出っ張る側、凹型はその面を受け取るくぼんだ側。対になる面を濃い線で示す概念図。"
      >
        <path d="M25 115V88Q125 5 225 88V115Z" fill="#d6c4a5" />
        <path d="M25 88Q125 5 225 88" fill="none" stroke="#3f5d43" strokeWidth="6" />
        <path d="M295 50Q395 137 495 50V115H295Z" fill="#bccbbb" />
        <path d="M295 50Q395 137 495 50" fill="none" stroke="#3f5d43" strokeWidth="6" />
        <text x="125" y="145" textAnchor="middle">
          凸型
        </text>
        <text x="395" y="145" textAnchor="middle">
          凹型
        </text>
      </svg>
      <figcaption>
        写し取る面の対応を示した図。左の面を材料へ写し、取り外して向きを変えると右の受け面になります。
      </figcaption>
    </figure>
  );
}
const normalized = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

export function BookDictionary({
  selection,
  select,
  close,
}: {
  selection: BookTerm | 'index';
  select: (term: BookTerm | 'index') => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const selected = selection === 'index' ? null : selection;
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = content.current?.closest('dialog');
    if (!dialog) return;
    dialog.scrollTo({ top: 0, behavior: 'instant' });
    const focus = selected
      ? dialog.querySelector<HTMLElement>('.modal-head h2')
      : content.current?.querySelector<HTMLInputElement>('input');
    if (selected) focus?.setAttribute('tabindex', '-1');
    focus?.focus({ preventScroll: true });
  }, [selected?.id]);
  const results = BOOK_GLOSSARY.filter(
    (term) =>
      (scope === 'all' || term.chapter === scope) &&
      normalized([term.term, term.reading ?? '', ...term.aliases].join(' ')).includes(
        normalized(query.trim()),
      ),
  );
  return (
    <Modal title={selected ? `${selected.term}の意味` : 'ことばを調べる'} close={close} wide>
      <div className="book-dictionary" ref={content}>
        {selected ? (
          <>
            <button className="book-dictionary-back" onClick={() => select('index')}>
              <ArrowLeft size={16} />
              用語一覧に戻る
            </button>
            {selected.reading && <p className="book-word-reading">{selected.reading}</p>}
            <p className="book-word-short">{selected.short}</p>
            {['male-mold', 'female-mold'].includes(selected.id) ||
            ['凸型', '凹型'].includes(selected.term) ? (
              <MoldWords />
            ) : null}
            <p>{selected.description}</p>
            {selected.contrast && (
              <p className="book-word-contrast">
                <strong>似た言葉と区別する</strong>
                {selected.contrast}
              </p>
            )}
            <p className="book-word-source">
              説明の根拠：{selected.source}
              {selected.sourceUrl && (
                <>
                  {' '}
                  ·{' '}
                  <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    資料を読む ↗
                  </a>
                </>
              )}
            </p>
            <button className="book-action" onClick={close}>
              <ArrowLeft size={16} />
              読んでいた本文に戻る
            </button>
          </>
        ) : (
          <>
            <p>
              本文の点線が付いた言葉からも、読んでいる場所で説明を開けます。ここでは読み方でも探せます。
            </p>
            <label className="book-word-search">
              <Search size={18} />
              <input
                aria-label="用語を検索"
                placeholder="例：けんま、含浸、CFRP"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="book-word-scope">
              章で絞る
              <select
                aria-label="用語の章"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="all">すべての章</option>
                {[
                  ['overview', 'はじめに'],
                  ['mold', '型'],
                  ['skin', '外皮'],
                  ['flange', 'フランジ'],
                  ['web', '内部部材'],
                  ['join', '貼り合わせ'],
                  ['finish', '仕上げ'],
                ].map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p role="status">{results.length}語</p>
            <div className="book-word-list">
              {results.map((term) => (
                <button key={term.id} onClick={() => select(term)}>
                  <strong>
                    {term.term}
                    <small>{term.reading}</small>
                  </strong>
                  <span>{term.short}</span>
                </button>
              ))}
            </div>
            {!results.length && (
              <p>
                一致する言葉がありません。短い読み方にするか、章の絞り込みを外してみてください。
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
