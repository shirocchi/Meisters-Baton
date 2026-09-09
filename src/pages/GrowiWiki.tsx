import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  Code,
  Download,
  ExternalLink,
  FileText,
  FolderTree,
  Home,
  List,
  LockKeyhole,
  Search,
  Pencil,
  History,
  Images,
  RefreshCw,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useBaton } from '../state';
import { loadWikiAsset } from '../lib/growiWiki';
import {
  expandWikiLists,
  searchWiki,
  wikiAssetFor,
  wikiLink,
  wikiRoute,
  type WikiAsset,
  type WikiPage,
} from '../domain/growiWiki';
import { getReadingStep } from '../domain/propellerWiki';
import { illustratedManual, readingStep } from '../domain/wikiReading';
import { PropellerMonitor } from '../components/PropellerMonitor';
import { useWiki } from '../wikiState';
import { WikiEditor } from '../components/WikiEditor';
import { WikiHistory } from '../components/WikiHistory';
import { WikiOverview, RecordTile } from '../components/WikiOverview';
import { InlineRecording, RecordingEvidence, WorkshopMediaView } from '../components/WikiMedia';
import type { Recording } from '../domain/types';
import type { WorkshopMedia } from '../domain/wikiWorkshop';
import '../styles-propeller-wiki.css';
import '../styles-growi-wiki.css';
import '../styles-wiki-workshop.css';
import '../styles-wiki-reading.css';

function Asset({
  asset,
  token,
  inline = false,
}: {
  asset: WikiAsset;
  token: string;
  inline?: boolean;
}) {
  const [requested, setRequested] = useState(false);
  const placeholder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!inline || requested) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    if (placeholder.current) observer.observe(placeholder.current);
    return () => observer.disconnect();
  }, [inline, requested]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ identity: string; url?: string; error?: string }>();
  const identity = `${token}:${asset.sha256}:${attempt}`;
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let url: string | undefined;
    void loadWikiAsset(asset, token, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setResult({ identity, url });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ identity, error: (e as Error).message });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [identity, requested]);
  const current = result?.identity === identity ? result : undefined;
  if (current?.url) {
    if (inline && asset.contentType.startsWith('image/'))
      return (
        <span className="ww-image-view">
          <img className="gw-image" src={current.url} alt={asset.name} loading="lazy" />
        </span>
      );
    if (inline && asset.contentType.startsWith('video/'))
      return (
        <video
          className="gw-image"
          src={current.url}
          controls
          playsInline
          preload="metadata"
          aria-label={asset.name}
        />
      );
    return (
      <a href={current.url} download={asset.name}>
        <Download size={15} />
        {asset.name}
      </a>
    );
  }
  return (
    <span className="gw-asset" ref={placeholder}>
      <button
        disabled={requested && !current?.error}
        onClick={() => {
          setRequested(true);
          setAttempt((n) => n + 1);
        }}
      >
        {requested && !current?.error ? '読込中…' : asset.name}
      </button>
      {current?.error && (
        <small role="alert">
          {current.error} <button onClick={() => setAttempt((n) => n + 1)}>再試行</button>
        </small>
      )}
    </span>
  );
}
function PageTree({
  pages,
  current,
  openPage,
}: {
  pages: WikiPage[];
  current: string;
  openPage: () => void;
}) {
  function branch(prefix: string): ReactNode {
    return pages
      .filter((p) => p.path.substring(0, p.path.lastIndexOf('/')) === prefix)
      .sort((a, b) => a.path.localeCompare(b.path, 'ja', { numeric: true }))
      .map((p) => {
        const children = pages.filter((c) => c.path.startsWith(p.path + '/'));
        const link = (
          <a
            href={wikiRoute(p.id)}
            aria-current={current === p.id ? 'page' : undefined}
            onClick={openPage}
          >
            <FileText size={14} />
            <span>{p.title}</span>
            {children.length > 0 && <small>{children.length}</small>}
          </a>
        );
        return (
          <li key={p.id}>
            {children.length ? (
              <details
                open={
                  p.path === '/ペラ' || current === p.id || children.some((c) => c.id === current)
                }
              >
                <summary>
                  <FolderTree size={14} />
                  <span>{p.title}</span>
                  <small>{children.length}</small>
                </summary>
                <ul>
                  <li>{link}</li>
                  {branch(p.path)}
                </ul>
              </details>
            ) : (
              link
            )}
          </li>
        );
      });
  }
  return <ul className="gw-tree-list">{branch('')}</ul>;
}
const WikiContent = memo(function WikiContent({
  page,
  pages,
  assets,
  token,
  media = [],
  onEvidence,
  onEditSection,
  recordings = [],
}: {
  page: WikiPage;
  pages: WikiPage[];
  assets: WikiAsset[];
  token: string;
  media?: WorkshopMedia[];
  onEvidence?: (id: string, time: number) => void;
  onEditSection?: (title: string) => void;
  recordings?: Recording[];
}) {
  const slugCounts = new Map<string, number>();
  const heading = (level: number, children: ReactNode) => {
    const plain = (value: ReactNode): string =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : Array.isArray(value)
          ? value.map(plain).join('')
          : value && typeof value === 'object' && 'props' in value
            ? plain((value.props as { children: ReactNode }).children)
            : '';
    const base = plain(children)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    const id = base + (count ? `-${count}` : '');
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
    return (
      <Tag id={id} data-wiki-heading={level}>
        {children}
        {onEditSection && (
          <button
            className="ww-section-edit"
            onClick={() => onEditSection(plain(children))}
            aria-label={`${plain(children)}を編集`}
          >
            <Pencil size={16} />
          </button>
        )}
      </Tag>
    );
  };
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
      components={{
        p: ({ node, children }) => {
          const content = node?.children.filter((n) => n.type !== 'text' || n.value.trim());
          const child = content?.length === 1 ? content[0] : undefined;
          if (child?.type === 'element' && child.tagName === 'a') {
            const href = String(child.properties.href ?? '');
            if (href.startsWith('#evidence/') && !href.includes('?')) {
              const id = decodeURIComponent(href.slice(10));
              const recording = recordings.find((r) => r.id === id);
              if (recording)
                return <InlineRecording recording={recording} open={() => onEvidence?.(id, 0)} />;
            }
          }
          return <p>{children}</p>;
        },
        h1: ({ children }) => heading(1, children),
        h2: ({ children }) => heading(2, children),
        h3: ({ children }) => heading(3, children),
        h4: ({ children }) => heading(4, children),
        a: ({ href = '', children }) => {
          if (href.startsWith('#evidence/')) {
            const [id, query] = href.slice(10).split('?');
            return (
              <button
                className="ww-evidence-link"
                onClick={() =>
                  onEvidence?.(
                    decodeURIComponent(id),
                    Number(new URLSearchParams(query).get('time') ?? 0),
                  )
                }
              >
                <PlayIcon />
                {children}
              </button>
            );
          }
          if (href.startsWith('#media/')) {
            const found = media.find((m) => m.id === href.slice(7));
            return found ? (
              <WorkshopMediaView media={found} />
            ) : (
              <span>添付の参照が見つかりません。</span>
            );
          }
          const asset = wikiAssetFor(href, assets);
          if (asset)
            return (
              <Asset
                asset={asset}
                token={token}
                inline={
                  asset.contentType.startsWith('image/') || asset.contentType.startsWith('video/')
                }
              />
            );
          const target = wikiLink(href, page, pages);
          return (
            <a
              href={target}
              {...(!target.startsWith('#') ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {children}
            </a>
          );
        },
        img: ({ src = '', alt = '' }) => {
          if (src.startsWith('#media/')) {
            const found = media.find((m) => m.id === src.slice(7));
            return found ? (
              <WorkshopMediaView media={found} />
            ) : (
              <span>画像の参照が見つかりません。</span>
            );
          }
          const asset = wikiAssetFor(src, assets);
          return asset ? (
            <Asset asset={asset} token={token} inline />
          ) : (
            <a href={wikiLink(src, page, pages)} target="_blank" rel="noreferrer">
              画像を元の場所で開く：{alt || src}
            </a>
          );
        },
        video: ({ src = '', children }) => {
          const asset = wikiAssetFor(src, assets);
          return asset ? (
            <Asset asset={asset} token={token} inline />
          ) : (
            <span>
              {children}
              <a href={wikiLink(src, page, pages)} target="_blank" rel="noreferrer">
                動画を開く
              </a>
            </span>
          );
        },
      }}
    >
      {expandWikiLists(page.body, page, pages)}
    </Markdown>
  );
});

const noMedia: WorkshopMedia[] = [];
export function GrowiWikiPage() {
  const { auth, navigate, data } = useBaton();
  const wiki = useWiki();
  const [mode, setMode] = useState<'read' | 'media' | 'history'>('read');
  const [editing, setEditing] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{ recording: Recording; time: number }>();
  const [query, setQuery] = useState('');
  const [treeOpen, setTreeOpen] = useState(false);
  const [source, setSource] = useState(false);
  const [toc, setToc] = useState<{ id: string; title: string; level: number }[]>([]);
  const [active, setActive] = useState(0);
  const article = useRef<HTMLDivElement>(null);
  const archive = wiki.archive;
  const pages = wiki.pages;
  const route = location.hash.slice(1).split('?');
  const id = decodeURIComponent(route[0].split('/')[2] || 'home');
  const page = pages.find((p) => p.id === id);
  const edit = wiki.edits.find((e) => e.page_id === id);
  const media = edit?.media ?? noMedia;
  const events = useMemo(
    () => (id === 'home' ? wiki.edits.flatMap((e) => e.events) : (edit?.events ?? [])),
    [id, wiki.edits, edit],
  );
  const recordings = useMemo(
    () => [
      ...new Map(
        events.map((e) => [
          e.recordingId,
          data.recordings.find((r) => r.id === e.recordingId) ?? e.recording,
        ]),
      ).values(),
    ],
    [events, data.recordings],
  );
  const openEvidence = useCallback(
    (recordingId: string, time = 0) => {
      const recording =
        data.recordings.find((r) => r.id === recordingId) ??
        wiki.edits.flatMap((e) => e.events).find((e) => e.recordingId === recordingId)?.recording;
      if (recording) setEvidence({ recording, time });
    },
    [data.recordings, wiki.edits],
  );
  const assets = useMemo(() => archive?.pages.flatMap((p) => p.attachments) ?? [], [archive]);
  const readingPage = useMemo(
    () => (page ? { ...page, body: illustratedManual(page, pages) } : undefined),
    [page, pages],
  );
  const matches = searchWiki(pages, query);
  useEffect(() => {
    setSource(false);
    setActive(0);
  }, [id]);
  useEffect(() => {
    if (!page || source) {
      setToc([]);
      return;
    }
    const elements = Array.from(
      article.current?.querySelectorAll<HTMLElement>('[data-wiki-heading]') ?? [],
    );
    setToc(
      elements.map((e) => ({
        id: e.id,
        title: e.textContent ?? '',
        level: Number(e.dataset.wikiHeading),
      })),
    );
    let frame = 0;
    const update = () => {
      frame = 0;
      setActive(
        getReadingStep(
          elements.map((e) => e.getBoundingClientRect().top),
          180,
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    if (article.current) observer.observe(article.current);
    window.addEventListener('scroll', schedule, { passive: true });
    update();
    const heading = new URLSearchParams(route[1]).get('heading');
    if (heading)
      elements
        .find((e) => e.id === decodeURIComponent(heading))
        ?.scrollIntoView({ block: 'start' });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
    };
  }, [page, source, mode, location.hash]);
  const chapter = toc[active]?.title ?? page?.title ?? '製作の全体像';
  const step = readingStep(chapter, page?.title);
  return (
    <div className="growi-wiki">
      <header className="gw-header">
        <div>
          <BookOpen size={22} />
          <h1>技術Wiki</h1>
          <span>Meister Wiki</span>
        </div>
        <a href="#library/records">
          記録から作ったWiki <ChevronRight size={15} />
        </a>
      </header>
      <div className="gw-mobile">
        <button aria-expanded={treeOpen} onClick={() => setTreeOpen((v) => !v)}>
          <FolderTree size={18} />
          ページツリー
        </button>
      </div>
      <div className="gw-layout">
        <aside className={`gw-sidebar ${treeOpen ? 'is-open' : ''}`} aria-label="Wikiページツリー">
          <label className="gw-search">
            <Search size={17} />
            <input
              aria-label="Wiki全文検索"
              placeholder="ページと本文を検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Wiki検索をクリア" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </label>
          <a className="gw-home" href="#library" onClick={() => setTreeOpen(false)}>
            <Home size={17} />
            カーボンモノコックマニュアル
          </a>
          <div className="gw-tree-heading">
            <FolderTree size={16} />
            ページツリー <small>{archive?.pages.length ?? '—'}</small>
          </div>
          {archive ? (
            query ? (
              <ul className="gw-results">
                {matches.map((p) => (
                  <li key={p.id}>
                    <a href={wikiRoute(p.id)} onClick={() => setTreeOpen(false)}>
                      <strong>{p.title}</strong>
                      <small>{p.path}</small>
                    </a>
                  </li>
                ))}
                {!matches.length && <li role="status">一致するページがありません。</li>}
              </ul>
            ) : (
              <>
                <PageTree pages={archive.pages} current={id} openPage={() => setTreeOpen(false)} />
                <details className="gw-diary-tree" open>
                  <summary>ペラ日記</summary>
                  {archive.diary?.map((p) => (
                    <a key={p.id} href={wikiRoute(p.id)} onClick={() => setTreeOpen(false)}>
                      {p.title}
                    </a>
                  ))}
                </details>
              </>
            )
          ) : (
            <p className="gw-muted">ログインするとページ一覧が表示されます。</p>
          )}
          <a className="gw-old-guide" href="#library/propeller/process-map">
            工程解説ガイド <ChevronRight size={14} />
          </a>
        </aside>
        <article className="gw-document">
          {!auth ? (
            <section className="gw-access">
              <LockKeyhole size={30} />
              <h2>カーボンモノコックマニュアル</h2>
              <p>Meister Wikiのペラカテゴリと、ペラ日記の製作記録を工程ごとにたどれます。</p>
              <button className="button primary" onClick={() => navigate('settings')}>
                ログインして技術Wikiを読む
              </button>
            </section>
          ) : wiki.error ? (
            <section className="gw-access">
              <h2>技術Wikiを読み込めませんでした</h2>
              <p role="alert">{wiki.error}</p>
              <button className="button" onClick={() => void wiki.refresh()}>
                再試行
              </button>
            </section>
          ) : !archive ? (
            <p role="status">技術Wikiを読み込んでいます…</p>
          ) : !page ? (
            <section>
              <h2>ページが見つかりません</h2>
              <a href="#library">マニュアルへ戻る</a>
            </section>
          ) : (
            <>
              <nav className="gw-breadcrumbs" aria-label="Wiki内の現在位置">
                <a href="#library" aria-label="マニュアルのトップへ">
                  <Home size={18} />
                </a>
                {page.path
                  .split('/')
                  .filter(Boolean)
                  .map((part, n, parts) => {
                    const parent = pages.find(
                      (p) => p.path === '/' + parts.slice(0, n + 1).join('/'),
                    );
                    return (
                      <span key={n}>
                        <ChevronRight size={14} />
                        {parent && parent.id !== page.id ? (
                          <a href={wikiRoute(parent.id)}>{part}</a>
                        ) : (
                          part
                        )}
                      </span>
                    );
                  })}
              </nav>
              <div className="gw-page-tools">
                <span>
                  {page.author} · {new Date(page.updatedAt).toLocaleDateString('ja-JP')}
                </span>
                <button
                  aria-pressed={!source && mode === 'read'}
                  onClick={() => {
                    setSource(false);
                    setMode('read');
                  }}
                >
                  <BookOpen size={15} />
                  手順
                </button>
                <button aria-pressed={source} onClick={() => setSource(true)}>
                  <Code size={15} />
                  原文
                </button>
                <button
                  aria-pressed={!source && mode === 'media'}
                  onClick={() => {
                    setSource(false);
                    setMode('media');
                  }}
                >
                  <Images size={16} />
                  写真・動画
                </button>
                <button disabled={!!wiki.editError || !auth} onClick={() => setEditing('')}>
                  <Pencil size={16} />
                  編集
                </button>
                <button
                  aria-pressed={!source && mode === 'history'}
                  disabled={!!wiki.editError}
                  onClick={() => {
                    setSource(false);
                    setMode('history');
                  }}
                >
                  <History size={16} />
                  履歴
                </button>
                {page.id !== 'home' && !page.id.startsWith('diary-') && (
                  <a
                    href={`${archive.origin}/${page.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="元Wikiのページを開く"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
              {wiki.busy && (
                <p className="ww-sync" role="status">
                  <RefreshCw size={15} />
                  {wiki.busy}
                  <button onClick={() => void wiki.refresh()}>更新を確認</button>
                </p>
              )}
              {wiki.editError && (
                <p className="ww-sync" role="alert">
                  {wiki.editError}
                  <button onClick={() => void wiki.refresh()}>再接続</button>
                </p>
              )}
              {edit && (
                <p className="ww-revision-note">
                  版 {edit.version} · {edit.reason} · 履歴から元に戻せます
                </p>
              )}
              {source ? (
                <>
                  <h2>{page.title} — 原文</h2>
                  <pre className="gw-source">{page.body}</pre>
                </>
              ) : mode === 'history' ? (
                <WikiHistory
                  page={page}
                  render={(body) => (
                    <WikiContent
                      page={{ ...page, body }}
                      pages={pages}
                      assets={assets}
                      token={auth.token}
                      media={media}
                      onEvidence={openEvidence}
                    />
                  )}
                />
              ) : mode === 'media' ? (
                <section className="ww-gallery-section">
                  <h2>{page.title}の写真・動画</h2>
                  <p>写真は拡大して手元を確認できます。作業記録は場面ごとに再生できます。</p>
                  <div className="ww-record-grid">
                    {recordings.map((r) => (
                      <RecordTile
                        key={r.id}
                        recording={r}
                        onOpen={() => setEvidence({ recording: r, time: 0 })}
                      />
                    ))}
                  </div>
                  <div className="ww-gallery">
                    {[
                      ...new Map(
                        (id === 'home' ? assets : page.attachments)
                          .filter((a) => a.sha256)
                          .map((a) => [a.sha256, a]),
                      ).values(),
                    ].map((a) => (
                      <figure key={a.id}>
                        <Asset asset={a} token={auth.token} inline />
                        <figcaption>{a.name}</figcaption>
                      </figure>
                    ))}
                    {media.map((m) => (
                      <figure key={m.id}>
                        <WorkshopMediaView media={m} />
                        <figcaption>{m.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                  {!recordings.length && !page.attachments.length && !media.length && (
                    <p>まだ写真・動画がありません。「編集」から画像・動画を追加できます。</p>
                  )}
                </section>
              ) : (
                <>
                  <div className="gw-markdown ww-reading" ref={article}>
                    <WikiContent
                      page={readingPage!}
                      pages={pages}
                      assets={assets}
                      token={auth.token}
                      media={media}
                      recordings={recordings}
                      onEvidence={openEvidence}
                      onEditSection={!wiki.editError ? setEditing : undefined}
                    />
                    {!page.body.trim() && (
                      <>
                        <h2>{page.title}</h2>
                        <p>
                          {page.unavailable
                            ? '元Wikiのアクセス制限により本文を取得できていません。元ページの閲覧権限を確認してください。'
                            : '元Wikiでは本文のないページです。'}
                        </p>
                      </>
                    )}
                  </div>
                  {id === 'home' && (
                    <WikiOverview
                      openRecording={(r) => setEvidence({ recording: r, time: 0 })}
                      renderAsset={(asset) => <Asset asset={asset} token={auth.token} inline />}
                    />
                  )}
                  {recordings.length > 0 && id !== 'home' && (
                    <section className="ww-related">
                      <h2>この工程の手元と判断</h2>
                      <div className="ww-record-grid">
                        {recordings.map((r) => (
                          <RecordTile
                            key={r.id}
                            recording={r}
                            onOpen={() => setEvidence({ recording: r, time: 0 })}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              {mode === 'read' && page.attachments.length > 0 && (
                <section className="gw-attachments">
                  <h2>
                    <Download size={18} />
                    添付ファイル <small>{page.attachments.length}</small>
                  </h2>
                  {page.attachments.map((a) => (
                    <div key={a.id}>
                      <Asset asset={a} token={auth.token} />
                      <small>{(a.bytes / 1024 / 1024).toFixed(2)} MB</small>
                    </div>
                  ))}
                </section>
              )}
              <section className="gw-children">
                <h2>下位ページ</h2>
                {pages
                  .filter((p) => p.path.substring(0, p.path.lastIndexOf('/')) === page.path)
                  .map((p) => (
                    <a key={p.id} href={wikiRoute(p.id)}>
                      <FileText size={16} />
                      {p.title}
                      <ChevronRight size={14} />
                    </a>
                  ))}
              </section>
              <footer className="gw-meta">
                作成：{new Date(page.createdAt).toLocaleDateString('ja-JP')} · 最終更新：
                {new Date(page.updatedAt).toLocaleDateString('ja-JP')}
                <br />
                原文の版：{page.revisionId ?? '編集した統合ページ'} · 移植日：
                {new Date(archive.exportedAt).toLocaleDateString('ja-JP')}
                {page.commentCount > 0 && (
                  <p>
                    コメント {page.commentCount}件：
                    <a href={`${archive.origin}/${page.id}`} target="_blank" rel="noreferrer">
                      元Wikiで確認
                    </a>
                  </p>
                )}
              </footer>
            </>
          )}
        </article>
        <aside className="gw-toc" aria-label="このページの目次">
          <strong>
            <List size={16} />
            このページ
          </strong>
          {toc.map((h, n) => (
            <button
              key={h.id}
              className={n === active ? 'is-active' : ''}
              style={{ paddingLeft: Math.max(0, h.level - 1) * 12 + 10 }}
              onClick={() =>
                document.getElementById(h.id)?.scrollIntoView({
                  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'instant'
                    : 'smooth',
                  block: 'start',
                })
              }
            >
              {h.title}
            </button>
          ))}
        </aside>
      </div>
      <PropellerMonitor step={step} index={active} count={Math.max(1, toc.length)} />
      {auth && page && editing !== null && (
        <WikiEditor
          page={page}
          version={edit?.version ?? 0}
          initialSection={editing}
          close={() => setEditing(null)}
          render={(body, editorMedia) => (
            <WikiContent
              page={{ ...page, body }}
              pages={pages}
              assets={assets}
              token={auth.token}
              media={editorMedia}
              onEvidence={openEvidence}
            />
          )}
        />
      )}
      {auth && evidence && (
        <RecordingEvidence
          recording={evidence.recording}
          time={evidence.time}
          close={() => setEvidence(undefined)}
        />
      )}
    </div>
  );
}
function PlayIcon() {
  return <span aria-hidden="true">▶</span>;
}
