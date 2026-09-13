import { useEffect, useRef } from 'react';

type Chapter = { id: string; title: string; subtitle: string };

export function ProcessNavigation({
  chapters,
  current,
  open,
}: {
  chapters: Chapter[];
  current: number;
  open: (chapter: number) => void;
}) {
  return (
    <nav className="book-process-nav" aria-label="教科書の章">
      <p className="book-nav-eyebrow">製作の道すじ</p>
      <h2>全体の工程</h2>
      <ol>
        {chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <button
              aria-current={index === current ? 'page' : undefined}
              onClick={() => open(index)}
            >
              <span className="book-process-number">
                {index === 0 ? '序' : String(index).padStart(2, '0')}
              </span>
              <span>
                <strong>{chapter.title}</strong>
                {index === current && <small>いま読んでいる章</small>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="book-nav-note">外皮の内側を組んでから、二つの外皮を閉じます。</p>
    </nav>
  );
}

export type OutlinePage = { title: string; anchors?: { id: string; title: string }[] };
export function ChapterOutline({
  chapter,
  title,
  pages,
  currentPage,
  currentAnchor,
  open,
  jump,
}: {
  chapter: number;
  title: string;
  pages: OutlinePage[];
  currentPage: number;
  currentAnchor: string;
  open: (page: number) => void;
  jump: (anchor: string) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const rail = navigation.current?.closest<HTMLElement>('.book-section-rail');
    const selected = navigation.current?.querySelector<HTMLElement>(
      '[aria-current="location"], [aria-current="page"]',
    );
    const location = navigation.current?.querySelector<HTMLElement>('[aria-current="location"]');
    const target = location ?? selected;
    if (!rail || !target || rail.clientHeight === 0) return;
    const box = rail.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    const bottom = Math.min(box.bottom, window.innerHeight);
    if (item.bottom > bottom - 18) rail.scrollTop += item.bottom - bottom + 18;
    else if (item.top < box.top + 18) rail.scrollTop -= box.top + 18 - item.top;
  }, [currentPage, currentAnchor]);
  return (
    <nav className="book-section-nav" aria-label="この工程の目次" ref={navigation}>
      <p className="book-nav-eyebrow">{chapter ? `第${chapter}章` : '序章'}の現在地</p>
      <h2>目次</h2>
      <p className="book-outline-count">
        {title} · {currentPage + 1} / {pages.length} ページ
      </p>
      <ol>
        {pages.map((page, index) => (
          <li key={index}>
            <button
              aria-current={currentPage === index ? 'page' : undefined}
              onClick={() => open(index)}
            >
              <span className="book-outline-number">
                {chapter}.{index}
              </span>
              <span>{page.title}</span>
            </button>
            {index === currentPage && page.anchors && (
              <ol className="book-section-anchors">
                {page.anchors.map((anchor) => (
                  <li key={anchor.id}>
                    <button
                      aria-current={currentAnchor === anchor.id ? 'location' : undefined}
                      onClick={() => jump(anchor.id)}
                    >
                      {anchor.title}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
      <p className="book-nav-note">本文を読むと、現在地が移ります。</p>
    </nav>
  );
}
