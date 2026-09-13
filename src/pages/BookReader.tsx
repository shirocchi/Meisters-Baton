import { SceneTransition } from '../components/book/SceneTransition';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Camera,
  ChevronRight,
  List,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  StickyNote,
  Search,
  Home,
} from 'lucide-react';
import { useBaton } from '../state';
import { useWiki } from '../wikiState';
import { Modal } from '../components/ui';
import { RecordingEvidence } from '../components/WikiMedia';
import { AtlasModel } from '../components/atlas/AtlasModel';
import { ProcessVisual, PROCESS_STEPS } from '../components/atlas/ProcessVisual';
import { CoreDetail } from '../components/book/CoreDetail';
import { TransferDetail } from '../components/book/TransferDetail';
import { MaskingTransferFigure } from '../components/book/MaskingTransferFigure';
import { RehearsalFigure } from '../components/book/RehearsalFigure';
import { BookContents } from '../components/book/BookContents';
import { SINGLE_STEP_SPAN } from '../components/atlas/processGeometry';
import type { AircraftView } from '../components/book/aircraftGeometry';
import { AircraftContext3D } from '../components/book/AircraftContext3D';
import { BookSearch } from '../components/book/BookSearch';
import type { AircraftCamera } from '../components/book/aircraftRenderer';
import { teachingModel } from '../components/book/teachingModel';
import { useBookSources } from '../components/book/useBookSources';
import { DiaryNotes } from '../components/book/DiaryNotes';
import { diaryNotesFor } from '../domain/bookDiaryNotes';
import { LESSONS } from '../domain/textbook';
import { BOOK_GLOSSARY, type BookTerm } from '../domain/bookGlossary';
import { CHAPTER_NARRATIVES, SECTION_NARRATIVES } from '../domain/bookNarrative';
import { BookLanguage, BookText, BookDictionary } from '../components/book/BookLanguage';
import { BOOK_REHEARSALS, type BookRehearsalStageId } from '../domain/bookRehearsals';
import type { BookPractice, BookMedia } from '../domain/bookSources';
import '../styles-book-reader.css';

const CHAPTERS = [
  { id: 'overview', title: 'はじめに', subtitle: '一本のブレードができるまで' },
  { id: 'mold', title: '型をつくる', subtitle: '断面をつなぎ、製品の面を写す' },
  { id: 'skin', title: '外皮を積層する', subtitle: 'クロスと芯材で、薄く強い殻をつくる' },
  { id: 'flange', title: 'フランジをつくる', subtitle: '外皮に力を伝える部分をつくる' },
  { id: 'web', title: '内部部材を組む', subtitle: '治具で位置を決め、内部の構造をつくる' },
  { id: 'join', title: '貼り合わせる', subtitle: '内側を確かめ、ふたつの外皮を閉じる' },
  { id: 'finish', title: '仕上げる', subtitle: '先端と表面を整えて、次の確認へ' },
];
const pad = (n: number) => String(n).padStart(2, '0');
const pagesFor = (id: string) => (id === 'overview' ? 2 : LESSONS[id].groups.length + 2);
function pageName(chapter: number, page: number) {
  const id = CHAPTERS[chapter].id;
  return id === 'overview'
    ? page
      ? '製作の道すじ'
      : 'つくるものを知る'
    : page === 0
      ? 'この章を読む前に'
      : page === pagesFor(id) - 1
        ? '章末演習・次の工程へ渡す'
        : LESSONS[id].groups[page - 1].title;
}
function firstStep(chapter: number, page: number) {
  const id = CHAPTERS[chapter].id;
  if (page === pagesFor(id) - 1)
    return (
      ({ mold: 3, skin: 6, flange: 2, web: 4, join: 3, finish: 3 } as Record<string, number>)[id] ??
      0
    );
  return LESSONS[id]?.groups[page - 1]?.from ?? 0;
}
function firstMode(chapter: number, page: number): 'process' | 'model' | 'exercise' {
  if (!chapter) return 'model';
  if (
    ['mold', 'skin', 'finish'].includes(CHAPTERS[chapter].id) &&
    page === pagesFor(CHAPTERS[chapter].id) - 1
  )
    return 'exercise';
  return 'process';
}
function parseLocation() {
  const parts = location.hash.split('/');
  const chapter = Math.max(
    0,
    CHAPTERS.findIndex((c) => c.id === parts[2]),
  );
  const page = Math.max(
    0,
    Math.min(pagesFor(CHAPTERS[chapter].id) - 1, Math.trunc(Number(parts[3])) || 0),
  );
  return { chapter, page };
}
function Photo({
  media,
  onOpen,
  figure,
}: {
  media: BookMedia;
  onOpen: (m: BookMedia) => void;
  figure: string;
}) {
  const video = /\.(mp4|mov)$/i.test(media.filename);
  if (!media.localUrl) return null;
  return (
    <figure className="book-photo">
      {video ? (
        <video controls preload="metadata" src={media.localUrl} aria-label={media.caption} />
      ) : (
        <button onClick={() => onOpen(media)} aria-label={`写真を拡大：${media.caption}`}>
          <img loading="lazy" src={media.localUrl} alt={media.caption} />
          <span>
            <Maximize2 size={14} />
            拡大
          </span>
        </button>
      )}
      <figcaption>
        <span>
          {figure}　{media.date?.slice(0, 10)} の製作記録
        </span>
        <BookText>{media.caption}</BookText>
        <a href={media.url} target="_blank" rel="noreferrer">
          Discordの原記録 <ChevronRight size={12} />
        </a>
      </figcaption>
    </figure>
  );
}
const hasDetail = (item: BookPractice) =>
  item.stepId === 'core' ||
  item.id === 'skin-film-transfer' ||
  item.id === 'finish-masking-transfer';
function Practice({
  item,
  onOpen,
  chapter,
  figureStart,
}: {
  item: BookPractice;
  onOpen: (m: BookMedia) => void;
  chapter: number;
  figureStart: number;
}) {
  const figure = (offset: number) => `図${chapter}-${figureStart + offset}`;
  return (
    <section
      className="book-practice"
      data-source-id={item.id}
      id={`book-record-${item.id}`}
      tabIndex={-1}
    >
      <div className="book-source-date">
        {item.sources[0]?.date?.slice(0, 10)} の記録から
        {item.status === 'prototype' && ' · 試作時の記録'}
        {item.status === 'proposal' && ' · 検討段階'}
      </div>
      <h4>{item.title}</h4>
      {item.id === 'flange-transfer-under' && (
        <p className="book-source-gap">
          この節は、upperのフランジと内部部材を作った後に戻って読む実例です。初めて順に進める場合は、upper側を仕上げて
          <a href="#library/textbook/web/0">第4章でウェブを取り付け</a>
          、実際の上端ができてからunderの位置を写します。
        </p>
      )}
      {item.paragraphs.map((p, i) => (
        <p key={i}>
          <BookText>{p}</BookText>
        </p>
      ))}
      {item.stepId === 'core' && <CoreDetail figure={figure(0)} />}
      {item.id === 'skin-film-transfer' && (
        <TransferDetail figure={figure(0)} photoFigure={figure(1)} />
      )}
      {item.id === 'finish-masking-transfer' && <MaskingTransferFigure figure={figure(0)} />}
      {item.media.slice(0, 2).map((media, i) => (
        <Photo
          key={`${item.id}-${i}`}
          media={media}
          onOpen={onOpen}
          figure={figure(i + Number(hasDetail(item)))}
        />
      ))}
      {item.actions.length > 0 && (
        <ol className="book-actions">
          {item.actions.map((action, i) => (
            <li key={i}>
              <BookText>{action}</BookText>
            </li>
          ))}
        </ol>
      )}
      {item.check && (
        <p className="book-observation">
          <strong>確かめるところ</strong>
          <BookText>{item.check}</BookText>
        </p>
      )}
      <div className="book-citations">
        {item.sources.map((source) => (
          <a key={source.messageId} href={source.url} target="_blank" rel="noreferrer">
            記録 {source.date.slice(0, 10)} ↗
          </a>
        ))}
      </div>
    </section>
  );
}

type SectionCursor = { chapter: number; page: number };
type VisualMode = 'process' | 'model' | 'aircraft' | 'exercise';
const SECTIONS = CHAPTERS.flatMap((c, chapter) =>
  Array.from({ length: pagesFor(c.id) }, (_, page) => ({ chapter, page })),
);
const sectionId = (chapter: number, page: number) => `book-section-${CHAPTERS[chapter].id}-${page}`;
const BookSection = memo(function BookSection({
  cursor,
  source,
  open,
  lookupTerm,
  setPhoto,
  setExplanationFigure,
  onVisual,
  onNotes,
  navigate,
}: {
  cursor: SectionCursor;
  source: ReturnType<typeof useBookSources>;
  open: (chapter: number, page?: number) => void;
  lookupTerm: (term: BookTerm | 'index') => void;
  setPhoto: (media: BookMedia) => void;
  setExplanationFigure: (figure: 'core' | 'transfer' | 'masking') => void;
  onVisual: (
    chapter: number,
    page: number,
    step: number,
    mode: VisualMode,
    enlarge?: boolean,
  ) => void;
  onNotes: (chapter: number) => void;
  navigate: ReturnType<typeof useBaton>['navigate'];
}) {
  const current = CHAPTERS[cursor.chapter];
  const lesson = LESSONS[current.id];
  const rehearsal = BOOK_REHEARSALS[current.id as BookRehearsalStageId];
  const pageCount = pagesFor(current.id);
  const group = lesson?.groups[cursor.page - 1];
  const chapterNarrative = CHAPTER_NARRATIVES[current.id];
  const narrative = SECTION_NARRATIVES[current.id]?.[cursor.page - 1];
  const isEnd = !!lesson && cursor.page === pageCount - 1;
  const practices = [...(source.data?.stages[current.id]?.practice ?? [])].sort(
    (a, b) =>
      (PROCESS_STEPS[current.id]?.findIndex((s) => s.id === a.stepId) ?? -1) -
      (PROCESS_STEPS[current.id]?.findIndex((s) => s.id === b.stepId) ?? -1),
  );
  const narrativeRecords = (narrative?.sourceIds ?? []).flatMap((id) => {
    for (const [stageId, data] of Object.entries(source.data?.stages ?? {})) {
      const item = data.practice.find((practice) => practice.id === id);
      if (!item) continue;
      const chapter = CHAPTERS.findIndex((c) => c.id === stageId);
      const index = PROCESS_STEPS[stageId]?.findIndex((step) => step.id === item.stepId) ?? -1;
      const page =
        (LESSONS[stageId]?.groups.findIndex((group) => index >= group.from && index <= group.to) ??
          -1) + 1;
      if (chapter >= 0 && page > 0) return [{ item, chapter, page, stageId }];
    }
    return [];
  });
  const figureStart = (item: BookPractice) =>
    1 +
    practices
      .slice(0, practices.indexOf(item))
      .reduce((sum, p) => sum + p.media.length + Number(hasDetail(p)), 0);
  const matched = (index: number) =>
    practices.filter((p) => p.stepId === PROCESS_STEPS[current.id][index].id);
  const remaining = group
    ? practices.filter((p) => !PROCESS_STEPS[current.id].some((s) => s.id === p.stepId))
    : [];

  const currentTitle = pageName(cursor.chapter, cursor.page);
  const leafPage =
    SECTIONS.findIndex((s) => s.chapter === cursor.chapter && s.page === cursor.page) + 1;
  const diaryNotes = diaryNotesFor(current.id);
  return (
    <section
      className="book-story-section"
      id={sectionId(cursor.chapter, cursor.page)}
      data-chapter={cursor.chapter}
      data-page={cursor.page}
      aria-label={`${current.title}・${currentTitle}`}
    >
      <div className="book-running">
        <span>{cursor.chapter ? `第${cursor.chapter}章　${current.title}` : '序章　はじめに'}</span>
        <span>{pad(leafPage)}</span>
      </div>
      <header className="book-page-heading">
        <h2 tabIndex={-1} className="book-section-title">
          {currentTitle}
        </h2>
      </header>
      <div className="book-page-menu">
        <strong>
          <List size={17} />
          この節で学ぶこと
        </strong>
        <p>
          {cursor.page === 0
            ? current.subtitle
            : (group?.purpose ??
              (isEnd
                ? '学んだ手順を試し、次の工程へ進む前に理解を確かめます。'
                : '型から仕上げまで、製作の工程とつながりを確認します。'))}
        </p>
      </div>
      {current.id === 'overview' ? (
        cursor.page === 0 ? (
          <>
            <p className="book-lead" data-view="aircraft">
              人力飛行機は、人がペダルをこぐ力で飛ぶ飛行機です。スクロールすると図も動きます。まずは3D表示で、機体全体を眺めてみましょう。大きく横に広がるのが「主翼」、後ろにある小さな翼が「尾翼」です。人が乗る操縦席は、主翼の中央付近の下にあります。
            </p>
            <p data-view="propeller">
              機体の前端にあたる「機首」にあるのが、回転して機体を前へ進める「プロペラ」です。この教材では、このプロペラの製作を学びます。読み進めると、同じ機体のプロペラへカメラが近づきます。二本の羽根の位置を確かめてから、その一本へ目を向けましょう。
            </p>
            <h2>ペダルの力は、どうやって前に進む力になるのでしょうか</h2>
            <p>
              <BookText>
                自転車なら、ペダルを踏んだ力を車輪から地面へ伝えて前に進みます。人力飛行機では、その力でプロペラを回し、空気を後ろへ送ります。空気を後ろへ押すと、プロペラも空気から前向きに押されます。これが機体を前へ進める力になります。
              </BookText>
            </p>
            <p data-view="blade">
              <BookText>
                プロペラの羽根の一本を「ブレード」と呼びます。ブレードは、回転しながら空気に働きかける翼です。この教材で追うのは、26代がそのブレードを形にしていった製作記録。形をどう写し、内側をどう組み、二つの面をどう閉じたのかを、写真と動く模型でたどります。
              </BookText>
            </p>
            <p className="book-citations">
              <a
                href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/propellers/"
                target="_blank"
                rel="noreferrer"
              >
                プロペラが進む力を生む仕組み · NASA ↗
              </a>
            </p>
            <h2 data-view="section">完成すると、内側は見えなくなる</h2>
            <p>
              <BookText>
                手のひらで包むように、二つの薄い殻を合わせるところを想像してください。この殻が、空気に触れる外形をつくる「外皮」です。26代の記録では、二つの側を
                upper（アッパー）と
                under（アンダー）と呼び分けます。模型を回すと画面の上下は変わるので、部材についた名前で区別します。
              </BookText>
            </p>
            <p>
              <BookText>
                殻の内側には、細長い支えや板状の部材が入ります。その名前を今すべて覚える必要はありません。まず確かめたいのは、支えがどの面に接しているか。そして、殻を閉じた後では、その接触を直接見られなくなるということです。
              </BookText>
            </p>
            <p>
              <BookText>
                読み進めると、左の3Dでは同じブレードの外皮が開いていきます。薄い殻と、その間に立つ板を見分けてください。これから読む工程は、内側を見られるうちに部材を組み、接する場所を確かめていく順序でもあります。
              </BookText>
            </p>
            {source.data?.stages.web?.practice
              .find((p) => p.id === 'web-standing')
              ?.media.slice(0, 1)
              .map((m) => (
                <Photo key={m.filename} media={m} onOpen={setPhoto} figure="図0-1" />
              ))}
            {source.data?.stages.web?.practice.find((p) => p.id === 'web-standing')?.media[0]
              ?.localUrl && (
              <>
                <p>
                  <BookText>
                    図0-1では、外皮の中を長く走る板状の支えを見てください。これが、後の章で「ウェブ」と呼ぶ部材です。横向きに並ぶ板は、作業中の位置と向きを保つ道具――「治具」です。製品に残す支えと、作業後に外す道具を、同じ写真で見分けてみましょう。
                  </BookText>
                </p>
              </>
            )}
            <h2>この教材の読み方</h2>
            <p>
              各節は、これから解きたい疑問から始まります。左の図で動きを追い、右の写真で実物を確かめ、最後に自分の言葉で理由を説明してみてください。章末には、紙などを使って位置や順序を試す練習を用意しています。
            </p>
            <p>
              点線の付いた言葉を押すと、その場で意味を読めます。読み方から探すときは、ページ上部の「ことばを調べる」を使ってください。日付のある記述は現場の記録で、試作・補修の例と、学習のための問いは区別しています。
            </p>
            <h2>最初の疑問は、形をどう残すか</h2>
            <p>
              <BookText>
                まだ薄い殻も支えもありません。図面にある形を、実際の材料にどう移せばよいのでしょう。第1章は、製品より先に、その形を繰り返し写すための道具――「型」をつくるところから始まります。
              </BookText>
            </p>
            <p>
              先輩に確認しなければ決められない値は、そのまま未確定と示します。設計計算、工具の習熟、使用前検査はこの本文だけで完結しません。
            </p>
          </>
        ) : (
          <>
            <p className="book-lead">
              型で形を決め、外皮をつくり、内側を組んでから閉じる。前の工程でつくったものが、次の工程の出発点になります。
            </p>
            <ol className="book-roadmap">
              {CHAPTERS.slice(1).map((c, i) => (
                <li key={c.id}>
                  <button onClick={() => open(i + 1)}>
                    <span>{pad(i + 1)}</span>
                    <div>
                      <h2>{c.title}</h2>
                      <p>{CHAPTER_NARRATIVES[c.id].question}</p>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                </li>
              ))}
            </ol>
            <h2>作業の前後を残す</h2>
            <p>
              完成した状態だけでなく、置き方・手元・位置合わせ・迷った点も記録します。写真の説明で判断が分からないときは、実際に作業した人の答えを同じ章へ添えます。
            </p>
          </>
        )
      ) : cursor.page === 0 ? (
        <>
          <section className="book-narrative" data-reading-anchor="intro" tabIndex={-1}>
            <h2>{chapterNarrative.title}</h2>
            {chapterNarrative.paragraphs.map((paragraph, i) => (
              <p key={i} className={i === 0 ? 'book-lead' : undefined}>
                <BookText>{paragraph}</BookText>
              </p>
            ))}
            <p className="book-chapter-question">
              <BookText>{chapterNarrative.question}</BookText>
            </p>
          </section>
          {current.id === 'flange' && (
            <p className="book-reading-order">
              この章は2回使います。
              <strong>
                upperのフランジ → 第4章の内部組立 → この章へ戻ってunderの位置出し・積層
              </strong>
              の順です。underの位置をウェブ上端から写す記録では、先に実際のウェブが必要になります。
            </p>
          )}
          <div className="book-receive">
            <h2>受け取るもの</h2>
            <p>
              <BookText>{lesson.input}</BookText>
            </p>
            <h2>この章の終わりにできるもの</h2>
            <p>
              <BookText>{lesson.output}</BookText>
            </p>
          </div>
          <h2>材料と道具をそろえる</h2>
          <p>
            作業を始める前に、以下の材料と道具を実物と照合します。数量・品番・配合条件は、今回使う図面と材料仕様で確かめます。
          </p>
          <ul>
            {lesson.tools.map((t) => (
              <li key={t}>
                <BookText>{t}</BookText>
              </li>
            ))}
          </ul>
          <h2>この章で使う言葉</h2>
          <p>
            材料名や作業の言葉を、ここでも確かめられます。名前を押すと用途や似た言葉との違いを読めます。
          </p>
          <div className="book-chapter-words">
            {BOOK_GLOSSARY.filter((term) => term.chapter === current.id).map((term) => (
              <button key={term.id} onClick={() => lookupTerm(term)}>
                {term.term}
                <span>{term.short}</span>
              </button>
            ))}
          </div>
          <h2>作業の順序を見渡す</h2>
          <ol className="book-mini-contents">
            {lesson.groups.map((g, i) => (
              <li key={g.title}>
                <button onClick={() => open(cursor.chapter, i + 1)}>
                  <span>
                    {cursor.chapter}.{i + 1}
                  </span>
                  <div>
                    <strong>{g.title}</strong>
                    <p>{g.purpose}</p>
                  </div>
                  <ArrowRight size={15} />
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : isEnd ? (
        <>
          <section className="book-narrative" data-reading-anchor="intro" tabIndex={-1}>
            <h2>章の最初の疑問に戻る</h2>
            <p className="book-chapter-question">
              <BookText>{chapterNarrative.question}</BookText>
            </p>
            <p>
              <BookText>{chapterNarrative.resolved}</BookText>
            </p>
          </section>
          {current.id === 'web' && (
            <p className="book-reading-order">
              under側のフランジ位置をまだ決めていない場合は、
              <a href="#library/textbook/flange/1">
                第3章「underは、実際のウェブ上端から位置を写す」へ戻ります
              </a>
              。位置出し・積層と接触の確認を終えてから、貼り合わせへ進みます。
            </p>
          )}
          {current.id === 'flange' && (
            <div className="book-reading-order">
              <p>どちら側を終えたかで、次に開く章が変わります。</p>
              <button className="book-action" onClick={() => open(4, 0)}>
                upperを終えた → 第4章で内部を組む <ArrowRight size={16} />
              </button>
              <button className="book-action" onClick={() => open(5, 1)}>
                underも終えた → 第5章で仮合わせを確かめる <ArrowRight size={16} />
              </button>
            </div>
          )}
          <section className="book-rehearsal">
            <span className="book-source-date">章末演習 · 学習用に編集した練習</span>
            <h2>{rehearsal.title}</h2>
            <p>
              <BookText>{rehearsal.setup}</BookText>
            </p>
            <button
              className="book-action"
              onClick={() => {
                onVisual(
                  cursor.chapter,
                  cursor.page,
                  firstStep(cursor.chapter, cursor.page),
                  firstMode(cursor.chapter, cursor.page),
                  true,
                );
              }}
            >
              演習で使う図を開く <Maximize2 size={16} />
            </button>
            <ol className="book-actions">
              {rehearsal.actions.map((action) => (
                <li key={action}>
                  <BookText>{action}</BookText>
                </li>
              ))}
            </ol>
            <details className="book-worked-example">
              <summary>手を動かしたら、説明例と比べる</summary>
              <p>
                <BookText>{rehearsal.explanation}</BookText>
              </p>
            </details>
            <p className="book-observation">
              <strong>実物の作業へ進む前に</strong>
              <BookText>{rehearsal.remaining}</BookText>
            </p>
          </section>
          <h2>何を確認して渡すか</h2>
          <ul className="book-completion-list">
            {lesson.finish.map((item) => (
              <li key={item}>
                <BookText>{item}</BookText>
              </li>
            ))}
          </ul>
          <h2>まだ決められない条件</h2>
          <p>
            次の条件は、ここに収録した記録だけでは確定しません。使用する材料・図面・設備と、担当者の判断を照合します。
          </p>
          <ul>
            {lesson.missing.map((item) => (
              <li key={item}>
                <BookText>{item}</BookText>
              </li>
            ))}
          </ul>
          <h2>{current.id === 'finish' ? 'この先の確認へ' : '次の工程につながること'}</h2>
          <p>
            <BookText>{chapterNarrative.next}</BookText>
          </p>
          <h2>次の担当者に伝えること</h2>
          {current.id === 'finish' && (
            <section className="book-final-exercise">
              <h3>本を閉じる前に、実例から3行を書いてみる</h3>
              <p>
                第5章の「{SECTION_NARRATIVES.join[2].title}
                」を開き、前縁の浮きを扱った記録を読み直します。紙に次の3行を書いてから、説明例を開いてください。
              </p>
              <a className="book-action" href="#library/textbook/join/3">
                第5章の補修記録を読み直す ↗
              </a>
              <ol className="book-actions">
                <li>いつ、どの部材の、どこに気になる状態があったか。</li>
                <li>記録の文章が伝えることと、写真から自分で指せることを分けて書く。</li>
                <li>次の担当者が作業を決めるために、まだ確認する必要があることを一つ書く。</li>
              </ol>
              <details className="book-worked-example">
                <summary>3行書いたら、引き継ぎの説明例と比べる</summary>
                <p>
                  <BookText>
                    ①記録では、脱型後のunderの前縁端に、治具と治具の間で浮きが見つかっています。②文章は追加樹脂とテープによる補修を伝え、写真では短いテープで保持した場所を指せます。③この写真だけでは内部の接着状態や補修の最終合否を判断できないため、確認した方法と結果を担当者に聞く必要があります。
                  </BookText>
                </p>
                <p>
                  自分が行っていない作業を「確認した」と書かず、「記録にある事実」「写真から読めること」「まだ分からないこと」に分けられたかを見直します。
                </p>
              </details>
            </section>
          )}

          <p>
            部材の全体写真、確認した位置の拡大、使用した条件、うまくいかなかった点を記録します。未確認の箇所も明記してください。
          </p>
          <button className="book-action" onClick={() => navigate('capture')}>
            <Camera size={17} />
            この工程の作業を記録する
          </button>
        </>
      ) : (
        <>
          <section className="book-narrative" data-reading-anchor="intro" tabIndex={-1}>
            <h2>{narrative.title}</h2>
            {narrative.paragraphs.map((paragraph, i) => (
              <p key={i}>
                <BookText>{paragraph}</BookText>
              </p>
            ))}
            {current.id === 'skin' && cursor.page === 2 && (
              <>
                <p className="book-citations">
                  <a
                    href="https://www.gurit.com/wp-content/uploads/2025/11/Core-brochure_v21_web.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    芯と面材の役割 · Gurit「Sandwich panel engineering theory」↗
                  </a>
                </p>
                <p>
                  <BookText>
                    手元に段ボールの切れ端があれば、切り口を見てみましょう。表の紙、間隔を保つ波形の紙、裏の紙を指し分けます。材料や接着方法は外皮と違いますが、薄い面を離してつなぐ形を、身近な物でも探せます。
                  </BookText>
                </p>
                <p>
                  <BookText>
                    この節のクロスの「±45°」は、根元から先端へ向かう線に対し、繊維が右斜め・左斜めの45度へ走るという読み方です。画面の縦横や型の縁を基準にせず、実物の長手方向を先に指します。
                  </BookText>
                </p>
              </>
            )}
            <p className="book-observe">
              <BookText>{narrative.observe}</BookText>
            </p>
            <button
              className="book-action"
              onClick={() => {
                onVisual(cursor.chapter, cursor.page, narrative.step, 'process');
              }}
            >
              この工程の動きを見る <ArrowLeft size={16} />
            </button>
            {current.id === 'mold' &&
              cursor.page === 2 &&
              practices.find((p) => p.id === 'mold-sand-datum')?.media[0]?.localUrl && (
                <button
                  className="book-action"
                  onClick={() =>
                    setPhoto(practices.find((p) => p.id === 'mold-sand-datum')!.media[0])
                  }
                >
                  色分けした練習図を開く <Maximize2 size={16} />
                </button>
              )}
            {current.id === 'skin' && cursor.page === 2 && (
              <button className="book-action" onClick={() => setExplanationFigure('core')}>
                コアの継ぎ目を比べる図を開く <Maximize2 size={16} />
              </button>
            )}
            {current.id === 'skin' && cursor.page === 1 && (
              <button className="book-action" onClick={() => setExplanationFigure('transfer')}>
                搬送の図と写真を開く <Maximize2 size={16} />
              </button>
            )}
            {current.id === 'finish' && cursor.page === 2 && (
              <button className="book-action" onClick={() => setExplanationFigure('masking')}>
                運ぶテープと残すテープの図を開く <Maximize2 size={16} />
              </button>
            )}
            {narrativeRecords.length > 0 && (
              <div className="book-narrative-records">
                参照する製作記録：
                {narrativeRecords.map(({ item, chapter, page, stageId }) => (
                  <a
                    key={item.id}
                    href={`#library/textbook/${stageId}/${page}`}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      if (chapter !== cursor.chapter || page !== cursor.page) open(chapter, page);
                      requestAnimationFrame(() => {
                        const record = document.getElementById(`book-record-${item.id}`);
                        record?.scrollIntoView({ block: 'start', behavior: 'instant' });
                        record?.focus({ preventScroll: true });
                      });
                    }}
                  >
                    {chapter === cursor.chapter && page === cursor.page
                      ? 'この節'
                      : `第${chapter}章 ${chapter}.${page}`}{' '}
                    · {item.title}
                  </a>
                ))}
              </div>
            )}
          </section>
          {Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from + i).map(
            (index) => (
              <section
                className="book-step"
                key={index}
                data-step={index}
                data-reading-anchor={`step-${index}`}
                tabIndex={-1}
              >
                <div className="book-step-label">
                  <span>手順 {pad(index + 1)}</span>
                  <button
                    onClick={() => {
                      onVisual(cursor.chapter, cursor.page, index, 'process');
                    }}
                  >
                    この動きを図で見る <ArrowLeft size={14} />
                  </button>
                </div>
                <h2>{PROCESS_STEPS[current.id][index].title}</h2>
                {current.id === 'web' && index === 1 && (
                  <p>
                    <BookText>
                      位置を表す r
                      は、前段の部材の太さ（直径）とは別の記号です。この抜粋には測り始める点が明記されていません。部品の端からの距離と決めつけず、図面の基準点と測る方向を担当者と確かめてから使います。
                    </BookText>
                  </p>
                )}
                <p>
                  <BookText>{PROCESS_STEPS[current.id][index].detail}</BookText>
                </p>
                {matched(index).length ? (
                  matched(index).map((item) => (
                    <Practice
                      key={item.id}
                      item={item}
                      onOpen={setPhoto}
                      chapter={cursor.chapter}
                      figureStart={figureStart(item)}
                    />
                  ))
                ) : (
                  <p className="book-source-gap">
                    この操作の手元写真・具体的な判断は、現時点の収録資料では補えていません。下の確認点を作業者と照合します。
                  </p>
                )}
              </section>
            ),
          )}
          {remaining.length > 0 &&
            cursor.page === 1 &&
            remaining.map((item) => (
              <Practice
                key={item.id}
                item={item}
                onOpen={setPhoto}
                chapter={cursor.chapter}
                figureStart={figureStart(item)}
              />
            ))}
          <section
            className="book-understanding"
            data-reading-anchor="review"
            tabIndex={-1}
            key={`${current.id}-${cursor.page}`}
          >
            <h2>ここまでを、自分の言葉で</h2>
            <p>
              <BookText>{narrative.think}</BookText>
            </p>
            <details className="book-worked-example">
              <summary>考えたら、説明と照らし合わせる</summary>
              <p>
                <BookText>{narrative.answer}</BookText>
              </p>
            </details>
            <p className="book-carry">
              <BookText>{narrative.carry}</BookText>
            </p>
          </section>
          <section className="book-stop">
            <h2>次へ進む前に</h2>
            <p>
              <BookText>{group.check}</BookText>
            </p>
            <details>
              <summary>この工程で確認が必要な条件</summary>
              <ul>
                {lesson.missing.map((item) => (
                  <li key={item}>
                    <BookText>{item}</BookText>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
      {source.loading && <p role="status">製作写真を読み込んでいます…</p>}
      {source.error && (
        <p className="book-source-gap">
          製作記録が未接続です。実写真と詳しい観察記録は、資料を接続した環境で読めます。
        </p>
      )}
      {isEnd && <DiaryNotes notes={diaryNotes} />}
      <footer className="book-page-footer">
        <button onClick={() => onNotes(cursor.chapter)}>
          <StickyNote size={15} />
          この章の付箋
        </button>
      </footer>
    </section>
  );
});

export function TextbookPage() {
  const { navigate, auth } = useBaton();
  const wiki = useWiki();
  const source = useBookSources();
  const [cursor, setCursor] = useState(parseLocation);
  const [step, setStep] = useState(() => {
    const initial = parseLocation();
    return firstStep(initial.chapter, initial.page);
  });
  const [mode, setMode] = useState<'process' | 'model' | 'aircraft' | 'exercise'>(() =>
    firstMode(cursor.chapter, cursor.page),
  );
  const [contents, setContents] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const [overviewView, setOverviewView] = useState<AircraftView>('aircraft');
  const [overviewTime, setOverviewTime] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const syncScroll = useRef<() => void>(() => {});
  const activeCursor = useRef(cursor);
  activeCursor.current = cursor;
  const [notesChapter, setNotesChapter] = useState(0);
  const [readingAnchor, setReadingAnchor] = useState('intro');
  const [notes, setNotes] = useState(false);
  const [lookup, setLookup] = useState<BookTerm | 'index' | null>(null);
  const [photo, setPhoto] = useState<BookMedia>();
  const [explanationFigure, setExplanationFigure] = useState<'core' | 'transfer' | 'masking'>();
  const dictionaryOrigin = useRef<{ element: HTMLElement | null; top: number } | null>(null);
  const [recordingId, setRecordingId] = useState<string>();
  const [large, setLarge] = useState(false);
  const aircraftCamera = useRef<{ scope: string; camera: AircraftCamera } | null>(null);
  const readingPosition = useRef<number | null>(null);
  const [font, setFont] = useState(16);
  const [savedPage, setSavedPage] = useState<{ chapter: number; page: number } | null>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('baton-book-bookmark-v1') ?? 'null');
      return value &&
        Number.isInteger(value.chapter) &&
        value.chapter >= 0 &&
        value.chapter < CHAPTERS.length &&
        Number.isInteger(value.page) &&
        value.page >= 0 &&
        value.page < pagesFor(CHAPTERS[value.chapter].id)
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const lookupTerm = useCallback((selection: BookTerm | 'index') => {
    dictionaryOrigin.current = {
      element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      top: window.scrollY,
    };
    setLookup(selection);
  }, []);
  function closeDictionary() {
    setLookup(null);
    const origin = dictionaryOrigin.current;
    requestAnimationFrame(() => {
      origin?.element?.focus({ preventScroll: true });
      if (origin) window.scrollTo({ top: origin.top, behavior: 'instant' });
    });
  }
  const bookmark = savedPage?.chapter === cursor.chapter && savedPage?.page === cursor.page;
  function saveBookmark() {
    const next = bookmark ? null : cursor;
    setSavedPage(next);
    try {
      localStorage.setItem('baton-book-bookmark-v1', JSON.stringify(next));
    } catch {}
  }

  const copy = useRef<HTMLElement>(null);
  const nav = useRef<HTMLDivElement>(null);
  const model = useMemo(teachingModel, []);
  const current = CHAPTERS[cursor.chapter];
  const lesson = LESSONS[current.id];
  const isEnd = !!lesson && cursor.page === pagesFor(current.id) - 1;
  const practices = [...(source.data?.stages[current.id]?.practice ?? [])].sort(
    (a, b) =>
      (PROCESS_STEPS[current.id]?.findIndex((s) => s.id === a.stepId) ?? -1) -
      (PROCESS_STEPS[current.id]?.findIndex((s) => s.id === b.stepId) ?? -1),
  );
  const notesId = CHAPTERS[notesChapter].id;
  const stage = wiki.archive?.atlas?.stages.find((s) => s.id === notesId);
  const assets = wiki.pages.flatMap((p) => p.attachments);
  const modelAsset = assets.find((a) => a.id === wiki.archive?.atlas?.modelAssetId);
  const pageIds = new Set([
    stage?.pageId,
    ...(wiki.archive?.atlas?.details?.filter((d) => d.stageId === notesId).map((d) => d.pageId) ??
      []),
  ]);
  const records = wiki.edits.filter((e) => pageIds.has(e.page_id)).flatMap((e) => e.events);
  const recording = records.find((e) => e.recordingId === recordingId)?.recording;
  const currentTitle = pageName(cursor.chapter, cursor.page);
  const searchEntries = useMemo(
    () =>
      CHAPTERS.flatMap((chapter, chapterIndex) =>
        Array.from({ length: pagesFor(chapter.id) }, (_, page) => {
          const section = SECTION_NARRATIVES[chapter.id]?.[page - 1];
          const introduction = CHAPTER_NARRATIVES[chapter.id];
          const chapterLesson = LESSONS[chapter.id];
          const chapterRehearsal = BOOK_REHEARSALS[chapter.id as BookRehearsalStageId];
          const pageGroup = chapterLesson?.groups[page - 1];
          const pageRecords = (source.data?.stages[chapter.id]?.practice ?? []).filter(
            (practice) => {
              const index =
                PROCESS_STEPS[chapter.id]?.findIndex((item) => item.id === practice.stepId) ?? -1;
              return pageGroup && index >= pageGroup.from && index <= pageGroup.to;
            },
          );
          const explanation =
            page === 0
              ? [
                  ...(introduction?.paragraphs ?? [
                    '人力飛行機は、人がペダルをこぐ力で飛ぶ飛行機です。主翼、尾翼、操縦席、機首のプロペラとブレードの位置や役割を知ります。プロペラは空気を後ろへ押し、空気から前向きに押されます。薄い殻が外皮で、upperとunderを合わせます。閉じると内側が見えなくなるため、組み立てる順序を考えます。',
                  ]),
                  introduction?.question,
                  chapterLesson?.input,
                  chapterLesson?.output,
                  ...(chapterLesson?.tools ?? []),
                  ...(chapterLesson?.before ?? []),
                ].join(' ')
              : section
                ? [
                    section.title,
                    ...section.paragraphs,
                    section.think,
                    section.answer,
                    pageGroup?.purpose,
                    pageGroup?.check,
                    ...(pageGroup
                      ? PROCESS_STEPS[chapter.id]
                          .slice(pageGroup.from, pageGroup.to + 1)
                          .flatMap((item) => [item.title, item.detail])
                      : []),
                    ...pageRecords.flatMap((record) => record.paragraphs),
                  ].join(' ')
                : [
                    chapterRehearsal?.title,
                    chapterRehearsal?.setup,
                    ...(chapterRehearsal?.actions ?? []),
                    chapterRehearsal?.explanation,
                    chapterRehearsal?.remaining,
                    ...(chapterLesson?.finish ?? []),
                    ...(chapterLesson?.missing ?? []),
                    introduction?.next,
                    ...(chapter.id === 'overview'
                      ? CHAPTERS.slice(1).flatMap((item) => [
                          item.title,
                          CHAPTER_NARRATIVES[item.id].question,
                        ])
                      : []),
                  ].join(' ');
          return {
            id: `${chapter.id}-${page}`,
            title: pageName(chapterIndex, page),
            chapterTitle: chapter.title,
            text: explanation,
            chapter: chapterIndex,
            page,
          };
        }),
      ),
    [source.data],
  );
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty(
        '--book-nav-height',
        `${48 + el.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);
  function closeVisual() {
    setLarge(false);
    if (readingPosition.current !== null) {
      const top = readingPosition.current;
      requestAnimationFrame(() => window.scrollTo({ top, behavior: 'instant' }));
      readingPosition.current = null;
    }
  }
  const open = useCallback((chapter: number, page = 0) => {
    setContents(false);
    history.pushState(null, '', `#library/textbook/${CHAPTERS[chapter].id}/${page}`);
    const target = document.getElementById(sectionId(chapter, page));
    if (chapter === 0 && page === 0) window.scrollTo({ top: 0, behavior: 'instant' });
    else target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    requestAnimationFrame(() => {
      target?.querySelector<HTMLElement>('.book-section-title')?.focus({ preventScroll: true });
      syncScroll.current();
    });
  }, []);
  const onVisual = useCallback(
    (chapter: number, page: number, next: number, nextMode: VisualMode, enlarge = false) => {
      setCursor({ chapter, page });
      history.replaceState(null, '', `#library/textbook/${CHAPTERS[chapter].id}/${page}`);
      setStep(next);
      setMode(nextMode);
      if (enlarge || window.matchMedia('(max-width: 767px)').matches) {
        readingPosition.current = window.scrollY;
        setLarge(true);
      }
    },
    [],
  );
  const onNotes = useCallback((chapter: number) => {
    setNotesChapter(chapter);
    setNotes(true);
  }, []);
  // The long article is independent of animation frames: preserve inputs, disclosures and media.
  const sections = useMemo(
    () =>
      SECTIONS.map((section) => (
        <BookSection
          key={sectionId(section.chapter, section.page)}
          cursor={section}
          source={source}
          open={open}
          lookupTerm={lookupTerm}
          setPhoto={setPhoto}
          setExplanationFigure={setExplanationFigure}
          onVisual={onVisual}
          onNotes={onNotes}
          navigate={navigate}
        />
      )),
    [source.data, source.loading, source.error, open, lookupTerm, onVisual, onNotes, navigate],
  );
  useLayoutEffect(() => {
    const before = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = before;
    };
  }, []);
  useLayoutEffect(() => {
    const initial = parseLocation();
    if (initial.chapter === 0 && initial.page === 0) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    document
      .getElementById(sectionId(initial.chapter, initial.page))
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);
  useEffect(() => {
    const restore = () => {
      if (!/^#library(?:\/textbook(?:\/|$)|$)/.test(location.hash)) return;
      const next = parseLocation();
      document
        .getElementById(sectionId(next.chapter, next.page))
        ?.scrollIntoView({ block: 'start', behavior: 'instant' });
      syncScroll.current();
    };
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('hashchange', restore);
      window.removeEventListener('popstate', restore);
    };
  }, []);
  useEffect(() => {
    const root = copy.current;
    if (!root) return;
    let frame = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (
        !/^#library(?:\/textbook(?:\/|$)|$)/.test(location.hash) ||
        document.querySelector('dialog[open], [role="dialog"]')
      )
        return;
      const compact = window.matchMedia('(max-width: 767px)').matches;
      const visualBottom =
        document.querySelector('.book-visual')?.getBoundingClientRect().bottom ?? 0;
      const line = compact ? visualBottom + 28 : Math.min(window.innerHeight * 0.35, 260);
      const blocks = Array.from(root.querySelectorAll<HTMLElement>('.book-story-section'));
      const section =
        blocks.filter((el) => el.getBoundingClientRect().top <= line).at(-1) ?? blocks[0];
      if (!section) return;
      const chapter = Number(section.dataset.chapter),
        page = Number(section.dataset.page);
      const changed =
        activeCursor.current.chapter !== chapter || activeCursor.current.page !== page;
      if (changed) {
        activeCursor.current = { chapter, page };
        setCursor({ chapter, page });
      }
      const hash = `#library/textbook/${CHAPTERS[chapter].id}/${page}`;
      if (location.hash !== hash) history.replaceState(null, '', hash);
      const anchors = Array.from(section.querySelectorAll<HTMLElement>('[data-reading-anchor]'));
      const anchor = anchors.filter((el) => el.getBoundingClientRect().top <= line).at(-1);
      setReadingAnchor(anchor?.dataset.readingAnchor ?? 'intro');
      if (!chapter) {
        const views = Array.from(section.querySelectorAll<HTMLElement>('[data-view]'));
        const viewLine = compact
          ? line
          : 48 + (nav.current?.getBoundingClientRect().height ?? 42) + 40;
        const view = views.filter((el) => el.getBoundingClientRect().top <= viewLine).at(-1)
          ?.dataset.view as AircraftView | undefined;
        setOverviewView(view ?? (page ? 'section' : 'aircraft'));
        const times = [0, 6.5, 11, 12];
        const active = views.filter((el) => el.getBoundingClientRect().top <= viewLine).length - 1;
        if (page) setOverviewTime(18);
        else if (active < 0) setOverviewTime(0);
        else if (reduced.matches && active === 3) setOverviewTime(18);
        else {
          const top = views[active].getBoundingClientRect().top;
          const end = views[active + 1]?.getBoundingClientRect().top ?? top + 500;
          const fraction = reduced.matches
            ? 0
            : Math.max(0, Math.min(1, (viewLine - top) / Math.max(1, end - top)));
          setOverviewTime(
            Math.round(
              ((times[active] ?? 18) +
                ((times[active + 1] ?? 18) - (times[active] ?? 18)) * fraction) *
                1000,
            ) / 1000,
          );
        }
        setMode('model');
      } else {
        const items = Array.from(section.querySelectorAll<HTMLElement>('[data-step]'));
        const seen = items.filter((el) => el.getBoundingClientRect().top <= line).at(-1);
        if (seen) {
          const rect = seen.getBoundingClientRect();
          const phase = reduced.matches
            ? 1
            : Math.max(0, Math.min(1, (line - rect.top) / Math.max(120, rect.height * 0.8)));
          setStep(Number(seen.dataset.step) + (Math.round(phase * 200) / 200) * SINGLE_STEP_SPAN);
          setMode('process');
        } else {
          setStep(firstStep(chapter, page));
          setMode(firstMode(chapter, page));
        }
      }
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(
        Math.min(100, Math.max(0, Math.round((window.scrollY / Math.max(1, height)) * 100))),
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    syncScroll.current = update;
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reduced.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reduced.removeEventListener('change', schedule);
    };
  }, []);
  function showStep(next: number) {
    setContents(false);
    if (large) {
      setStep(next);
      return;
    }
    const chapter = activeCursor.current.chapter;
    const id = CHAPTERS[chapter].id;
    const groupIndex = LESSONS[id]?.groups.findIndex(
      (g) => Math.floor(next) >= g.from && Math.floor(next) <= g.to,
    );
    if (groupIndex === undefined || groupIndex < 0) return;
    const section = document.getElementById(sectionId(chapter, groupIndex + 1));
    const target = section?.querySelector<HTMLElement>(`[data-step="${Math.floor(next)}"]`);
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    target?.focus({ preventScroll: true });
    requestAnimationFrame(() => syncScroll.current());
  }
  const visual =
    mode === 'exercise' ? (
      <RehearsalFigure key={current.id} stage={current.id} />
    ) : mode === 'model' || mode === 'aircraft' || current.id === 'overview' ? (
      <AircraftContext3D
        key={`${current.id}-${mode}`}
        initialCamera={
          aircraftCamera.current?.scope === `${current.id}-${mode}`
            ? aircraftCamera.current.camera
            : undefined
        }
        onCameraChange={(camera) => {
          aircraftCamera.current = { scope: `${current.id}-${mode}`, camera };
        }}
        readingView={current.id === 'overview' ? overviewView : undefined}
        readingTime={current.id === 'overview' ? overviewTime : undefined}
        initialView={
          mode === 'aircraft' || current.id === 'overview'
            ? 'aircraft'
            : ['mold', 'finish'].includes(current.id)
              ? 'blade'
              : 'section'
        }
        initialPart={current.id === 'web' ? 'web' : current.id === 'flange' ? 'flange' : 'upper'}
      />
    ) : auth && modelAsset ? (
      <AtlasModel
        asset={modelAsset}
        token={auth.token}
        kind="blade"
        process={mode === 'process' ? current.id : undefined}
        step={step}
        playback="step"
        onStepChange={showStep}
      />
    ) : (
      <ProcessVisual
        stage={current.id}
        step={step}
        onStepChange={showStep}
        model={model}
        playback="step"
      />
    );
  const contentsNavigation = (
    <BookContents
      chapters={CHAPTERS}
      current={cursor}
      currentAnchor={readingAnchor}
      pageName={pageName}
      pagesFor={pagesFor}
      open={open}
      jump={(index) => showStep(index)}
    />
  );
  return (
    <BookLanguage onTerm={lookupTerm}>
      <div className="book-reader" style={{ '--book-font': `${font}px` } as React.CSSProperties}>
        <header className="book-masthead">
          <div className="book-docs-brand">
            <button aria-label="工房へ戻る" onClick={() => navigate('home')}>
              <Home size={22} />
            </button>
            <strong>
              プロペラ製作ガイド <span>（26代）</span>
            </strong>
          </div>
          <button
            ref={searchTrigger}
            className="book-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="教材を検索"
            aria-haspopup="dialog"
          >
            <Search size={20} />
            <span>検索</span>
          </button>
          <div className="book-tools">
            <button onClick={() => setContents(true)}>
              <List size={17} />
              目次
            </button>
            <button onClick={() => lookupTerm('index')}>
              <BookOpen size={16} />
              ことばを調べる
            </button>
            <button
              aria-label="文字を小さく"
              disabled={font <= 16}
              onClick={() => setFont(font - 1)}
            >
              <Minus size={15} />
            </button>
            <span className="book-font-label" aria-hidden="true">
              あ
            </span>
            <button
              aria-label="文字を大きく"
              disabled={font >= 21}
              onClick={() => setFont(font + 1)}
            >
              <Plus size={15} />
            </button>
            <button aria-pressed={bookmark} onClick={saveBookmark}>
              <Bookmark size={16} />
              {bookmark ? 'しおりを挟みました' : 'しおり'}
            </button>
          </div>
        </header>
        <div className="book-navigation-bar" ref={nav}>
          <span>
            {current.title} <ChevronRight size={14} /> {currentTitle}
          </span>
          <span className="book-scroll-label">本文に合わせて図が動きます · {scrollProgress}%</span>
          <div className="book-reading-progress" style={{ width: `${scrollProgress}%` }} />
        </div>
        <div className="book-layout book-scroll-layout">
          <div className="book-toc-rail">{!contents && contentsNavigation}</div>
          <div className="book-spread">
            <aside className="book-visual" aria-label="工程を目で見る">
              <div className="book-visual-top">
                <span>
                  {current.id === 'overview'
                    ? '機体からブレードの内部へ'
                    : mode === 'process'
                      ? `${current.title} · ${PROCESS_STEPS[current.id][Math.floor(step)]?.title ?? '工程図'}`
                      : `第${cursor.chapter}章の工程図`}
                </span>
                <button
                  aria-label="ビジュアルを拡大"
                  onClick={() => {
                    readingPosition.current = window.scrollY;
                    setLarge(true);
                  }}
                >
                  <Maximize2 size={17} />
                </button>
              </div>
              {current.id !== 'overview' && mode !== 'model' && mode !== 'aircraft' && (
                <button className="book-aircraft-link" onClick={() => setMode('aircraft')}>
                  <svg viewBox="0 0 100 68" aria-hidden="true">
                    <path
                      d="M48 12h5l2 23 37 8v6L55 44v12l10 6v3l-14-3-14 3v-3l10-6V44l-39 5v-6l39-8Z"
                      fill="#b7c5b3"
                    />
                    <path d="M34 10h32" stroke="#b76b31" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="50" cy="10" r="3" fill="#5c694e" />
                  </svg>
                  <span>
                    <small>人力飛行機のどこを作っている？</small>
                    <strong>プロペラのブレード</strong>
                    <span>機体全体から3Dで見る →</span>
                  </span>
                </button>
              )}
              <div className="book-visual-tabs">
                {isEnd && ['mold', 'skin', 'finish'].includes(current.id) && (
                  <button aria-pressed={mode === 'exercise'} onClick={() => setMode('exercise')}>
                    章末演習の図
                  </button>
                )}
                {current.id !== 'overview' && (
                  <button aria-pressed={mode === 'process'} onClick={() => setMode('process')}>
                    工程アニメーション
                  </button>
                )}
                <button
                  aria-pressed={mode === 'model' || mode === 'aircraft'}
                  onClick={() => setMode('model')}
                >
                  機体と部材を3Dで見る
                </button>
              </div>
              <div className="book-visual-stage">
                <SceneTransition
                  scene={`${current.id}-${mode}-${mode === 'process' ? Math.floor(step) : ''}`}
                >
                  {!large && visual}
                </SceneTransition>
              </div>
              {(mode === 'model' || mode === 'aircraft') && current.id !== 'overview' && (
                <p className="book-model-context">
                  「機体全体」から順に拡大すると、いま作っている部材の位置が分かります。作業の手順は「工程アニメーション」で見られます。
                </p>
              )}
              <p className="book-visual-caption">
                {modelAsset && auth
                  ? '製作資料に基づく説明模型'
                  : '構造と動きを理解するための説明模型'}{' '}
                · 寸法や合否を判定する図ではありません
              </p>
              {current.id !== 'overview' && mode === 'process' && (
                <div className="book-look">
                  <span>図で見るポイント</span>
                  <strong>{PROCESS_STEPS[current.id][Math.floor(step)]?.title}</strong>
                  <p>
                    <BookText>{PROCESS_STEPS[current.id][Math.floor(step)]?.detail ?? ''}</BookText>
                  </p>
                </div>
              )}
              <div className="book-visual-foot">
                <span>図と本文を見比べながら読む</span>
                <button
                  onClick={() => {
                    setStep(firstStep(cursor.chapter, cursor.page));
                    setMode(firstMode(cursor.chapter, cursor.page));
                  }}
                >
                  <RotateCcw size={14} />
                  戻す
                </button>
              </div>
            </aside>
            <article className="book-copy" ref={copy} aria-label="教科書の本文">
              <h1 className="book-story-title">一本のブレードができるまで</h1>
              <p className="book-story-intro">
                機体の中での役割から、型づくり、積層、組み立て、仕上げまで。本文をスクロールすると、横の図も同じ工程をたどります。
              </p>
              {sections}
            </article>
          </div>
        </div>
        {lookup && <BookDictionary selection={lookup} select={setLookup} close={closeDictionary} />}
        {searchOpen && (
          <BookSearch
            entries={searchEntries}
            close={() => {
              setSearchOpen(false);
              requestAnimationFrame(() => searchTrigger.current?.focus({ preventScroll: true }));
            }}
            onOpen={(chapter, page) => {
              setSearchOpen(false);
              open(chapter, page);
            }}
          />
        )}
        {contents && (
          <Modal title="プロペラ製作 目次" close={() => setContents(false)} wide>
            <button className="book-action" aria-pressed={bookmark} onClick={saveBookmark}>
              <Bookmark size={16} />
              {bookmark ? 'このページのしおりを外す' : 'このページにしおりを挟む'}
            </button>
            {savedPage && (
              <button
                className="book-action"
                onClick={() => open(savedPage.chapter, savedPage.page)}
              >
                <Bookmark size={16} />
                しおりのページへ {CHAPTERS[savedPage.chapter].title}
              </button>
            )}
            {contentsNavigation}
            <a href="#library/wiki/home">これまでのWikiを開く</a> ·{' '}
            <a href="#library/records">記録から作ったWiki</a>
          </Modal>
        )}
        {explanationFigure && (
          <Modal
            title={
              explanationFigure === 'masking'
                ? '運ぶテープと残すテープ'
                : explanationFigure === 'core'
                  ? 'コアの継ぎ目を比べる'
                  : '支えるフィルムと運ぶクロス'
            }
            close={() => setExplanationFigure(undefined)}
            wide
          >
            {explanationFigure === 'masking' ? (
              <MaskingTransferFigure />
            ) : explanationFigure === 'core' ? (
              <CoreDetail figure="継ぎ目の補足図" />
            ) : (
              <>
                <TransferDetail figure="搬送の補足図" photoFigure="製作写真" />
                {practices
                  .find((p) => p.id === 'skin-film-transfer')
                  ?.media.slice(0, 1)
                  .map((media) => (
                    <Photo key={media.filename} media={media} onOpen={setPhoto} figure="製作写真" />
                  ))}
              </>
            )}
            <button className="book-action" onClick={() => setExplanationFigure(undefined)}>
              <ArrowLeft size={16} />
              本文に戻る
            </button>
          </Modal>
        )}
        {photo && (
          <Modal title={photo.caption} close={() => setPhoto(undefined)} wide>
            <img className="book-enlarged" src={photo.localUrl} alt={photo.caption} />
            <p>{photo.date} の製作記録</p>
            <a href={photo.url} target="_blank" rel="noreferrer">
              Discordの原記録
            </a>
          </Modal>
        )}
        {large && (
          <Modal title="工程を目で見る" close={closeVisual} wide>
            {visual}
            <button className="book-action" onClick={closeVisual}>
              <ArrowLeft size={16} />
              本文に戻る
            </button>
          </Modal>
        )}
        {notes && (
          <Modal title={`${CHAPTERS[notesChapter].title}の付箋`} close={() => setNotes(false)} wide>
            <DiaryNotes notes={diaryNotesFor(CHAPTERS[notesChapter].id)} />
            <h2>追加された作業記録</h2>
            {records.length ? (
              records.map((record) => (
                <button
                  className="book-note"
                  key={record.recordingId}
                  onClick={() => {
                    setNotes(false);
                    setRecordingId(record.recordingId);
                  }}
                >
                  <span>{record.integratedAt.slice(0, 10)}</span>
                  <strong>{record.recording.title}</strong>
                  <ArrowRight size={16} />
                </button>
              ))
            ) : (
              <p>
                この章に新しく追加された記録はありません。製作したときの写真・動画と、判断した理由を添えて残せます。
              </p>
            )}
            <button className="book-action" onClick={() => navigate('capture')}>
              <Camera size={16} />
              作業を記録する
            </button>
          </Modal>
        )}
        {recording && (
          <RecordingEvidence
            recording={recording}
            time={0}
            close={() => setRecordingId(undefined)}
          />
        )}
      </div>
    </BookLanguage>
  );
}
