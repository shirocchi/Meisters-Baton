import { aircraftJourney } from './aircraftJourney';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { aircraftGeometry, type AircraftView, type ContextPart } from './aircraftGeometry';
import {
  createAircraftRenderer,
  type AircraftCamera,
  type AircraftRenderer,
  type ProjectedPoint,
} from './aircraftRenderer';
import { teachingModel } from './teachingModel';
import './aircraft-context.css';

const VIEWS: { id: AircraftView; label: string; title: string; explanation: string }[] = [
  {
    id: 'aircraft',
    label: '1 機体全体',
    title: '主翼の前方にある、機首のプロペラ',
    explanation:
      '長く左右へ延びるのが主翼です。今回つくるのは、操縦席より高い位置の軸に付くプロペラ。主翼と区別して、その場所を見つけましょう。',
  },
  {
    id: 'propeller',
    label: '2 プロペラ',
    title: '中心の軸から、二本のブレードへ',
    explanation:
      '機体前方の同じプロペラへ近づきました。軸から互いに反対側へ延びる一本ずつの羽根を、ブレードと呼びます。次はその一本を取り出して見ます。',
  },
  {
    id: 'blade',
    label: '3 ブレード',
    title: '根元から先端へ、幅と向きが変わる',
    explanation:
      '同じ模型の一本を横向きにして拡大しています。根元（軸側）と先端をラベルで確かめましょう。根元側の管は外皮に隠れています。「外皮を開く」で、その内側へ何が取り付くかを見ます。',
  },
  {
    id: 'section',
    label: '4 断面と内部',
    title: '二つの外皮の間に、ウェブが立つ',
    explanation:
      'ブレードの途中を短く切り出した説明模型です。外皮そのものの薄い三層と、二つの外皮の間に立つウェブを見分けます。underを開いても内部部材はupper側に残ります。',
  },
];
const PARTS: Record<ContextPart, { name: string; color: string; explanation: string }> = {
  propeller: {
    name: '今回のプロペラ',
    color: '#486057',
    explanation:
      '機首の軸に付く二枚の羽根です。この本では、その一本を構成する二つの外皮と内部部材を扱います。',
  },
  wing: {
    name: '主翼',
    color: '#849786',
    explanation:
      '胴体から左右へ長く延びる翼です。機首のプロペラとは別の部位で、この本の製作対象には含めません。',
  },
  cabin: {
    name: '操縦席と胴体',
    color: '#879c90',
    explanation:
      '写真に合わせ、細い胴体パイプより下に操縦席を置いています。主翼根元とプロペラ軸は、そのパイプに近い高さにあります。',
  },
  tail: {
    name: '尾翼',
    color: '#859d88',
    explanation:
      '細い胴体パイプの後方にある翼です。上下に延びる垂直尾翼と、左右に延びる水平尾翼を見分けます。',
  },
  upper: {
    name: 'upper 外皮',
    color: '#486057',
    explanation:
      '内部部材を先に取り付ける側の外皮です。図では外側の繊維の層、木の芯、内側の繊維の層を色で分けています。部材名は画面の上下が変わっても同じです。',
  },
  under: {
    name: 'under 外皮',
    color: '#81998c',
    explanation:
      'upperへかぶせるもう一方の外皮です。内側のフランジも一緒に動きます。開く距離は見分けるためのもので、実際の接着隙間ではありません。',
  },
  web: {
    name: 'ウェブ',
    color: '#d6b477',
    explanation:
      '二つの外皮の間へ立つ板状の部材です。下端はupper側、上端はかぶせるunder側のフランジに接します。外皮の中に挟む木の芯とは、位置も形も違います。',
  },
  flange: {
    name: 'フランジ',
    color: '#79573d',
    explanation:
      '外皮の内側を長手方向へ通る補強部です。繊維の束と、その上に重ねる細い布を模式的に示しています。upper側とunder側のそれぞれにあります。',
  },
  spar: {
    name: 'ペラスパー',
    color: '#435967',
    explanation:
      'ブレードの根元側にある管状の内部部材です。桁リブを介して外皮へ取り付けます。管の穴と、外皮への取付け部分を見比べましょう。',
  },
  ribs: {
    name: '桁リブ',
    color: '#b8c9c3',
    explanation:
      '根元の管と外皮をつなぐ部品です。この模型では役割を見分ける輪郭に簡略化しています。作業後に外す治具と違い、製品の内部に残ります。',
  },
};
const viewParts: Record<AircraftView, ContextPart[]> = {
  aircraft: ['propeller', 'wing', 'cabin', 'tail'],
  propeller: ['propeller'],
  blade: ['upper', 'under', 'web', 'flange', 'spar', 'ribs'],
  section: ['upper', 'under', 'web', 'flange'],
};
const angles: Record<AircraftView, [number, number]> = {
  aircraft: [-55, 21],
  propeller: [24, 8],
  blade: [20, 36],
  section: [55, 28],
};

export function AircraftContext3D({
  initialView = 'aircraft',
  readingView,
  readingTime,
  initialPart,
  initialCamera,
  onCameraChange,
}: {
  initialView?: AircraftView;
  readingView?: AircraftView;
  readingTime?: number;
  initialPart?: 'upper' | 'under' | 'web' | 'flange' | 'spar';
  initialCamera?: AircraftCamera;
  onCameraChange?: (camera: AircraftCamera) => void;
}) {
  const startView = initialCamera?.view ?? initialView;
  const [view, setView] = useState<AircraftView>(startView);
  const [selected, setSelected] = useState<ContextPart | null>(
    initialCamera
      ? initialCamera.selected
      : initialPart && viewParts[startView].includes(initialPart)
        ? initialPart
        : startView === 'section'
          ? 'web'
          : startView === 'aircraft' || startView === 'propeller'
            ? 'propeller'
            : null,
  );
  const [yaw, setYaw] = useState(initialCamera?.yaw ?? angles[startView][0]);
  const [pitch, setPitch] = useState(initialCamera?.pitch ?? angles[startView][1]);
  const [zoom, setZoom] = useState(initialCamera?.zoom ?? 1);
  const [opening, setOpening] = useState(
    initialCamera?.opening ?? (startView === 'section' ? 0.75 : 0),
  );
  const [rotation, setRotation] = useState(initialCamera?.rotation ?? 0);
  const [spinning, setSpinning] = useState(false);
  const [following, setFollowing] = useState(readingTime !== undefined);
  useEffect(() => {
    if (readingTime !== undefined) setFollowing(true);
  }, [readingTime]);
  useEffect(() => {
    if (!readingView) return;
    setView(readingView);
    setYaw(angles[readingView][0]);
    setPitch(angles[readingView][1]);
    setZoom(1);
    setOpening(readingView === 'section' ? 0.75 : 0);
    setSelected(
      readingView === 'section' ? 'web' : readingView === 'blade' ? 'upper' : 'propeller',
    );
    setSpinning(false);
  }, [readingView]);
  const [error, setError] = useState('');
  const [point, setPoint] = useState<ProjectedPoint | null>(null);
  const [landmarks, setLandmarks] = useState<Record<string, ProjectedPoint>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<AircraftRenderer | null>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const id = useId();
  const geometry = useMemo(() => aircraftGeometry(teachingModel()), []);
  const camera = useMemo<AircraftCamera>(
    () => ({
      view,
      yaw,
      pitch,
      zoom,
      opening,
      rotation,
      selected,
      journeyTime: following ? readingTime : undefined,
    }),
    [view, yaw, pitch, zoom, opening, rotation, selected, following, readingTime],
  );
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const sourceView = VIEWS.find((item) => item.id === view)!;
  const current =
    following && view === 'section'
      ? {
          ...sourceView,
          title: '同じブレードの外皮を開き、内部を見る',
          explanation:
            '機体から追ってきた同じ一本のブレードです。under側の外皮だけが離れ、ウェブ・ペラスパー・桁リブはupper側に残ります。スクロールを戻すと、外皮が閉じて機体全体へ戻ります。',
        }
      : following && view === 'blade'
        ? {
            ...sourceView,
            explanation:
              '同じプロペラの一本へ近づいています。軸に近い側が根元、遠い側が先端です。このまま読み進めると外皮が開き、内側の部材が見えてきます。',
          }
        : sourceView;
  const displayedOpening =
    following && readingTime !== undefined ? aircraftJourney(readingTime).opening : opening;
  const close = view === 'blade' || view === 'section';
  const next = VIEWS[VIEWS.findIndex((item) => item.id === view) + 1];
  useEffect(() => {
    try {
      renderer.current = createAircraftRenderer(
        canvas.current!,
        geometry,
        (nextPoint, nextLandmarks) => {
          setLandmarks((previous) =>
            JSON.stringify(previous) === JSON.stringify(nextLandmarks) ? previous : nextLandmarks,
          );
          setPoint((previous) =>
            previous?.x === nextPoint?.x && previous?.y === nextPoint?.y ? previous : nextPoint,
          );
        },
      );
      renderer.current.draw(cameraRef.current);
      setError('');
    } catch {
      setError('この環境では3Dを表示できません。下の部材名と説明で位置関係を確認できます。');
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [geometry]);
  const renderedTime = useRef(readingTime ?? 0);
  useEffect(() => {
    if (camera.journeyTime === undefined) {
      renderer.current?.draw(camera);
      return;
    }
    const target = camera.journeyTime;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      renderedTime.current = reduced.matches
        ? target
        : renderedTime.current + (target - renderedTime.current) * (1 - Math.exp(-dt / 100));
      if (Math.abs(renderedTime.current - target) < 0.005) renderedTime.current = target;
      renderer.current?.draw({ ...camera, journeyTime: renderedTime.current });
      if (renderedTime.current !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [camera]);
  useEffect(() => {
    onCameraChange?.(camera);
  }, [camera, onCameraChange]);
  useEffect(() => {
    if (!spinning) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) {
      setSpinning(false);
      return;
    }
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last) setRotation((value) => (value + Math.min(now - last, 60) * 0.0007) % (Math.PI * 2));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const stop = () => {
      if (reduced.matches) setSpinning(false);
    };
    const hidden = () => {
      if (document.hidden) setSpinning(false);
    };
    reduced.addEventListener('change', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [spinning]);
  function changeView(nextView: AircraftView) {
    setSpinning(false);
    setView(nextView);
    setYaw(angles[nextView][0]);
    setPitch(angles[nextView][1]);
    setZoom(1);
    setRotation(0);
    setOpening(nextView === 'section' ? 0.75 : 0);
    setSelected(
      nextView === 'section'
        ? 'web'
        : nextView === 'aircraft' || nextView === 'propeller'
          ? 'propeller'
          : null,
    );
  }
  function reset() {
    setYaw(angles[view][0]);
    setPitch(angles[view][1]);
    setZoom(1);
  }
  return (
    <section
      className="book-aircraft-context"
      aria-label="機体全体から内部構造を見る3D"
      data-aircraft-view={view}
      data-journey-time={following ? readingTime?.toFixed(3) : undefined}
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest('button, input, canvas')) setFollowing(false);
      }}
      onKeyDownCapture={(event) => {
        if (['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
          setFollowing(false);
      }}
    >
      <nav className="aircraft-levels" aria-label="見る範囲">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => changeView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="aircraft-introduction">
        <h3>{current.title}</h3>
        <p>{current.explanation}</p>
      </div>
      {view === 'section' && !following && (
        <div className="aircraft-section-locator">
          <svg
            viewBox="0 0 420 66"
            role="img"
            aria-label="一本のブレードの途中から短い範囲を切り出して、下の断面模型で見ています。位置と長さは説明用です。"
          >
            <path
              d="M14 39Q50 12 154 17Q300 20 399 31Q268 44 149 49Q52 52 14 45Z"
              fill="#9aaf9e"
              stroke="#536d56"
            />
            <path d="M228 20V45M276 23V41" stroke="#9b6535" strokeWidth="2" strokeDasharray="4 3" />
            <path d="M228 20L276 23V41L228 45Z" fill="#d8a56c" />
            <text x="16" y="64" fontSize="13" fill="#405640">
              根元
            </text>
            <text x="375" y="64" fontSize="13" fill="#405640">
              先端
            </text>
            <text x="253" y="13" textAnchor="middle" fontSize="13" fill="#714c27">
              この区間を拡大 ↓
            </text>
          </svg>
        </div>
      )}
      <div className="aircraft-canvas-wrap">
        <canvas
          ref={canvas}
          role="img"
          tabIndex={0}
          aria-label={`${current.title}。ドラッグまたは矢印キーで回転します。部材は下のボタンから選べます。`}
          onPointerDown={(event) => {
            setSpinning(false);
            drag.current = { x: event.clientX, y: event.clientY, yaw, pitch };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setYaw(
              Math.max(
                -180,
                Math.min(180, drag.current.yaw + (event.clientX - drag.current.x) * 0.4),
              ),
            );
            setPitch(
              Math.max(
                -85,
                Math.min(85, drag.current.pitch - (event.clientY - drag.current.y) * 0.35),
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            setSpinning(false);
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              setYaw((value) =>
                Math.max(-180, Math.min(180, value + (event.key === 'ArrowLeft' ? -5 : 5))),
              );
            else
              setPitch((value) =>
                Math.max(-85, Math.min(85, value + (event.key === 'ArrowDown' ? -5 : 5))),
              );
          }}
        />
        {view !== 'aircraft' &&
          selected &&
          point &&
          point.x > 0 &&
          point.x < 100 &&
          point.y > 0 &&
          point.y < 100 && (
            <div
              className="aircraft-selection-marker"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-hidden="true"
            >
              <span />
              {PARTS[selected].name}
            </div>
          )}
        {view === 'aircraft' && Object.keys(landmarks).length > 0 && (
          <div className="aircraft-landmarks" aria-label="全機の位置を示す注記">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {(
                [
                  ['wing', 72, 13],
                  ['tail', 13, 27],
                  ['cabin', 37, 84],
                  ['propeller', 80, 78],
                ] as const
              ).map(([key, x, y]) => (
                <g key={key}>
                  <line x1={landmarks[key]?.x} y1={landmarks[key]?.y} x2={x} y2={y} />
                  <circle cx={landmarks[key]?.x} cy={landmarks[key]?.y} r=".65" />
                </g>
              ))}
              <path
                d={`M${landmarks.propeller?.x} ${landmarks.propeller?.y}L${landmarks.front?.x} ${landmarks.front?.y}`}
                strokeDasharray="1 1"
              />
            </svg>
            <span style={{ left: '72%', top: '13%' }} data-selected={selected === 'wing'}>
              主翼
            </span>
            <span style={{ left: '13%', top: '27%' }} data-selected={selected === 'tail'}>
              尾翼
            </span>
            <span style={{ left: '37%', top: '84%' }} data-selected={selected === 'cabin'}>
              操縦席
            </span>
            <span style={{ left: '80%', top: '78%' }} data-selected={selected === 'propeller'}>
              プロペラ
            </span>
            <span
              className="aircraft-front-note"
              style={{ left: `${landmarks.front?.x}%`, top: `${landmarks.front?.y}%` }}
            >
              前方
            </span>
          </div>
        )}
        {following && landmarks.web && (
          <div className="aircraft-journey-labels" aria-label="開いたブレードの部材">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {(
                [
                  ['under', 18, 24],
                  ['upper', 80, 18],
                  ['web', 80, 54],
                  ['spar', 18, 84],
                ] as const
              ).map(([part, x, y]) => (
                <g key={part}>
                  <line x1={landmarks[part]?.x} y1={landmarks[part]?.y} x2={x} y2={y} />
                  <circle cx={landmarks[part]?.x} cy={landmarks[part]?.y} r=".7" />
                </g>
              ))}
            </svg>
            <span style={{ left: '18%', top: '24%' }}>under 外皮</span>
            <span style={{ left: '80%', top: '18%' }}>upper 外皮</span>
            <span style={{ left: '80%', top: '54%' }}>ウェブ</span>
            <span style={{ left: '18%', top: '84%' }}>ペラスパー・桁リブ</span>
          </div>
        )}
        {view === 'blade' && !following && landmarks.root && landmarks.tip && (
          <div className="aircraft-blade-ends" aria-label="ブレードの根元と先端">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line
                x1={landmarks.root.x}
                y1={landmarks.root.y}
                x2={landmarks.root.x}
                y2={Math.min(85, landmarks.root.y + 17)}
              />
              <line
                x1={landmarks.tip.x}
                y1={landmarks.tip.y}
                x2={landmarks.tip.x}
                y2={Math.min(85, landmarks.tip.y + 17)}
              />
            </svg>
            <span
              style={{
                left: `${Math.max(16, Math.min(84, landmarks.root.x))}%`,
                top: `${Math.min(85, landmarks.root.y + 17)}%`,
              }}
            >
              根元（軸側）
            </span>
            <span
              style={{
                left: `${Math.max(12, Math.min(88, landmarks.tip.x))}%`,
                top: `${Math.min(85, landmarks.tip.y + 17)}%`,
              }}
            >
              先端
            </span>
          </div>
        )}
        {view === 'blade' && !following && (
          <span className="aircraft-canvas-note">同じ一本を、横向きに拡大</span>
        )}
        {view === 'section' && !following && (
          <span className="aircraft-canvas-note">短く切り出した断面の説明模型</span>
        )}
        {error && (
          <p className="aircraft-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="aircraft-part-buttons" role="group" aria-label="部材を選んで位置と役割を見る">
        {viewParts[view].map((part) => (
          <button
            key={part}
            type="button"
            aria-pressed={selected === part}
            onClick={() => setSelected((currentPart) => (currentPart === part ? null : part))}
          >
            <span style={{ background: PARTS[part].color }} aria-hidden="true" />
            {PARTS[part].name}
          </button>
        ))}
        {selected && (
          <button type="button" onClick={() => setSelected(null)}>
            全体を濃く表示
          </button>
        )}
      </div>
      {close ? (
        <div className="aircraft-opening">
          <label htmlFor={`${id}-open`}>
            underを開く <output>{Math.round(displayedOpening * 100)}%</output>
            <input
              id={`${id}-open`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={displayedOpening}
              onChange={(event) => setOpening(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => setOpening((value) => (value > 0 ? 0 : 0.85))}>
            {opening > 0 ? '外皮を閉じる' : '外皮を開く'}
          </button>
        </div>
      ) : (
        <div className="aircraft-camera-actions">
          <button
            type="button"
            aria-pressed={spinning}
            onClick={() => {
              if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
                setRotation((value) => value + Math.PI / 2);
              else setSpinning((value) => !value);
            }}
          >
            {spinning ? 'プロペラを止める' : 'プロペラの回転を見る'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSpinning(false);
              setRotation((value) => value + Math.PI / 2);
            }}
          >
            1/4回転ずつ見る
          </button>
        </div>
      )}
      <p className="aircraft-part-explanation" aria-live="polite">
        {selected
          ? PARTS[selected].explanation
          : '部材名を選ぶと、相手の部材を薄くし、選んだ場所を見やすく表示します。'}
      </p>
      <details className="aircraft-fine-controls">
        <summary>視点を細かく調整</summary>
        <div className="aircraft-camera-actions" aria-label="視点の操作">
          <button type="button" onClick={reset}>
            視点を戻す
          </button>
          <button
            type="button"
            onClick={() => {
              setYaw(0);
              setPitch(view === 'section' ? 85 : 0);
            }}
          >
            正面から
          </button>
          <button
            type="button"
            onClick={() => {
              setYaw(90);
              setPitch(12);
            }}
          >
            横から
          </button>
          <button
            type="button"
            aria-label="模型を縮小"
            disabled={zoom <= 0.7}
            onClick={() => setZoom((v) => Math.max(0.7, v - 0.15))}
          >
            −
          </button>
          <button
            type="button"
            aria-label="模型を拡大"
            disabled={zoom >= 1.7}
            onClick={() => setZoom((v) => Math.min(1.7, v + 0.15))}
          >
            ＋
          </button>
        </div>
        <div className="aircraft-sliders">
          <label htmlFor={`${id}-yaw`}>
            左右に回す
            <input
              id={`${id}-yaw`}
              type="range"
              min="-180"
              max="180"
              step="1"
              value={yaw}
              onChange={(event) => setYaw(Number(event.target.value))}
            />
          </label>
          <label htmlFor={`${id}-pitch`}>
            上下に回す
            <input
              id={`${id}-pitch`}
              type="range"
              min="-85"
              max="85"
              step="1"
              value={pitch}
              onChange={(event) => setPitch(Number(event.target.value))}
            />
          </label>
        </div>
      </details>
      {next && (
        <button className="aircraft-next" type="button" onClick={() => changeView(next.id)}>
          {next.label.replace(/^\d /, '')}へ近づく →
        </button>
      )}
      <p className="aircraft-provenance">
        写真の配置を参照した説明模型です。全機の寸法、翼型、材料の厚さ、開く距離、回転は実測値や製作条件を示しません。
      </p>
    </section>
  );
}
