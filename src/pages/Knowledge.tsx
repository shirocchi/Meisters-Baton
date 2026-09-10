import { lazy, Suspense, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  Edit3,
  FileText,
  FolderTree,
  History,
  Link2,
  ListFilter,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { useBaton } from '../state';
import { Badge, CraftIllustration, Empty, Modal, PageTitle, ProgressSteps } from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import {
  confirmClaim,
  editClaim,
  formatDate,
  formatTime,
  makeId,
  publishArticle,
  searchKnowledge,
} from '../domain';
import type { Article, Claim, Evidence, SearchAnswer } from '../domain/types';
import { downloadFile } from '../lib/media';
import { api } from '../lib/api';
import { PropellerWikiPage } from './PropellerWiki';
import { useWiki } from '../wikiState';
const WikiAtlasPage = lazy(() =>
  import('./WikiAtlas').then((module) => ({ default: module.WikiAtlasPage })),
);
const GrowiWikiPage = lazy(() =>
  import('./GrowiWiki').then((module) => ({ default: module.GrowiWikiPage })),
);
import { importBackup, mergeTeamData } from '../lib/storage';
const kindNames = {
  step: '作業の手順',
  judgment: '判断の手がかり',
  warning: '注意・確認したいこと',
};
export function LibraryPage() {
  const wiki = useWiki();
  const path = location.hash.split('?')[0];
  const atlasStage = wiki.archive?.atlas?.stages.find(
    (s) => path === `#library/atlas/${s.id}` || path === `#library/wiki/${s.pageId}`,
  );
  if (wiki.archive?.atlas && (path === '#library' || path === '#library/' || atlasStage)) {
    const stageId = atlasStage?.id ?? wiki.archive.atlas.stages[0].id;
    return (
      <Suspense fallback={<p role="status">立体図鑑を読み込んでいます…</p>}>
        <WikiAtlasPage key={stageId} stageId={stageId} />
      </Suspense>
    );
  }
  return location.hash.startsWith('#library/records') ? (
    <RecordedLibraryPage />
  ) : location.hash.startsWith('#library/propeller/') ? (
    <PropellerWikiPage />
  ) : (
    <Suspense fallback={<p role="status">技術Wikiを読み込んでいます…</p>}>
      <GrowiWikiPage />
    </Suspense>
  );
}
function RecordedLibraryPage() {
  const { data, settings, navigate, mutate, toast } = useBaton();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('すべて');
  const importInput = useRef<HTMLInputElement>(null);
  const articles = data.articles.filter(
    (a) =>
      (settings.demoVisible || !a.isDemo) &&
      (filter === 'all' ||
        (filter === 'published'
          ? a.status === 'published'
          : filter === 'draft'
            ? a.status === 'draft'
            : a.bookmarked)) &&
      (category === 'すべて' || a.category === category) &&
      `${a.title} ${a.summary} ${a.claims.map((c) => c.body).join(' ')}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const categories = [
    ...new Set(
      data.articles.filter((a) => settings.demoVisible || !a.isDemo).map((a) => a.category),
    ),
  ];
  const visibleArticles = data.articles.filter((a) => settings.demoVisible || !a.isDemo);
  const discordDrafts = visibleArticles.filter(
    (article) => !article.isDemo && article.author === 'Discordアーカイブから仮整理',
  );
  const importWikiDraft = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const incoming = importBackup(text);
      const incomingDrafts = incoming.articles.filter(
        (article) => !article.isDemo && article.author === 'Discordアーカイブから仮整理',
      );
      if (!incomingDrafts.length) throw new Error('「プロペラWiki下書き.json」を選んでください。');
      await mutate((current) => mergeTeamData(current, incoming));
      toast(`プロペラWikiの下書き${incomingDrafts.length}本をこの端末へ追加しました。`);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };
  return (
    <>
      <PageTitle label="工房に積み重なる知恵" title="技術Wiki">
        <input
          ref={importInput}
          hidden
          type="file"
          accept="application/json,.json"
          aria-label="Wiki下書きJSONを選択"
          onChange={(event) => void importWikiDraft(event.target.files?.[0])}
        />
        <button className="button" onClick={() => importInput.current?.click()}>
          <Upload size={18} />
          初期プロペラWikiを読み込む
        </button>
        <button className="button primary" onClick={() => navigate('capture')}>
          <PlusIcon />
          記録からつくる
        </button>
      </PageTitle>
      <section className="wiki-origin-banner">
        <div>
          <span className="wiki-origin-icon" aria-hidden="true">
            <FolderTree size={20} />
          </span>
          <div>
            <strong>Discord一次資料から、階層を持つWikiへ</strong>
            <p>ペラ日記を主資料にした下書きを取り込み、原文と照らして確認してから公開します。</p>
            <small>選んだJSONはこの端末内だけで処理され、Vercelへ送信されません。</small>
          </div>
        </div>
        <span>{discordDrafts.length ? `${discordDrafts.length}本の下書き` : '取込待ち'}</span>
      </section>
      <div className="library-tools">
        <label className="search-field">
          <Search size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="工程、材料、判断の言葉で探す"
            aria-label="Wikiを検索"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="検索語を消す">
              ×
            </button>
          )}
        </label>
        <label className="filter-select">
          <ListFilter size={17} />
          <select
            aria-label="カテゴリーで絞り込み"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>すべて</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="tabs">
        {[
          ['all', 'すべての知識'],
          ['published', '引き継ぎ可能'],
          ['draft', '確認待ち'],
          ['saved', 'あとで読む'],
        ].map(([id, label]) => (
          <button className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <span>{articles.length}件</span>
      </div>
      <div className="wiki-browser-layout">
        <aside className="wiki-page-tree" aria-label="Wikiページツリー">
          <div className="wiki-tree-heading">
            <FolderTree size={17} />
            <strong>ページツリー</strong>
          </div>
          <button
            className={category === 'すべて' ? 'active' : ''}
            onClick={() => setCategory('すべて')}
          >
            {discordDrafts.length ? 'プロペラ製作Wiki' : 'すべてのWiki'}
            <span>{visibleArticles.length}</span>
          </button>
          {categories.map((name) => (
            <div className="wiki-tree-group" key={name}>
              <button
                className={category === name ? 'active' : ''}
                onClick={() => setCategory(name)}
              >
                {name}
                <span>{visibleArticles.filter((article) => article.category === name).length}</span>
              </button>
              {visibleArticles
                .filter((article) => article.category === name)
                .map((article) => (
                  <button
                    className="wiki-tree-page"
                    key={article.id}
                    onClick={() => navigate(`article/${article.id}`)}
                  >
                    {article.title}
                  </button>
                ))}
            </div>
          ))}
        </aside>
        <div className="wiki-browser-results">
          {articles.length === 0 ? (
            <Empty
              icon={<BookOpen size={35} />}
              title={query ? '一致する知識がありません' : 'まだ知識がありません'}
              text={
                query
                  ? '別の言葉で探すか、後輩の質問として残しておけます。'
                  : 'Discord一次資料のWiki下書き、または作業記録を取り込んでください。'
              }
              action={
                <button
                  className="button primary"
                  onClick={() => (query ? navigate('ask') : importInput.current?.click())}
                >
                  {query ? '先輩の知恵で質問する' : '初期プロペラWikiを読み込む'}
                  <ArrowRight size={17} />
                </button>
              }
            />
          ) : (
            <div className="wiki-list">
              {articles.map((article, i) => (
                <div className="wiki-row" key={article.id}>
                  <button
                    className="wiki-row-main"
                    onClick={() => navigate(`article/${article.id}`)}
                  >
                    <div className="wiki-thumb">
                      {data.recordings.find((r) => r.id === article.recordingId)?.frames[0]
                        ?.dataUrl ? (
                        <img
                          src={
                            data.recordings.find((r) => r.id === article.recordingId)!.frames[0]
                              .dataUrl
                          }
                          alt=""
                        />
                      ) : (
                        <CraftIllustration variant={i} />
                      )}
                    </div>
                    <div className="wiki-row-copy">
                      <div className="inline-meta">
                        <span className="category">{article.category}</span>
                        <Badge
                          tone={
                            article.isDemo
                              ? 'amber'
                              : article.status === 'published'
                                ? 'green'
                                : 'neutral'
                          }
                        >
                          {article.isDemo
                            ? 'サンプル'
                            : article.status === 'published'
                              ? '確認済み'
                              : '下書き'}
                        </Badge>
                      </div>
                      <h2>{article.title}</h2>
                      <p>{article.summary}</p>
                      <div className="wiki-meta">
                        <span>
                          <Link2 size={13} />
                          {article.claims.length}項目に根拠
                        </span>
                        <span>{article.author}</span>
                        <span>{formatDate(article.updatedAt)} 更新</span>
                      </div>
                    </div>
                  </button>
                  <button
                    className={`icon-button bookmark ${article.bookmarked ? 'selected' : ''}`}
                    aria-label={article.bookmarked ? 'あとで読むを解除' : 'あとで読むに保存'}
                    onClick={() =>
                      void mutate((d) => ({
                        ...d,
                        articles: d.articles.map((a) =>
                          a.id === article.id ? { ...a, bookmarked: !a.bookmarked } : a,
                        ),
                      })).catch((e) => toast(e.message))
                    }
                  >
                    <Bookmark size={20} fill={article.bookmarked ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <section className="recordings-section">
        <div className="section-heading">
          <h2>もとの作業記録</h2>
          <span>{data.recordings.filter((r) => settings.demoVisible || !r.isDemo).length}件</span>
        </div>
        <div className="recording-list">
          {data.recordings
            .filter((r) => settings.demoVisible || !r.isDemo)
            .map((record) => (
              <button key={record.id} onClick={() => navigate(`recording/${record.id}`)}>
                <span className="record-list-icon">
                  <Video size={19} />
                </span>
                <span>
                  <strong>{record.title}</strong>
                  <small>
                    {record.isDemo ? 'サンプル · ' : ''}
                    {record.duration ? formatTime(record.duration) : '作業メモ'} ·{' '}
                    {formatDate(record.createdAt)}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
function PlusIcon() {
  return <span className="plus-icon">+</span>;
}
export function EvidenceViewer({ evidence, close }: { evidence: Evidence; close: () => void }) {
  const { data } = useBaton();
  const record = data.recordings.find((r) => r.id === evidence.recordingId);
  const answer = record?.answers.find((a) => a.id === evidence.answerId);
  const question = record?.analysis?.questions.find((q) => q.id === answer?.questionId);
  const segment = record?.analysis?.segments.find((s) => s.id === question?.segmentId);
  const time = evidence.time ?? segment?.start ?? 0;
  return (
    <Modal title="この知識の根拠" close={close} wide>
      <div className="evidence-modal-body">
        <div className="source-kind">
          <Badge tone="green">
            {evidence.kind === 'answer'
              ? '作業者の回答原文'
              : evidence.kind === 'video'
                ? '映像上の観察'
                : '作業メモの原文'}
          </Badge>
          {record?.isDemo && <Badge tone="amber">サンプル</Badge>}
        </div>
        {question && <p className="source-question">質問：{question.text}</p>}
        {evidence.sourceLabel && <p className="source-question">出典：{evidence.sourceLabel}</p>}
        <blockquote>{evidence.quote}</blockquote>
        {evidence.sourceAttachments?.length ? (
          <div className="source-attachments">
            <strong>一次アーカイブの添付（{evidence.sourceAttachments.length}点）</strong>
            <ul>
              {evidence.sourceAttachments.map((attachment) => (
                <li key={`${attachment.sha256}:${attachment.filename}`}>
                  {attachment.filename}
                  <small>{new Intl.NumberFormat('ja-JP').format(attachment.bytes)} bytes</small>
                </li>
              ))}
            </ul>
            <p>添付本体は共有フォルダの「01_一次アーカイブ」に保存されています。</p>
          </div>
        ) : null}
        {evidence.sourceUrl && (
          <a
            className="button source-link"
            href={evidence.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Discord原文を開く
            <ArrowUpRight size={15} />
          </a>
        )}
        <p className="source-author">
          {answer?.author ?? record?.author} {answer && ` / ${formatDate(answer.createdAt)}`}
        </p>
        {record && (
          <>
            <h3 className="source-record-title">{record.title}</h3>
            <VideoPlayer recording={record} time={time} />
            {record.duration > 0 && (
              <p className="subtle">
                {formatTime(time)}付近の作業。回答の内容は、上に表示した本人の説明が根拠です。
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
function articleMarkdown(article: Article) {
  return (
    `# ${article.title}\n\n${article.isDemo ? '> サンプル資料。実作業の手順として使わないでください。\n\n' : ''}${article.summary}\n\nカテゴリー: ${article.category}\n記録者: ${article.author}\n状態: ${article.status === 'published' ? '確認済み・公開' : '確認待ちの下書き'}\n更新: ${article.updatedAt}\n\n` +
    article.claims
      .map(
        (c) =>
          `## ${kindNames[c.kind]}: ${c.title}\n\n${c.body}\n\n確認: ${c.review === 'confirmed' ? `${c.reviewedBy} / ${c.reviewedAt}` : '未確認'}\n\n` +
          c.evidence
            .map(
              (e) =>
                `> 根拠 (${e.kind}, 記録 ${e.recordingId}${e.time !== undefined ? `, ${formatTime(e.time)}` : ''}): ${e.quote.replace(/\n/g, '\n> ')}\n${e.sourceUrl ? `> 原文: ${e.sourceUrl}\n` : ''}`,
            )
            .join('\n'),
      )
      .join('\n') +
    "\n---\nMeister's Baton から書き出し。元動画はこのファイルには含まれません。\n"
  );
}
export function ArticlePage({ id }: { id: string }) {
  const { data, settings, mutate, navigate, toast } = useBaton();
  const article = data.articles.find((a) => a.id === id);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [editing, setEditing] = useState<Claim | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [tab, setTab] = useState('knowledge');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishDialog, setPublishDialog] = useState(false);
  if (!article)
    return (
      <Empty
        title="Wikiが見つかりません"
        text="この端末にないか、削除されたWikiです。"
        action={
          <button className="button" onClick={() => navigate('library/records')}>
            技術Wikiへ
          </button>
        }
      />
    );
  const record = data.recordings.find((r) => r.id === article.recordingId);
  const confirmed = article.claims.filter((c) => c.review === 'confirmed').length;
  const author = settings.displayName || '作業者';
  const change = async (fn: (current: Article) => Article) => {
    setError('');
    setBusy(true);
    try {
      await mutate((d) => ({ ...d, articles: d.articles.map((a) => (a.id === id ? fn(a) : a)) }));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      await mutate((d) => ({
        ...d,
        articles: d.articles.map((a) =>
          a.id === id ? publishArticle(a, author, d.recordings) : a,
        ),
        recordings: d.recordings.map((r) =>
          r.id === article.recordingId ? { ...r, status: 'published' } : r,
        ),
        activity: [
          {
            id: makeId(),
            type: 'publish',
            title: `${article.title}をWikiに公開`,
            createdAt: new Date().toISOString(),
            targetId: id,
          },
          ...d.activity,
        ],
      }));
      setPublishDialog(false);
      toast('Wikiに公開しました。先輩の知恵から検索できます。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle label="技術Wiki" title={article.title} back={() => navigate('library/records')}>
        <button
          className="icon-button"
          aria-label="Markdownで書き出す"
          onClick={() =>
            void downloadFile(
              articleMarkdown(article),
              `${article.title.replace(/[<>:"/\\|?*]/g, '_')}.md`,
              'text/markdown',
            ).catch((e) => toast(e.message))
          }
        >
          <Download size={21} />
        </button>
        <button
          className={`icon-button ${article.bookmarked ? 'selected' : ''}`}
          aria-label="あとで読む"
          onClick={() => void change((a) => ({ ...a, bookmarked: !a.bookmarked }))}
        >
          <Bookmark size={20} fill={article.bookmarked ? 'currentColor' : 'none'} />
        </button>
      </PageTitle>
      {article.status === 'draft' && <ProgressSteps current={2} />}
      <div className="article-detail-meta">
        <Badge tone={article.status === 'published' ? 'green' : 'amber'}>
          {article.status === 'published' ? '確認済み・引き継ぎ可能' : '下書き・確認待ち'}
        </Badge>
        {article.isDemo && <Badge tone="amber">サンプル資料</Badge>}
        <span>{article.category}</span>
        <span>{article.author}</span>
        <span>{formatDate(article.updatedAt)} 更新</span>
      </div>
      <p className="article-summary">{article.summary}</p>
      <div className="article-layout">
        <section>
          <div className="tabs">
            <button
              className={tab === 'knowledge' ? 'active' : ''}
              onClick={() => setTab('knowledge')}
            >
              <BookOpen size={16} />
              引き継ぐ知識
            </button>
            <button
              className={tab === 'evidence' ? 'active' : ''}
              onClick={() => setTab('evidence')}
            >
              <Link2 size={16} />
              根拠
            </button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              <History size={16} />
              変更履歴
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {tab === 'knowledge' && (
            <div className="claims">
              {article.claims.map((claim, i) => (
                <article className={`claim-card ${claim.kind}`} key={claim.id}>
                  <div className="claim-top">
                    <span className="claim-number">{String(i + 1).padStart(2, '0')}</span>
                    <span className="claim-kind">{kindNames[claim.kind]}</span>
                    <Badge tone={claim.review === 'confirmed' ? 'green' : 'amber'}>
                      {claim.review === 'confirmed' ? (
                        <>
                          <Check size={12} />
                          確認済み
                        </>
                      ) : (
                        '要確認'
                      )}
                    </Badge>
                  </div>
                  <h2>{claim.title}</h2>
                  <p className="claim-body">{claim.body}</p>
                  <div className="claim-evidence">
                    {claim.evidence.map((item, j) => (
                      <button key={item.id} onClick={() => setEvidence(item)}>
                        <Link2 size={14} />
                        {item.sourceUrl
                          ? 'Discord原文'
                          : item.kind === 'answer'
                            ? '作業者の回答'
                            : item.kind === 'note'
                              ? '記録メモ'
                              : `映像 ${formatTime(item.time ?? 0)}`}
                        {claim.evidence.length > 1 ? ` ${j + 1}` : ''}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                  <div className="claim-footer">
                    <span>
                      {claim.review === 'confirmed'
                        ? `${claim.reviewedBy}が内容を確認`
                        : '原文と照らし合わせて確認してください'}
                    </span>
                    <div>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(claim);
                          setEditTitle(claim.title);
                          setEditBody(claim.body);
                        }}
                      >
                        <Edit3 size={14} />
                        編集
                      </button>
                      {claim.review !== 'confirmed' && (
                        <button
                          className="confirm-button"
                          disabled={busy}
                          onClick={() =>
                            void change((a) => confirmClaim(a, claim.id, author, data.recordings))
                          }
                        >
                          <Check size={15} />
                          内容を確認した
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === 'evidence' && (
            <div className="evidence-index">
              {article.claims.map((c) => (
                <section key={c.id}>
                  <h3>{c.title}</h3>
                  {c.evidence.map((e) => (
                    <button key={e.id} onClick={() => setEvidence(e)}>
                      <MessageCircle size={18} />
                      <span>
                        <strong>
                          {e.sourceUrl
                            ? 'Discord一次資料'
                            : e.kind === 'answer'
                              ? '作業者の回答原文'
                              : e.kind === 'note'
                                ? '作業メモ'
                                : '映像の観察'}
                        </strong>
                        <p>{e.quote}</p>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
          {tab === 'history' && (
            <div className="history-list">
              {article.revisions.length === 0 ? (
                <Empty
                  icon={<History />}
                  title="ここから知識が育ちます"
                  text="内容の編集・確認・公開の履歴を残します。元の回答は書き換えません。"
                />
              ) : (
                article.revisions
                  .slice()
                  .reverse()
                  .map((revision) => (
                    <details key={revision.id}>
                      <summary>
                        <span className="history-dot" />
                        <div>
                          <strong>{revision.reason}</strong>
                          <p>
                            {revision.author} · {formatDate(revision.createdAt)} · 保存版{' '}
                            {revision.number}
                          </p>
                        </div>
                      </summary>
                      <div className="revision-body">
                        <h3>{revision.title}</h3>
                        {revision.claims.map((c) => (
                          <p key={c.id}>
                            <strong>{c.title}</strong>
                            <br />
                            {c.body}
                          </p>
                        ))}
                      </div>
                    </details>
                  ))
              )}
            </div>
          )}
        </section>
        <aside className="article-aside">
          <div className="review-panel">
            <ShieldCheck size={28} />
            <h2>
              {article.status === 'published' ? '次の手へ、渡せる知識。' : '確認して、次の手へ。'}
            </h2>
            <p>
              {article.status === 'published'
                ? '根拠と確認者が残っています。条件が違うときは作業者に確かめてください。'
                : '下書きを読んで、各項目の内容を確認してください。すべての確認が済むと公開できます。'}
            </p>
            <div className="review-progress">
              <span>
                {confirmed}
                <small> / {article.claims.length} 項目を確認</small>
              </span>
              <progress
                aria-label="確認済みの項目数"
                value={confirmed}
                max={article.claims.length}
              />
            </div>
            {article.status === 'draft' ? (
              <button
                className="button primary full"
                disabled={busy || confirmed !== article.claims.length}
                onClick={() => setPublishDialog(true)}
              >
                確認済みWikiとして公開
                <ArrowRight size={17} />
              </button>
            ) : (
              <button className="button full" onClick={() => navigate('ask')}>
                この知識を探してみる
                <Search size={17} />
              </button>
            )}
          </div>
          {record && (
            <div className="source-card">
              <h3>もとの作業</h3>
              <VideoPlayer recording={record} />
              <button className="text-button" onClick={() => navigate(`recording/${record.id}`)}>
                映像と対話をひらく
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          <button className="text-button danger-text" onClick={() => setDeleting(true)}>
            <Trash2 size={15} />
            このWikiを削除
          </button>
        </aside>
      </div>
      {evidence && <EvidenceViewer evidence={evidence} close={() => setEvidence(null)} />}{' '}
      {editing && (
        <Modal title="引き継ぐ内容を編集" close={() => setEditing(null)}>
          <div className="modal-body">
            <p className="subtle">
              本文を変えると、この項目は再確認が必要になります。根拠の原文は変わりません。
            </p>
            <label>
              見出し
              <input
                value={editTitle}
                maxLength={300}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label>
              本文
              <textarea
                rows={7}
                value={editBody}
                maxLength={10000}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </label>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <button
              className="button primary full"
              disabled={!editTitle.trim() || !editBody.trim() || busy}
              onClick={() => {
                void change((a) =>
                  editClaim(
                    a,
                    editing.id,
                    { title: editTitle.trim(), body: editBody.trim() },
                    author,
                  ),
                ).then((saved) => {
                  if (saved) setEditing(null);
                });
              }}
            >
              変更を保存する
            </button>
          </div>
        </Modal>
      )}
      {publishDialog && (
        <Modal title="この知識を引き継ぎます" close={() => setPublishDialog(false)}>
          <div className="modal-body">
            <p>
              確認した{confirmed}
              項目を、検索できるWikiとしてこの端末に公開します。チームへの共有は設定の「チーム共有」から行えます。
            </p>
            <p className="subtle">
              確認者：{author}
              {article.isDemo ? ' · サンプル資料として扱われます。' : ''}
            </p>
            <button className="button primary full" disabled={busy} onClick={() => void publish()}>
              <ShieldCheck size={18} />
              Wikiに公開する
            </button>
            {error && <div className="error-banner">{error}</div>}
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="このWikiを削除しますか" close={() => setDeleting(false)}>
          <div className="modal-body">
            <p>
              「{article.title}
              」と、このページの変更履歴をこの端末から削除します。もとの作業記録と回答は残ります。
            </p>
            <button
              className="button danger full"
              onClick={() =>
                void mutate((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== id) }))
                  .then(() => {
                    toast('Wikiを削除しました');
                    navigate('library/records');
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Wikiを削除する
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function AskPage() {
  const { data, settings, auth, mutate, navigate, toast } = useBaton();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Evidence | null>(null);
  const [aiAnswer, setAiAnswer] = useState<SearchAnswer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const results = query
    ? searchKnowledge(data, query, { includeDemo: settings.demoVisible, limit: 6 })
    : [];
  const ask = (text = input) => {
    const value = text.trim();
    setInput(value);
    setQuery(value);
    setAiAnswer(null);
    setError('');
  };
  const request = async () => {
    if (!query) return;
    if (data.requests.some((r) => r.text === query && r.status === 'open')) {
      toast('この質問はすでに残っています');
      return;
    }
    await mutate((d) => ({
      ...d,
      requests: [
        {
          id: makeId('request'),
          text: query,
          category: 'その他',
          status: 'open',
          createdAt: new Date().toISOString(),
        },
        ...d.requests,
      ],
    }));
    toast('次の作業で確かめたい質問に残しました');
  };
  const askAI = async () => {
    if (!auth || !settings.aiConsent) {
      toast('工房の設定でチーム接続とAIへの送信を有効にしてください');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setAiAnswer(
        await api<SearchAnswer>(settings, '/api/ai/search', {
          method: 'POST',
          sessionToken: auth?.token,
          sessionTeamId: auth?.user.teamId,
          body: { query },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle label="迷ったときに、根拠へ戻れる" title="先輩の知恵" />
      <div className="ask-layout">
        <section>
          <div className="ask-intro">
            <span className="ask-symbol">
              <MessageCircle size={27} />
            </span>
            <h2>いま、どこで迷っていますか。</h2>
            <p>確認済みのWikiから、先輩が残した判断を探します。</p>
          </div>
          <form
            className="ask-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <textarea
              aria-label="先輩の知恵に質問する"
              rows={2}
              maxLength={1000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例：積層前に、何を確認している？"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <div>
              <span>確認済みの記録だけを検索</span>
              <button className="button primary" type="submit" disabled={!input.trim()}>
                <Search size={17} />
                知恵を探す
              </button>
            </div>
          </form>
          {!query && (
            <div className="suggested-questions">
              <p>こんな言葉から探せます</p>
              {['積層前に確認すること', 'しわを見つけたとき', '後輩への引き継ぎ'].map((text) => (
                <button key={text} onClick={() => ask(text)}>
                  {text}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          )}
          {query && (
            <div className="search-response">
              <div className="section-heading">
                <h2>「{query}」の手がかり</h2>
                <Badge>{results.length}件</Badge>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {results.length > 0 ? (
                <>
                  <div className="answer-card">
                    <div>
                      <ShieldCheck size={20} />
                      <strong>確認済みの記録から</strong>
                    </div>
                    <p>{results[0].body}</p>
                    <small>
                      {results[0].isDemo
                        ? 'サンプル資料の引用です。実作業の判断には使わないでください。'
                        : '先輩が確認した記述を、そのまま表示しています。'}
                    </small>
                  </div>
                  <div className="search-results">
                    {results.map((result) => (
                      <article key={`${result.articleId}-${result.claimId}`}>
                        <div className="result-heading">
                          <span className="category">{result.category}</span>
                          {result.isDemo && <Badge tone="amber">サンプル</Badge>}
                        </div>
                        <button
                          className="result-title"
                          onClick={() => navigate(`article/${result.articleId}`)}
                        >
                          <h3>{result.title}</h3>
                          <ArrowUpRight size={18} />
                        </button>
                        <p>{result.body}</p>
                        <div className="result-evidence">
                          {result.evidence.map((e) => (
                            <button key={e.id} onClick={() => setSource(e)}>
                              <Link2 size={13} />
                              {e.kind === 'answer'
                                ? '回答原文を見る'
                                : e.kind === 'video'
                                  ? `${formatTime(e.time ?? 0)}の映像`
                                  : 'メモを見る'}
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <Empty
                  icon={<CircleHelp size={32} />}
                  title="この判断は、まだ残っていません。"
                  text="見つからないことを、推測で埋めません。次の作業で先輩に確かめる質問として残せます。"
                  action={
                    <button
                      className="button"
                      onClick={() => void request().catch((e) => setError(e.message))}
                    >
                      <MessageCircle size={17} />
                      次に確かめたい質問に残す
                    </button>
                  }
                />
              )}
              {auth && (
                <div className="ai-search">
                  <button className="text-button" disabled={busy} onClick={() => void askAI()}>
                    <Sparkles size={16} />
                    {busy ? '共有された知識を確認中' : '同期済みのチームWikiをAIに尋ねる'}
                  </button>
                  <small>サーバーに共有した知識を使います。</small>
                  {aiAnswer && (
                    <div className="answer-card">
                      <p>{aiAnswer.answer}</p>
                      {aiAnswer.citations.map((c, i) => (
                        <button
                          className="text-button"
                          key={i}
                          onClick={() => navigate(`article/${c.articleId}`)}
                        >
                          <Link2 size={14} />
                          {c.quote}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {results.length > 0 && (
                <button
                  className="text-button request-again"
                  onClick={() => void request().catch((e) => setError(e.message))}
                >
                  まだ足りないことを質問に残す
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="ask-aside">
          <div className="note-heading">
            <MessageCircle size={20} />
            <h2>次に確かめたいこと</h2>
          </div>
          <p>
            答えが見つからない質問も、
            <br />
            工房の大切な知識の種です。
          </p>
          {data.requests.filter((r) => r.status === 'open').length === 0 ? (
            <div className="small-empty">
              <CircleHelp size={25} />
              <p>残した質問がここに並びます。</p>
            </div>
          ) : (
            data.requests
              .filter((r) => r.status === 'open')
              .map((request) => (
                <div className="request-card" key={request.id}>
                  <h3>{request.text}</h3>
                  <div>
                    <span>{formatDate(request.createdAt)}</span>
                    <button
                      className="text-button"
                      onClick={() =>
                        void mutate((d) => ({
                          ...d,
                          requests: d.requests.map((r) =>
                            r.id === request.id ? { ...r, status: 'resolved' } : r,
                          ),
                        }))
                          .then(() => toast('質問を解決済みにしました'))
                          .catch((e) => setError(e.message))
                      }
                    >
                      <CheckCircle2 size={14} />
                      解決した
                    </button>
                  </div>
                </div>
              ))
          )}
          <div className="search-principle">
            <ShieldCheck size={19} />
            <p>
              作業条件は、記録の現場によって異なります。判断に使う前に、原文と映像を確かめられます。
            </p>
          </div>
        </aside>
      </div>
      {source && <EvidenceViewer evidence={source} close={() => setSource(null)} />}
    </>
  );
}
