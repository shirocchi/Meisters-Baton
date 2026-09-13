import { useEffect, useRef, useState } from 'react';
import { LESSONS } from '../../domain/textbook';
import { PROCESS_STEPS } from '../atlas/ProcessVisual';

type Cursor = { chapter: number; page: number };
/** A single hierarchy for chapters, sections and the active section's actions. */
export function BookContents({
  chapters,
  current,
  currentAnchor,
  pageName,
  pagesFor,
  open,
  jump,
}: {
  chapters: { id: string; title: string }[];
  current: Cursor;
  currentAnchor: string;
  pageName: (chapter: number, page: number) => string;
  pagesFor: (id: string) => number;
  open: (chapter: number, page: number) => void;
  jump: (step: number) => void;
}) {
  const [expanded, setExpanded] = useState(current.chapter);
  const root = useRef<HTMLElement>(null);
  useEffect(() => setExpanded(current.chapter), [current.chapter]);
  useEffect(() => {
    const rail = root.current?.closest<HTMLElement>('.book-toc-rail');
    const item =
      root.current?.querySelector<HTMLElement>('[aria-current="location"]') ??
      root.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !item) return;
    const box = rail.getBoundingClientRect(),
      rect = item.getBoundingClientRect();
    if (rect.bottom > box.bottom - 12) rail.scrollTop += rect.bottom - box.bottom + 12;
    else if (rect.top < box.top + 12) rail.scrollTop -= box.top + 12 - rect.top;
  }, [current.chapter, current.page, currentAnchor, expanded]);
  return (
    <nav className="book-unified-toc" aria-label="教材の目次" ref={root}>
      <p className="book-nav-eyebrow">製作の道すじ</p>
      <h2>目次</h2>
      <ol>
        {chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <button
              className="book-toc-chapter"
              aria-expanded={expanded === index}
              onClick={() => setExpanded(expanded === index ? -1 : index)}
            >
              <span>{index === 0 ? '序' : String(index).padStart(2, '0')}</span>
              <strong>{chapter.title}</strong>
              <span aria-hidden="true">{expanded === index ? '−' : '+'}</span>
            </button>
            {expanded === index && (
              <ol className="book-toc-sections">
                {Array.from({ length: pagesFor(chapter.id) }, (_, page) => {
                  const active = current.chapter === index && current.page === page;
                  const group = LESSONS[chapter.id]?.groups[page - 1];
                  return (
                    <li key={page}>
                      <button
                        aria-current={active ? 'page' : undefined}
                        onClick={() => open(index, page)}
                      >
                        <span>
                          {index}.{page}
                        </span>
                        {pageName(index, page)}
                      </button>
                      {active && group && (
                        <ol className="book-toc-steps">
                          {PROCESS_STEPS[chapter.id]
                            .slice(group.from, group.to + 1)
                            .map((item, offset) => (
                              <li key={item.id}>
                                <button
                                  aria-current={
                                    currentAnchor === `step-${group.from + offset}`
                                      ? 'location'
                                      : undefined
                                  }
                                  onClick={() => jump(group.from + offset)}
                                >
                                  {item.title}
                                </button>
                              </li>
                            ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        ))}
      </ol>
      <p className="book-nav-note">
        章を開いて読みたい節へ。下へスクロールすると、最後まで続けて読めます。
      </p>
    </nav>
  );
}
