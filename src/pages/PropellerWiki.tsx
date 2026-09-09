import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  FileText,
  FolderTree,
  LockKeyhole,
  Search,
} from 'lucide-react';
import { useBaton } from '../state';
import {
  getPropellerPage,
  getReadingStep,
  propellerPages,
  searchPropellerPages,
} from '../domain/propellerWiki';
import { PropellerMonitor } from '../components/PropellerMonitor';
import {
  loadPropellerAttachment,
  loadPropellerSources,
  type PropellerAttachment,
  type PropellerSource,
} from '../lib/propellerSources';
import '../styles-propeller-wiki.css';

function PrivateAttachment({ item, token }: { item: PropellerAttachment; token: string }) {
  const [requested, setRequested] = useState(0);
  const [media, setMedia] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setError('');
    void loadPropellerAttachment(item, token, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setMedia({ token, url: objectUrl });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requested, token, item.sha256]);
  const url = media?.token === token ? media.url : null;
  return (
    <div className="pw-attachment">
      <button
        className="pw-text-button"
        disabled={requested > 0 && !error && !url}
        onClick={() => setRequested((value) => value + 1)}
      >
        {item.filename} · {Math.ceil(item.bytes / 1024)} KB
      </button>
      {requested > 0 && !url && !error && <p role="status">添付を読み込んでいます…</p>}
      {error && <p role="alert">{error}</p>}
      {url &&
        (item.contentType.startsWith('image/') ? (
          <img src={url} alt={item.filename} />
        ) : item.contentType.startsWith('video/') ? (
          <video src={url} controls playsInline preload="metadata" aria-label={item.filename} />
        ) : (
          <a href={url} download={item.filename}>
            添付を保存
          </a>
        ))}
    </div>
  );
}

function PrivateSources({ slug }: { slug: string }) {
  const { auth, navigate } = useBaton();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    identity: string;
    data: PropellerSource | null;
    error: string;
  } | null>(null);
  const identity = auth
    ? `${auth.user.id}:${auth.user.teamId}:${auth.token}:${slug}:${attempt}`
    : '';
  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    void loadPropellerSources(slug, auth.token, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ identity, data, error: '' });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setResult({ identity, data: null, error: (cause as Error).message });
      });
    return () => controller.abort();
  }, [identity]);
  const current = result?.identity === identity ? result : null;
  return (
    <section className="pw-sources" aria-label="この工程の一次資料">
      <div className="pw-source-heading">
        <LockKeyhole size={18} />
        <h2>製作記録・判断の根拠</h2>
        <span>開発メンバー限定</span>
      </div>
      {!auth ? (
        <>
          <p>
            Discordの本文・写真・動画は、開発チームのアカウントでログインするとここに表示されます。
          </p>
          <button className="pw-text-button" onClick={() => navigate('settings')}>
            ログインして一次資料を読む <ArrowRight size={16} />
          </button>
        </>
      ) : !current ? (
        <p role="status">一次資料を確認しています…</p>
      ) : current.error ? (
        <>
          <p role="alert">{current.error}</p>
          <button className="pw-text-button" onClick={() => setAttempt((value) => value + 1)}>
            もう一度読み込む
          </button>
        </>
      ) : !current.data ? (
        <p>
          この工程の一次資料を閲覧するには、管理者による開発チームの登録が必要です。登録済みの場合は資料の準備状況を確認してください。
        </p>
      ) : (
        <>
          <p className="pw-draft-note">
            一次資料から整理した確認待ちの記録です。現行手順としての承認はまだ行われていません。
          </p>
          {current.data.claims.map((claim) => (
            <details key={claim.id} className="pw-source-claim">
              <summary>{claim.title}</summary>
              <p>{claim.body}</p>
              {claim.evidence.map((source) => (
                <div className="pw-evidence" key={source.id}>
                  <p>{source.sourceLabel}</p>
                  <blockquote>{source.quote}</blockquote>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    Discord原文を開く ↗
                  </a>
                  {source.sourceAttachments?.map((item) => (
                    <PrivateAttachment key={item.sha256} item={item} token={auth.token} />
                  ))}
                </div>
              ))}
            </details>
          ))}
        </>
      )}
    </section>
  );
}

export function PropellerWikiPage() {
  const { navigate } = useBaton();
  const routeSlug = location.hash.slice(1).split('/')[2] ?? 'process-map';
  const page = getPropellerPage(routeSlug);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [treeOpen, setTreeOpen] = useState(false);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const matches = searchPropellerPages(query);
  const groups = [...new Set(propellerPages.map((item) => item.group))];
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setActive(
        getReadingStep(
          sections.current.map((element) => element?.getBoundingClientRect().top ?? Infinity),
          Math.min(240, innerHeight * 0.3),
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    sections.current.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [page?.slug]);
  const jump = (index: number) => {
    setActive(index);
    sections.current[index]?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  };
  if (!page)
    return (
      <section className="propeller-wiki">
        <h1>Wikiページが見つかりません</h1>
        <button className="pw-text-button" onClick={() => navigate('library')}>
          製作の全体像へ戻る
        </button>
      </section>
    );
  const step = page.steps[active] ?? page.steps[0];
  return (
    <div className="propeller-wiki">
      <header className="pw-header">
        <div>
          <p>MEISTER'S BATON / KNOWLEDGE</p>
          <h1>プロペラ製作Wiki</h1>
        </div>
        <button className="pw-text-button" onClick={() => navigate('library/records')}>
          <BookOpen size={17} />
          記録から作ったWiki <ArrowRight size={16} />
        </button>
      </header>
      <div className="pw-mobile-tree">
        <button
          aria-expanded={treeOpen}
          aria-controls="propeller-tree"
          onClick={() => setTreeOpen((value) => !value)}
        >
          <FolderTree size={18} />
          ページツリー
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="pw-layout">
        <aside
          id="propeller-tree"
          className={`pw-tree ${treeOpen ? 'is-open' : ''}`}
          aria-label="プロペラWikiのページツリー"
        >
          <div className="pw-tree-title">
            <FolderTree size={16} />
            <strong>ページツリー</strong>
            <span>{propellerPages.length}</span>
          </div>
          <label className="pw-search">
            <Search size={16} />
            <input
              aria-label="プロペラWikiを検索"
              placeholder="ページを探す"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="Wiki検索をクリア" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </label>
          <nav aria-label="製作工程の階層">
            {groups.map((group) => {
              const children = matches.filter((item) => item.group === group);
              if (!children.length) return null;
              return (
                <details key={`${group}:${query}`} open>
                  <summary>{group}</summary>
                  <ul>
                    {children.map((item) => (
                      <li key={item.slug}>
                        <a
                          aria-current={page.slug === item.slug ? 'page' : undefined}
                          href={`#library/propeller/${item.slug}`}
                          onClick={(event) => {
                            event.preventDefault();
                            setTreeOpen(false);
                            navigate(`library/propeller/${item.slug}`);
                          }}
                        >
                          <FileText size={14} />
                          <span>{item.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {!matches.length && (
              <p className="pw-search-empty" role="status">
                一致するページがありません。
              </p>
            )}
          </nav>
          <p className="pw-tree-foot">
            構造はアプリ標準搭載。
            <br />
            製作の根拠は各工程の一次資料へ。
          </p>
        </aside>
        <article className="pw-article">
          <nav className="pw-breadcrumbs" aria-label="Wiki内の現在位置">
            <a href="#library">プロペラ製作</a>
            <ChevronRight size={13} />
            <span>{page.group === 'プロペラ製作' ? '全体像' : page.group.split(' / ')[1]}</span>
          </nav>
          <header className="pw-article-header">
            <div className="pw-eyebrow">
              <span>製作ガイド</span>
              <span>{page.steps.length} SECTIONS</span>
            </div>
            <h2>{page.title}</h2>
            <p>{page.summary}</p>
            <div className="pw-reading-hint">
              <span className="pw-dot" />
              読み進めると、手元のモニターも次の工程へ。
            </div>
          </header>
          <nav className="pw-toc" aria-label="このページの目次">
            <strong>このページ</strong>
            {page.steps.map((item, index) => (
              <button
                key={item.id}
                onClick={() => jump(index)}
                aria-current={index === active ? 'step' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.title}
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <div className="pw-steps">
            {page.steps.map((item, index) => (
              <section
                className={`pw-step ${active === index ? 'is-reading' : ''}`}
                key={item.id}
                id={`pw-${item.id}`}
                ref={(element) => {
                  sections.current[index] = element;
                }}
              >
                <div className="pw-step-kicker">
                  <span>SECTION {String(index + 1).padStart(2, '0')}</span>
                  {active === index && <span>モニターに表示中</span>}
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="pw-focus">
                  <span>モニターで見ること</span>
                  <strong>{item.focus}</strong>
                  <div>
                    {item.labels.map((label, n) => (
                      <span key={label}>
                        {n > 0 && <ArrowRight size={13} />}
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
          <PrivateSources slug={page.slug} />
          <footer className="pw-next">
            <span>関連する工程へ</span>
            {propellerPages
              .filter(
                (item) =>
                  item.slug !== page.slug &&
                  (page.slug === 'process-map' || item.group === page.group),
              )
              .map((item) => (
                <a key={item.slug} href={`#library/propeller/${item.slug}`}>
                  <FileText size={16} />
                  {item.title}
                  <ArrowRight size={16} />
                </a>
              ))}
          </footer>
        </article>
      </div>
      <PropellerMonitor step={step} index={active} count={page.steps.length} />
    </div>
  );
}
