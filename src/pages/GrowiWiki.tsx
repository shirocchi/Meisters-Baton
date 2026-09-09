import { useEffect, useRef, useState, type ReactNode } from 'react';
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
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useBaton } from '../state';
import { loadGrowiWiki, loadWikiAsset } from '../lib/growiWiki';
import {
  expandWikiLists,
  searchWiki,
  wikiAssetFor,
  wikiLink,
  wikiRoute,
  type WikiArchive,
  type WikiAsset,
  type WikiPage,
} from '../domain/growiWiki';
import { getReadingStep, propellerPages } from '../domain/propellerWiki';
import { PropellerMonitor } from '../components/PropellerMonitor';
import '../styles-propeller-wiki.css';
import '../styles-growi-wiki.css';

function Asset({
  asset,
  token,
  inline = false,
}: {
  asset: WikiAsset;
  token: string;
  inline?: boolean;
}) {
  const [requested, setRequested] = useState(inline);
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
      return <img className="gw-image" src={current.url} alt={asset.name} loading="lazy" />;
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
    <span className="gw-asset">
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
function WikiContent({
  page,
  pages,
  assets,
  token,
}: {
  page: WikiPage;
  pages: WikiPage[];
  assets: WikiAsset[];
  token: string;
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
      </Tag>
    );
  };
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
      components={{
        h1: ({ children }) => heading(1, children),
        h2: ({ children }) => heading(2, children),
        h3: ({ children }) => heading(3, children),
        h4: ({ children }) => heading(4, children),
        a: ({ href = '', children }) => {
          const asset = wikiAssetFor(href, assets);
          if (asset) return <Asset asset={asset} token={token} />;
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
}

export function GrowiWikiPage() {
  const { auth, navigate } = useBaton();
  const [result, setResult] = useState<{
    identity: string;
    archive?: WikiArchive;
    error?: string;
  }>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [treeOpen, setTreeOpen] = useState(false);
  const [source, setSource] = useState(false);
  const [toc, setToc] = useState<{ id: string; title: string; level: number }[]>([]);
  const [active, setActive] = useState(0);
  const article = useRef<HTMLDivElement>(null);
  const identity = auth ? `${auth.user.id}:${auth.user.teamId}:${auth.token}:${attempt}` : '';
  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    void loadGrowiWiki(auth.token, controller.signal)
      .then((archive) => {
        if (!controller.signal.aborted) setResult({ identity, archive });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ identity, error: (e as Error).message });
      });
    return () => controller.abort();
  }, [identity]);
  const current = result?.identity === identity ? result : undefined;
  const archive = auth ? current?.archive : undefined;
  const pages = archive
    ? [...(archive.home ? [archive.home] : []), ...archive.pages, ...(archive.diary ?? [])]
    : [];
  const route = location.hash.slice(1).split('?');
  const id = decodeURIComponent(route[0].split('/')[2] || 'home');
  const page = pages.find((p) => p.id === id);
  const assets = archive?.pages.flatMap((p) => p.attachments) ?? [];
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
  }, [page, source, location.hash]);
  const chapter = toc[active]?.title ?? page?.title ?? '製作の全体像';
  const mapping = /貼り合わせ|接着|フランジ/.test(chapter)
    ? 'blade-bonding'
    : /スピナー/.test(chapter)
      ? 'spinner'
      : /塗装|仕上げ/.test(chapter)
        ? 'paint-masking'
        : /回転|試験|安全/.test(chapter)
          ? 'rotation-safety'
          : /積層|外皮|真空/.test(chapter)
            ? 'skin-lamination'
            : /コア|ロハセル|ウェブ/.test(chapter)
              ? 'core-fitting'
              : /型|パテ/.test(chapter)
                ? 'mould-finishing'
                : 'process-map';
  const monitorPage = propellerPages.find((p) => p.slug === mapping)!;
  const step = monitorPage.steps[0];
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
          ) : current?.error ? (
            <section className="gw-access">
              <h2>技術Wikiを読み込めませんでした</h2>
              <p role="alert">{current.error}</p>
              <button className="button" onClick={() => setAttempt((n) => n + 1)}>
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
                <button aria-pressed={!source} onClick={() => setSource(false)}>
                  <BookOpen size={15} />
                  表示
                </button>
                <button aria-pressed={source} onClick={() => setSource(true)}>
                  <Code size={15} />
                  原文
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
              {source ? (
                <>
                  <h2>{page.title} — 原文</h2>
                  <pre className="gw-source">{page.body}</pre>
                </>
              ) : (
                <div className="gw-markdown" ref={article}>
                  <WikiContent page={page} pages={pages} assets={assets} token={auth.token} />
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
              )}
              {page.attachments.length > 0 && (
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
      <PropellerMonitor step={step} index={0} count={monitorPage.steps.length} />
    </div>
  );
}
