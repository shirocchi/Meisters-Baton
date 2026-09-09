import { useEffect, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  HardDrive,
  Home,
  Link2,
  Plus,
  Search,
  Settings2,
  Video,
  WifiOff,
} from 'lucide-react';
import { BatonProvider, useBaton } from './state';
import { WikiProvider } from './wikiState';
import { Badge, Logo } from './components/ui';
import { CapturePage, InterviewPage } from './pages/Capture';
import { ArticlePage, LibraryPage, AskPage } from './pages/Knowledge';
import { SettingsPage } from './pages/Settings';
import { formatDate } from './domain';
const navigation = [
  { path: 'home', label: '工房', icon: Home },
  { path: 'capture', label: '記録する', icon: Video },
  { path: 'library', label: '技術Wiki', icon: BookOpen },
  { path: 'ask', label: '先輩の知恵', icon: Search },
];
function HomePage() {
  const { data, settings, navigate } = useBaton();
  const [query, setQuery] = useState('');
  const real = data.recordings.filter((r) => !r.isDemo);
  const shown = data.articles.filter(
    (article) =>
      (settings.demoVisible || !article.isDemo) &&
      `${article.title} ${article.summary} ${article.category}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const recordingById = new Map(data.recordings.map((recording) => [recording.id, recording]));
  const drafts = data.recordings.filter(
    (r) => r.status !== 'published' && (settings.demoVisible || !r.isDemo),
  );
  const requests = data.requests.filter((r) => r.status === 'open');
  const publishedCount = data.articles.filter(
    (article) => !article.isDemo && article.status === 'published',
  ).length;
  const draftClaimCount = data.articles
    .filter((article) => !article.isDemo)
    .flatMap((article) => article.claims)
    .filter((claim) => claim.review === 'draft').length;
  const hasRealStats = real.length > 0 || publishedCount > 0 || draftClaimCount > 0;

  return (
    <div className="home-page">
      <div className="page-title">
        <div>
          <p>
            {new Intl.DateTimeFormat('ja-JP', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            }).format(new Date())}
          </p>
          <h1>工房の記録</h1>
        </div>
        <div className="title-actions">
          <button className="button primary" onClick={() => navigate('capture')}>
            <Plus size={18} />
            作業を記録
          </button>
        </div>
      </div>
      <div className="home-tools">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="工房の知識を検索"
            placeholder="工程、材料、判断の言葉で検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="検索語を消す">
              ×
            </button>
          )}
        </label>
        <span className="storage-status">
          <HardDrive size={15} />
          この端末に保存
        </span>
      </div>
      {hasRealStats ? (
        <section className="work-stats" aria-label="あなたの工房の記録数">
          <div>
            <span>作業記録</span>
            <strong>
              {real.length}
              <small>件</small>
            </strong>
          </div>
          <div>
            <span>公開済みWiki</span>
            <strong>
              {publishedCount}
              <small>件</small>
            </strong>
          </div>
          <div>
            <span>確認待ち</span>
            <strong>
              {draftClaimCount}
              <small>件</small>
            </strong>
          </div>
        </section>
      ) : null}
      <div className="home-columns">
        <div>
          <div className="section-heading">
            <h2>技術Wiki</h2>
            <button className="text-button" onClick={() => navigate('library')}>
              すべて見る
              <ChevronRight size={16} />
            </button>
          </div>
          {shown.length === 0 ? (
            <div className="quiet-panel">
              <BookOpen />
              <h3>{query ? '一致する知識がありません' : 'まだ技術Wikiがありません'}</h3>
              <p>
                {query
                  ? '別の言葉で検索してください。'
                  : '「作業を記録」から動画やメモを保存すると、Wikiの下書きを作成できます。'}
              </p>
            </div>
          ) : (
            <div className="article-grid knowledge-index">
              {shown.slice(0, 6).map((article) => (
                <button
                  className="article-tile"
                  key={article.id}
                  onClick={() => navigate(`article/${article.id}`)}
                >
                  <span className="knowledge-icon" aria-hidden="true">
                    {recordingById.get(article.recordingId)?.frames[0]?.dataUrl ? (
                      <img src={recordingById.get(article.recordingId)!.frames[0].dataUrl} alt="" />
                    ) : (
                      <BookOpen size={21} />
                    )}
                  </span>
                  <div className="tile-body">
                    <div className="knowledge-labels">
                      <span className="category">{article.category}</span>
                      <Badge tone={article.isDemo ? 'neutral' : 'green'}>
                        {article.isDemo
                          ? 'サンプル'
                          : article.status === 'published'
                            ? '確認済み'
                            : '下書き'}
                      </Badge>
                    </div>
                    <h3>{article.title}</h3>
                    <p>{article.summary}</p>
                    <div>
                      <span>
                        <Link2 size={13} />
                        {article.claims.length}項目に根拠
                      </span>
                      <span>{formatDate(article.updatedAt)} 更新</span>
                    </div>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="home-aside">
          <section>
            <div className="section-heading">
              <h2>進行中の記録</h2>
              <Badge>{drafts.length}</Badge>
            </div>
            {drafts.slice(0, 3).map((r) => (
              <button
                className="resume-row"
                key={r.id}
                onClick={() => navigate(`recording/${r.id}`)}
              >
                <span className="resume-icon">
                  <AudioLines size={19} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.isDemo ? 'サンプル · ' : ''}
                    {r.answers.length}問回答済み
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {drafts.length === 0 && (
              <div className="small-empty">
                <Clock3 size={24} />
                <p>進行中の記録はありません。</p>
              </div>
            )}
          </section>
          <section className="question-note">
            <CircleHelp size={24} />
            <h3>未回答の質問</h3>
            {requests.length > 0 ? <p>{requests[0].text}</p> : <p>保存した質問はありません。</p>}
            <button className="text-button" onClick={() => navigate('ask')}>
              質問を開く
              <ChevronRight size={16} />
            </button>
          </section>
          <div className="sample-note">
            <span className="small-dot" />
            <p>
              {settings.demoVisible
                ? 'サンプル資料を表示しています。記録数には含まれません。'
                : 'あなたの工房の記録を表示しています。'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function Shell() {
  const { data, navigate, online } = useBaton();
  const [path, setPath] = useState(location.hash.slice(1) || 'home');
  useEffect(() => {
    const change = () => setPath(location.hash.slice(1) || 'home');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const area = path.split('/')[0];
  const active = area === 'article' ? 'library' : area === 'recording' ? 'capture' : area;
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        本文へ移動
      </a>
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() => navigate('home')}
          aria-label="Meister's Baton 工房へ"
        >
          <Logo />
        </button>
        <div className="workspace-chip">
          <span className="workspace-avatar">M</span>
          <span>
            <strong>{data.workspace.name}</strong>
            <small>技術をつなぐ工房</small>
          </span>
        </div>
        <nav aria-label="メインメニュー">
          {navigation.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={active === path ? 'active' : ''}
              onClick={() => navigate(path)}
              aria-current={active === path ? 'page' : undefined}
            >
              <Icon size={20} />
              {label}
              {path === 'capture' && <Plus size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={active === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            工房の設定
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => navigate('home')}>
            <Logo small />
          </button>
          <span className="breadcrumb">
            {data.workspace.name}
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.path === active)?.label ?? '工房の設定'}</strong>
          </span>
          <div className="topbar-right">
            <Badge tone="green">Beta</Badge>
            <button
              className="icon-button"
              onClick={() => navigate('settings')}
              aria-label="工房の設定"
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            オフライン · 記録とWikiはこの端末で使えます
          </div>
        )}
        <main id="main-content" tabIndex={-1} key={path}>
          {area === 'capture' ? (
            <CapturePage />
          ) : area === 'recording' ? (
            <InterviewPage id={path.slice(10)} />
          ) : area === 'library' ? (
            <LibraryPage />
          ) : area === 'article' ? (
            <ArticlePage id={path.slice(8)} />
          ) : area === 'ask' ? (
            <AskPage />
          ) : area === 'settings' ? (
            <SettingsPage />
          ) : (
            <HomePage />
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="モバイルメニュー">
        {navigation.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            className={active === path ? 'active' : ''}
            onClick={() => navigate(path)}
            aria-current={active === path ? 'page' : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
export function App() {
  return (
    <BatonProvider>
      <WikiProvider>
        <Shell />
      </WikiProvider>
    </BatonProvider>
  );
}
