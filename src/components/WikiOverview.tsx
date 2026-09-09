import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Camera, Check, Clock3, Layers, Link2, Play, Sparkles } from 'lucide-react';
import { useWiki } from '../wikiState';
import { useBaton } from '../state';
import { matchRecording } from '../domain/wikiWorkshop';
import { wikiRoute, type WikiPage, type WikiAsset } from '../domain/growiWiki';
import type { Recording } from '../domain/types';

const stages = [
  ['01', '型をつくる', '雄型・雌型、表面の仕上げ', /雄型|雌型/],
  ['02', '外皮を積層する', '繊維の向き、樹脂、真空引き', /外皮|積層/],
  ['03', '内部を組む', 'コア材、スパー、ウェブ', /コア|ウェブ|スパー|ロハセル/],
  ['04', '貼り合わせる', '位置決め、接着、圧締', /貼り合わせ|接着/],
  ['05', '仕上げる', '研磨、塗装、外形の調整', /塗装|仕上げ/],
  ['06', '確かめる', '組立、バランス、試験の記録', /ハブ|試験|バランス/],
] as const;
export function RecordTile({ recording, onOpen }: { recording: Recording; onOpen: () => void }) {
  return (
    <button className="ww-record-tile" onClick={onOpen}>
      <span className="ww-record-image">
        {recording.frames[0] ? (
          <img src={recording.frames[0].dataUrl} alt="" />
        ) : (
          <Camera size={30} />
        )}
        <span className="ww-play">
          <Play size={18} />
        </span>
      </span>
      <strong>{recording.title}</strong>
      <small>
        {recording.author} · {recording.createdAt.slice(0, 10)}
      </small>
      <span>
        {recording.answers.length}件の判断 · {recording.analysis?.segments.length ?? 0}つの場面
      </span>
    </button>
  );
}
function PendingRecord({ recording, pages }: { recording: Recording; pages: WikiPage[] }) {
  const wiki = useWiki();
  const candidates = matchRecording(recording, pages);
  const [selected, setSelected] = useState(candidates[0]?.page.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="ww-pending-row">
      <div>
        <strong>{recording.title}</strong>
        <small>工程を選ぶと、その本文へ取り込みます。</small>
      </div>
      <select
        aria-label={`${recording.title}の反映先`}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">工程を選択</option>
        {pages
          .filter((p) => p.id !== 'home' && !p.id.startsWith('diary-') && !p.unavailable)
          .map((p) => (
            <option value={p.id} key={p.id}>
              {p.path}
            </option>
          ))}
      </select>
      <button
        className="button"
        disabled={!selected || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const page = pages.find((p) => p.id === selected)!;
            await wiki.integrate(
              recording,
              page,
              candidates.find((c) => c.page.id === selected)?.heading,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Link2 size={16} />
        {busy ? '反映中…' : '本文へ反映'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function WikiOverview({
  openRecording,
  renderAsset,
}: {
  openRecording: (r: Recording) => void;
  renderAsset?: (asset: WikiAsset) => ReactNode;
}) {
  const wiki = useWiki();
  const { data, navigate } = useBaton();
  const source = wiki.pages.filter((p) => p.id !== 'home' && !p.id.startsWith('diary-'));
  const visualPages = source
    .map((page) => ({
      page,
      asset: page.attachments
        .filter((a) => a.sha256 && a.contentType.startsWith('image/') && a.bytes <= 2 * 1024 * 1024)
        .sort((a, b) => a.bytes - b.bytes)[0],
    }))
    .filter((item) => item.asset)
    .slice(0, 4);
  const events = wiki.edits
    .flatMap((e) => e.events.map((event) => ({ ...event, pageId: e.page_id })))
    .sort((a, b) => b.integratedAt.localeCompare(a.integratedAt));
  const recent = [...new Map(events.map((e) => [e.recordingId, e])).values()].slice(0, 6);
  return (
    <section className="ww-overview">
      <div className="ww-hero">
        <div>
          <p className="ww-eyebrow">手順の、その先にある判断まで。</p>
          <h2>手元を見て、技をつなぐ。</h2>
          <p>
            マニュアル、製作日記、新しい作業記録。
            <br />
            同じ工程の中で、一緒に確かめられます。
          </p>
        </div>
        <button className="button primary" onClick={() => navigate('capture')}>
          <Camera size={19} />
          作業を撮って残す
        </button>
      </div>
      <div className="ww-metrics">
        <span>
          <Layers size={17} />
          {source.filter((p) => !p.unavailable).length}ページの技術資料
        </span>
        <span>
          <Check size={17} />
          {events.length}件の記録を本文へ反映
        </span>
        <span>
          <Clock3 size={17} />
          変更は履歴から戻せます
        </span>
      </div>
      <div className="ww-section-heading">
        <h3>工程から探す</h3>
        <span>知りたい作業へ、まっすぐ。</span>
      </div>
      <div className="ww-stage-grid">
        {stages.map(([number, title, description, pattern]) => {
          const matches = source
            .filter((p) => pattern.test(p.title) && !p.unavailable && !p.isEmpty)
            .sort((a, b) => a.path.length - b.path.length);
          const target = matches[0];
          return (
            <a
              key={number}
              className="ww-stage"
              href={
                target
                  ? wikiRoute(target.id)
                  : `#library/propeller/${['mould-finishing', 'skin-lamination', 'core-fitting', 'blade-bonding', 'paint-masking', 'rotation-safety'][Number(number) - 1]}`
              }
            >
              <span>
                {number}
                <ArrowUpRight size={18} />
              </span>
              <strong>{title}</strong>
              <small>{description}</small>
              <em>{matches.length ? `${matches.length}ページ` : '工程ガイドへ'}</em>
            </a>
          );
        })}
      </div>
      {!!visualPages.length && renderAsset && (
        <>
          <div className="ww-section-heading">
            <h3>写真から、工程へ</h3>
            <span>細部を拡大して、元の手順へ戻れます。</span>
          </div>
          <div className="ww-source-visuals">
            {visualPages.map(({ page, asset }) => (
              <figure key={page.id}>
                {renderAsset(asset)}
                <figcaption>
                  <a href={wikiRoute(page.id)}>
                    {page.title}
                    <ArrowUpRight size={15} />
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className="ww-section-heading">
            <h3>新しく加わった、現場の知恵</h3>
            <span>映像の場面と判断を一緒に。</span>
          </div>
          <div className="ww-record-grid">
            {recent.map((e) => (
              <RecordTile
                key={e.recordingId}
                recording={data.recordings.find((r) => r.id === e.recordingId) ?? e.recording}
                onOpen={() =>
                  openRecording(data.recordings.find((r) => r.id === e.recordingId) ?? e.recording)
                }
              />
            ))}
          </div>
        </>
      )}
      {wiki.pending.length > 0 && (
        <section className="ww-inbox">
          <h3>
            <Sparkles size={18} />
            工程の確認が必要な記録 <small>{wiki.pending.length}</small>
          </h3>
          <p>
            関連がはっきりした記録は自動反映されます。候補を絞れない記録はここで工程を指定できます。
          </p>
          {wiki.pending.map((r) => (
            <PendingRecord key={r.id} recording={r} pages={source} />
          ))}
        </section>
      )}
      <div className="ww-section-heading ww-manual-heading">
        <h3>カーボンモノコックマニュアル</h3>
        <span>製法の違いと、工程の全体像</span>
      </div>
    </section>
  );
}
