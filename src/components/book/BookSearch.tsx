import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { Modal } from '../ui';

export interface BookSearchEntry {
  id: string;
  title: string;
  chapterTitle: string;
  text: string;
  chapter: number;
  page: number;
}

export interface BookSearchProps {
  entries: BookSearchEntry[];
  onOpen: (chapter: number, page: number) => void;
  close: () => void;
}

const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
const MAX_RESULTS = 30;

function excerpt(text: string, words: string[]) {
  const plain = text.replace(/\s+/gu, ' ').trim();
  if (!plain) return '';
  const searchable = normalize(plain);
  const positions = words.map((word) => searchable.indexOf(word)).filter((index) => index >= 0);
  const match = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, match - 28);
  const end = Math.min(plain.length, start + 130);
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

export function BookSearch({ entries, onOpen, close }: BookSearchProps) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const index = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        searchable: normalize(`${entry.title}\n${entry.chapterTitle}\n${entry.text}`),
      })),
    [entries],
  );
  const words = useMemo(() => normalize(query).trim().split(/\s+/u).filter(Boolean), [query]);
  const matches = useMemo(
    () =>
      words.length
        ? index.filter(({ searchable }) => words.every((word) => searchable.includes(word)))
        : [],
    [index, words],
  );
  const results = matches.slice(0, MAX_RESULTS);

  useEffect(() => {
    // Wait until the enclosing native dialog has opened before moving focus.
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Modal title="教材を検索" close={close} wide>
      <div className="book-search">
        <label className="book-search-label" htmlFor={`${id}-query`}>
          検索する言葉
        </label>
        <div className="book-search-field">
          <Search size={20} aria-hidden="true" />
          <input
            id={`${id}-query`}
            ref={input}
            type="search"
            autoFocus
            autoComplete="off"
            aria-label="検索する言葉"
            aria-describedby={`${id}-hint`}
            placeholder="例：外皮 含浸"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
            style={{ minHeight: 44, minWidth: 0 }}
          />
        </div>
        <p id={`${id}-hint`} className="book-search-hint">
          章・節の名前と本文を検索します。スペースで区切ると、すべての言葉を含むページを探せます。
        </p>
        <p className="book-search-status" role="status" aria-live="polite" aria-atomic="true">
          {!words.length
            ? '章や節の名前、調べたい言葉を入力してください。'
            : matches.length === 0
              ? '検索結果は0件です。別の言葉や、短い言葉で試してください。'
              : `${matches.length}件見つかりました。${matches.length > MAX_RESULTS ? `先頭の${MAX_RESULTS}件を表示しています。` : ''}`}
        </p>
        {results.length > 0 && (
          <ul className="book-search-results" aria-label="検索結果">
            {results.map(({ entry }) => {
              const preview = excerpt(entry.text, words);
              return (
                <li key={entry.id} className="book-search-item">
                  <button
                    type="button"
                    className="book-search-result"
                    onClick={() => onOpen(entry.chapter, entry.page)}
                    style={{ minHeight: 44, width: '100%', textAlign: 'left' }}
                  >
                    <span className="book-search-chapter">{entry.chapterTitle}</span>
                    <strong className="book-search-title">{entry.title}</strong>
                    {preview && <span className="book-search-excerpt">{preview}</span>}
                    <ArrowRight className="book-search-arrow" size={18} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
