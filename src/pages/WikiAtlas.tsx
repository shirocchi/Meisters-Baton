import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Box,
  Camera,
  ChevronRight,
  Expand,
  FileText,
  History,
  Image,
  Pencil,
  Search,
} from 'lucide-react';
import { useBaton } from '../state';
import { useWiki } from '../wikiState';
import { searchWiki, wikiRoute } from '../domain/growiWiki';
import type { Recording } from '../domain/types';
import type { WorkshopMedia } from '../domain/wikiWorkshop';
import { Badge, Modal, PageTitle } from '../components/ui';
import { WikiEditor } from '../components/WikiEditor';
import { WikiHistory } from '../components/WikiHistory';
import { PendingRecord, RecordTile } from '../components/WikiOverview';
import { RecordingEvidence } from '../components/WikiMedia';
import { AtlasModel } from '../components/atlas/AtlasModel';
import { Asset, WikiContent } from './GrowiWiki';
import '../styles-wiki-atlas.css';

export function WikiAtlasPage({ stageId }: { stageId: string }) {
  const wiki = useWiki();
  const { auth, data, navigate } = useBaton();
  const [visual, setVisual] = useState<'model' | 'photo'>('model');
  const [modal, setModal] = useState<'search' | 'sources' | 'history' | 'model' | 'records' | null>(
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [evidence, setEvidence] = useState<{ recording: Recording; time: number }>();
  const stageNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = stageNav.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && current) nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 12;
    const heading = new URLSearchParams(location.hash.split('?')[1]).get('heading');
    const target =
      heading &&
      Array.from(document.querySelectorAll<HTMLElement>('.atlas-copy [data-wiki-heading]')).find(
        (e) => e.id === heading,
      );
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stageId]);
  const atlas = wiki.archive?.atlas;
  const stage = atlas?.stages.find((s) => s.id === stageId) ?? atlas?.stages[0];
  const page = wiki.pages.find((p) => p.id === stage?.pageId);
  if (!auth || !atlas || !stage || !page) return <p role="status">技術Wikiを読み込んでいます…</p>;
  const assets = wiki.pages.flatMap((p) => p.attachments);
  const modelAsset = assets.find((a) => a.id === atlas.modelAssetId);
  const photo = assets.find((a) => a.id === stage.photoId);
  const edit = wiki.edits.find((e) => e.page_id === page.id);
  const recordings = [
    ...new Map(
      [...data.recordings, ...(edit?.events.map((e) => e.recording) ?? [])].map((r) => [r.id, r]),
    ).values(),
  ];
  const openEvidence = (id: string, time: number) => {
    const recording = recordings.find((r) => r.id === id);
    if (recording) setEvidence({ recording, time });
  };
  const render = (body: string, media: WorkshopMedia[] = edit?.media ?? []) => (
    <WikiContent
      page={{ ...page, body }}
      pages={wiki.pages}
      assets={assets}
      token={auth.token}
      media={media}
      recordings={recordings}
      onEvidence={openEvidence}
    />
  );
  const model = modelAsset ? (
    <AtlasModel asset={modelAsset} token={auth.token} kind={stage.model} local={stage.local} />
  ) : (
    <p className="atlas-loading">模型の準備ができていません。本文と実写真をご覧ください。</p>
  );
  const index = atlas.stages.indexOf(stage);
  const related = stage.related
    .map((id) => atlas.stages.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const results = searchWiki(
    wiki.pages.filter((p) => !p.unavailable && !p.isEmpty),
    query,
  );
  return (
    <div className="wiki-atlas">
      <PageTitle title="技術Wiki">
        <button className="button" onClick={() => setModal('search')}>
          <Search size={17} />
          Wikiを検索
        </button>
        <button className="button primary" onClick={() => navigate('#capture')}>
          <Camera size={17} />
          作業を記録
        </button>
      </PageTitle>
      <div className="atlas-context">
        <div>
          <Badge tone="green">26代の製作方法</Badge>
          <span>Meister · プロペラ班</span>
        </div>
        <a href={wikiRoute(wiki.archive?.home?.id ?? 'home')}>
          <BookOpen size={15} />
          これまでのWiki
          <ChevronRight size={15} />
        </a>
      </div>
      <nav className="atlas-stages" ref={stageNav} aria-label="プロペラ製作の工程">
        {atlas.stages.map((s) => (
          <a
            key={s.id}
            href={`#library/atlas/${s.id}`}
            aria-current={s.id === stage.id ? 'page' : undefined}
          >
            <span>{s.number}</span>
            {s.short}
          </a>
        ))}
      </nav>
      {wiki.editError && (
        <p className="error-banner" role="alert">
          {wiki.editError}
        </p>
      )}
      <div className="atlas-layout">
        <aside className="atlas-visual" aria-label="工程を目で見る">
          <div className="atlas-visual-bar">
            <div className="atlas-segment" aria-label="表示する資料">
              <button aria-pressed={visual === 'model'} onClick={() => setVisual('model')}>
                <Box size={16} />
                動かして見る
              </button>
              <button aria-pressed={visual === 'photo'} onClick={() => setVisual('photo')}>
                <Image size={16} />
                実写真
              </button>
            </div>
            {visual === 'model' && (
              <button
                className="icon-button"
                aria-label="模型を大きく表示"
                onClick={() => setModal('model')}
              >
                <Expand size={17} />
              </button>
            )}
          </div>
          <div className="atlas-visual-body">
            {visual === 'model' ? (
              modal !== 'model' && model
            ) : (
              <figure>
                {photo && <Asset asset={photo} token={auth.token} inline />}
                <figcaption>{stage.photoCaption}</figcaption>
              </figure>
            )}
          </div>
          <button className="atlas-source-link" onClick={() => setModal('sources')}>
            <FileText size={16} />
            この工程の製作記録を読む
            <ChevronRight size={16} />
          </button>
        </aside>
        <article className="atlas-copy">
          <div className="atlas-article-meta">
            <span>CHAPTER {stage.number}</span>
            <button className="text-button" onClick={() => setModal('history')}>
              <History size={15} />
              更新履歴
            </button>
          </div>
          <h2>{page.title}</h2>
          <div className="atlas-author">
            {page.author} · {page.updatedAt.slice(0, 10).replaceAll('-', '.')}
          </div>
          <div className="gw-markdown">
            <WikiContent
              page={page}
              pages={wiki.pages}
              assets={assets}
              token={auth.token}
              media={edit?.media}
              recordings={recordings}
              onEvidence={openEvidence}
              onEditSection={setEditing}
            />
          </div>
          <div className="atlas-article-actions">
            <button className="button" onClick={() => setEditing('')}>
              <Pencil size={16} />
              本文を編集
            </button>
            <button className="button" onClick={() => setModal('records')}>
              <Camera size={16} />
              記録をつなぐ{wiki.pending.length > 0 && <Badge>{wiki.pending.length}</Badge>}
            </button>
          </div>
          <div className="atlas-next">
            {index > 0 && (
              <a href={`#library/atlas/${atlas.stages[index - 1].id}`}>
                ← {atlas.stages[index - 1].short}
              </a>
            )}
            {index < atlas.stages.length - 1 && (
              <a href={`#library/atlas/${atlas.stages[index + 1].id}`}>
                次は、{atlas.stages[index + 1].short}
                <ArrowRight size={17} />
              </a>
            )}
          </div>
        </article>
      </div>
      {related.length > 0 && (
        <section className="atlas-related">
          <h2>つながる工程</h2>
          <div>
            {related.map((s) => {
              const image = assets.find((a) => a.id === s.photoId);
              return (
                <div className="atlas-related-card" key={s.id}>
                  {image && <Asset asset={image} token={auth.token} inline />}
                  <a href={`#library/atlas/${s.id}`}>
                    <span>
                      {s.number} · {s.short}
                    </span>
                    <ArrowRight size={17} />
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {modal === 'search' && (
        <Modal title="Wikiを検索" close={() => setModal(null)} wide>
          <label className="atlas-search">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Wiki全文検索"
              placeholder="工程・部材・気になった言葉"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="muted" role="status">
            26代の製作方法と、これまでのWikiから {results.length} 件
          </p>
          <div className="atlas-results">
            {results.slice(0, 40).map((p) => (
              <a href={wikiRoute(p.id)} onClick={() => setModal(null)} key={p.id}>
                <strong>{p.title}</strong>
                <small>{p.path}</small>
                <p>{p.body.replace(/[#*\[\]]/g, '').slice(0, 115)}…</p>
              </a>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'sources' && (
        <Modal title={`${stage.short}の製作記録`} close={() => setModal(null)} wide>
          <div className="atlas-source-records">
            {stage.sources.map((id) => {
              const source = wiki.pages.find((p) => p.id === id);
              return (
                source && (
                  <section key={id}>
                    <h3>{source.title}</h3>
                    <div className="gw-markdown">
                      <WikiContent
                        page={source}
                        pages={wiki.pages}
                        assets={assets}
                        token={auth.token}
                      />
                    </div>
                  </section>
                )
              );
            })}
          </div>
          {!stage.sources.length && <p>製作記録はこれから追加できます。</p>}
        </Modal>
      )}
      {modal === 'history' && (
        <Modal title="このページの更新履歴" close={() => setModal(null)} wide>
          <WikiHistory page={page} render={render} />
        </Modal>
      )}
      {modal === 'model' && (
        <Modal
          title={stage.model === 'mold' ? '雄型から雌型へ' : 'ブレードの構造'}
          close={() => setModal(null)}
          wide
        >
          {model}
        </Modal>
      )}
      {modal === 'records' && (
        <Modal title="この工程に記録をつなぐ" close={() => setModal(null)} wide>
          <p>撮影・インポートした作業を解析し、工程の本文に残します。</p>
          <button className="button primary" onClick={() => navigate('#capture')}>
            <Camera size={17} />
            新しく作業を記録する
          </button>
          {wiki.pending.length > 0 ? (
            wiki.pending.map((r) => (
              <PendingRecord
                recording={r}
                pages={[page, ...wiki.pages.filter((p) => p.id !== page.id)]}
                key={r.id}
              />
            ))
          ) : (
            <p>反映待ちの記録はありません。</p>
          )}
          {!!edit?.events.length && (
            <>
              <h3>このページに反映された記録</h3>
              <div className="ww-record-grid">
                {edit.events.map((e) => (
                  <RecordTile
                    key={e.recordingId}
                    recording={e.recording}
                    onOpen={() => setEvidence({ recording: e.recording, time: 0 })}
                  />
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
      {editing !== null && (
        <WikiEditor
          page={page}
          version={edit?.version ?? 0}
          initialSection={editing}
          close={() => setEditing(null)}
          render={render}
        />
      )}
      {evidence && (
        <RecordingEvidence
          recording={evidence.recording}
          time={evidence.time}
          close={() => setEvidence(undefined)}
        />
      )}
    </div>
  );
}
