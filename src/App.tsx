import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  Home,
  Leaf,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Video,
  WifiOff,
} from 'lucide-react';
import { BatonProvider, useBaton } from './state';
import { Badge, CraftIllustration, Logo } from './components/ui';
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
  const real = data.recordings.filter((r) => !r.isDemo);
  const shown = data.articles.filter((a) => settings.demoVisible || !a.isDemo);
  const drafts = data.recordings.filter(
    (r) => r.status !== 'published' && (settings.demoVisible || !r.isDemo),
  );
  const requests = data.requests.filter((r) => r.status === 'open');
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
        <div className="local-save">
          <span />
          この端末に保存
        </div>
      </div>
      <section className="workbench">
        <div className="workbench-copy">
          <h2>作業を記録</h2>
          <button className="button light" onClick={() => navigate('capture')}>
            <Plus size={20} />
            今日の作業を残す
            <ArrowUpRight size={19} />
          </button>
        </div>
        <div className="baton-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="baton-rod rod-one" />
          <div className="baton-rod rod-two" />
          <div className="art-joint">
            <Leaf size={23} />
          </div>
        </div>
      </section>
      <section className="work-stats" aria-label="あなたの工房の記録数">
        <div>
          <span>残した作業</span>
          <strong>
            {real.length}
            <small>件</small>
          </strong>
        </div>
        <div>
          <span>引き継げる知識</span>
          <strong>
            {data.articles.filter((a) => !a.isDemo && a.status === 'published').length}
            <small>件</small>
          </strong>
        </div>
        <div>
          <span>確認を待つ判断</span>
          <strong>
            {
              data.articles
                .filter((a) => !a.isDemo)
                .flatMap((a) => a.claims)
                .filter((c) => c.review === 'draft').length
            }
            <small>件</small>
          </strong>
        </div>
        <p>
          <ShieldCheck size={18} />
          映像と回答に戻れる、
          <br />
          根拠のある引き継ぎ。
        </p>
      </section>
      <div className="home-columns">
        <div>
          <div className="section-heading">
            <h2>引き継ぎライブラリ</h2>
            <button className="text-button" onClick={() => navigate('library')}>
              すべて見る
              <ChevronRight size={16} />
            </button>
          </div>
          {shown.length === 0 ? (
            <div className="quiet-panel">
              <BookOpen />
              <h3>最初の知識を残しましょう</h3>
              <p>作業の記録とあなたの回答から、Wikiが育ちます。</p>
            </div>
          ) : (
            <div className="article-grid">
              {shown.slice(0, 4).map((article, i) => (
                <button
                  className="article-tile"
                  key={article.id}
                  onClick={() => navigate(`article/${article.id}`)}
                >
                  <div className="tile-image">
                    {data.recordings.find((r) => r.id === article.recordingId)?.frames[0]
                      ?.dataUrl ? (
                      <img
                        src={
                          data.recordings.find((r) => r.id === article.recordingId)!.frames[0]
                            .dataUrl
                        }
                        alt="作業動画のフレーム"
                      />
                    ) : (
                      <CraftIllustration variant={i} />
                    )}
                    <Badge tone={article.isDemo ? 'amber' : 'green'}>
                      {article.isDemo
                        ? 'サンプル'
                        : article.status === 'published'
                          ? '確認済み'
                          : '下書き'}
                    </Badge>
                  </div>
                  <div className="tile-body">
                    <span className="category">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p>{article.summary}</p>
                    <div>
                      <span>
                        <BookOpen size={13} />
                        {article.claims.length}つの判断・手順
                      </span>
                      <ArrowUpRight size={17} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="home-aside">
          <section>
            <div className="section-heading">
              <h2>記録のつづき</h2>
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
                <p>
                  中断した記録はここから。
                  <br />
                  今はすべて片付いています。
                </p>
              </div>
            )}
          </section>
          <section className="question-note">
            <CircleHelp size={24} />
            <h3>
              後輩の「わからない」が、
              <br />
              次の記録のきっかけに。
            </h3>
            {requests.length > 0 ? (
              <p>{requests[0].text}</p>
            ) : (
              <p>まだ残っていない工程や判断を、質問としてストックできます。</p>
            )}
            <button className="text-button" onClick={() => navigate('ask')}>
              知恵を探す
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
          <div className="baton-line">
            <span />
            <i />
            <span />
          </div>
          <p>技術は、人から人へ。</p>
          <button
            className={active === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            工房の設定
          </button>
          <small>
            Beta 0.1 <span>Meister's Baton</span>
          </small>
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
      <Shell />
    </BatonProvider>
  );
}
