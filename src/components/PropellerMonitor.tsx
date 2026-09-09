import { useEffect, useId, useRef, useState } from 'react';
import { GripHorizontal, Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import { clampMonitor, type PropellerStep } from '../domain/propellerWiki';

const blade = 'M 56 154 C 86 110 184 87 319 111 L 322 131 C 220 126 144 144 73 179 Z';
/** An authored schematic, not footage or a dimensionally accurate manufacturing model. */
function ProcessDiagram({ step, progress }: { step: PropellerStep; progress: number }) {
  const unique = useId().replace(/:/g, '');
  const t = (1 - Math.cos(progress * Math.PI)) / 2;
  const spread = (1 - t) * 44;
  const scene = step.scene;
  return (
    <svg viewBox="0 0 380 230" role="img" aria-label={`${step.title}の位置関係を示す模式図`}>
      <defs>
        <pattern id={`grid${unique}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#ffffff0c" strokeWidth="1" />
        </pattern>
        <linearGradient id={`skin${unique}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#cedce4" />
          <stop offset="1" stopColor="#6e92a7" />
        </linearGradient>
      </defs>
      <rect width="380" height="230" fill={`url(#grid${unique})`} />
      <ellipse cx="188" cy="191" rx="147" ry="14" fill="#09131d" opacity=".55" />
      {scene === 'spinner' ? (
        <g>
          <path
            d="M 122 165 Q 126 68 190 40 Q 254 68 258 165 Q 190 197 122 165"
            fill="#233d50"
            stroke="#7394a9"
            strokeWidth="2"
          />
          <path
            d="M 124 162 Q 128 67 190 38 Q 252 67 256 162 Q 190 186 124 162"
            fill={`url(#skin${unique})`}
            opacity=".9"
            transform={`translate(${spread * 0.6} ${-spread * 0.45})`}
          />
          <path d="M 190 40 L 190 175" stroke="#d9a953" strokeDasharray="5 5" />
        </g>
      ) : scene === 'inspect' || scene === 'overview' ? (
        <g transform="translate(190 113)">
          <g transform="rotate(-20)">
            <path
              d="M 4 -7 C 40 -37 104 -43 147 -32 L 148 -17 C 90 -9 50 13 8 10 Z"
              fill={`url(#skin${unique})`}
              stroke="#bdd6e5"
            />
            <path
              d="M 4 -7 C 40 -37 104 -43 147 -32 L 148 -17 C 90 -9 50 13 8 10 Z"
              fill={`url(#skin${unique})`}
              stroke="#bdd6e5"
              transform="rotate(180)"
            />
          </g>
          <circle r="23" fill="#314e64" stroke="#e7c480" strokeWidth="2" />
          {[0, 1, 2, 3].map((n) => (
            <circle
              key={n}
              cx={Math.cos((n * Math.PI) / 2) * 13}
              cy={Math.sin((n * Math.PI) / 2) * 13}
              r="3"
              fill={n === Math.min(3, Math.floor(t * 4)) ? '#f1c577' : '#8aabbf'}
            />
          ))}
          <circle
            r={31 + t * 12}
            fill="none"
            stroke="#dfb66b"
            opacity={1 - t * 0.7}
            strokeDasharray="4 5"
          />
          <path d="M 23 20 L 61 58 L 116 58" fill="none" stroke="#c3d5df" />
          <text x="65" y="75" fill="#c3d5df" fontSize="11">
            確認箇所
          </text>
        </g>
      ) : (
        <g>
          <path
            d={blade}
            transform="translate(0 13)"
            fill="#203b4e"
            stroke="#617f94"
            strokeWidth="2"
          />
          {(scene === 'mould' || scene === 'laminate' || scene === 'vacuum') && (
            <path
              d="M 43 157 Q 142 68 336 106 L 343 151 Q 164 126 61 199 Z"
              fill="#315268"
              stroke="#8da9bb"
              strokeWidth="1.5"
            />
          )}
          <path
            d={blade}
            fill={`url(#skin${unique})`}
            stroke="#c4dce9"
            strokeWidth="1.5"
            transform={scene === 'mould' ? `translate(0 ${-spread})` : undefined}
          />
          {(scene === 'core' || scene === 'bond') && (
            <>
              <path
                d="M 82 151 Q 178 109 295 119 L 295 132 Q 179 128 88 166 Z"
                fill="#c6a974"
                stroke="#ead4a3"
                transform={`translate(0 ${-spread * 0.45})`}
              />
              <path
                d="M 95 150 L 292 123"
                stroke="#334454"
                strokeWidth="7"
                transform={`translate(0 ${-spread * 0.45})`}
              />
              <path
                d={blade}
                fill={`url(#skin${unique})`}
                opacity=".8"
                stroke="#c4dce9"
                transform={`translate(0 ${-spread - 14})`}
              />
            </>
          )}
          {scene === 'laminate' &&
            [1, 2, 3].map((layer) => (
              <path
                key={layer}
                d={blade}
                fill={layer === 2 ? '#c7a56a' : '#7c9fae'}
                opacity=".75"
                stroke="#cee0e7"
                strokeDasharray="4 2"
                transform={`translate(0 ${-layer * (spread * 0.43 + 6)})`}
              />
            ))}
          {scene === 'vacuum' && (
            <>
              <path
                d={`M 37 185 Q 37 ${46 + t * 77} 140 ${49 + t * 44} Q 277 ${35 + t * 60} 342 151 L 346 171`}
                fill="#6ebbd333"
                stroke="#8dccdf"
                strokeWidth="2"
              />
              <path
                d="M 329 143 L 351 125 L 359 125"
                fill="none"
                stroke="#dbb66b"
                strokeWidth="4"
              />
              {[0, 1, 2].map((n) => (
                <path
                  key={n}
                  d={`M ${102 + n * 81} 52 v ${10 + t * 15} l -4 -5 m 4 5 l 4 -5`}
                  fill="none"
                  stroke="#d1ebef"
                />
              ))}
            </>
          )}
          {scene === 'finish' && (
            <g transform={`translate(${68 + t * 231} ${137 - Math.sin(t * Math.PI) * 27})`}>
              <ellipse rx="20" ry="12" fill="#e9bd6340" stroke="#edc981" strokeDasharray="3 3" />
              <rect
                x="-12"
                y="-21"
                width="24"
                height="10"
                rx="3"
                fill="#dfb66b"
                transform="rotate(-16)"
              />
              <path d="M 0 -28 L 0 -48" stroke="#d7e1e8" strokeDasharray="3 3" />
            </g>
          )}
        </g>
      )}
      <text x="15" y="217" fill="#a9c0ce" fontSize="10" letterSpacing="2">
        PROPELLER / PROCESS STUDY
      </text>
      <text x="365" y="217" textAnchor="end" fill="#a9c0ce" fontSize="10">
        模式図
      </text>
    </svg>
  );
}

export function PropellerMonitor({
  step,
  index,
  count,
}: {
  step: PropellerStep;
  index: number;
  count: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem('baton-monitor-minimized') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('baton-monitor-minimized', String(minimized));
    } catch {
      /* UI preference only. */
    }
  }, [minimized]);
  const [playing, setPlaying] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const setTime = (time: number) => {
    progressRef.current = time;
    setProgress(time);
  };

  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
  }, [step.id, step.title]);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => {
      if (preference.matches) setPlaying(false);
    };
    preference.addEventListener('change', reduce);
    return () => preference.removeEventListener('change', reduce);
  }, []);
  useEffect(() => {
    if (!playing || minimized) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) {
        progressRef.current = (progressRef.current + Math.min(now - previous, 80) / 8000) % 1;
        setProgress(progressRef.current);
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, minimized]);
  useEffect(() => {
    const clamp = () => {
      const bounds = box.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition((current) =>
        current
          ? clampMonitor(current.x, current.y, bounds.width, bounds.height, innerWidth, innerHeight)
          : null,
      );
    };
    const observer = new ResizeObserver(clamp);
    if (box.current) observer.observe(box.current);
    window.addEventListener('resize', clamp);
    window.visualViewport?.addEventListener('resize', clamp);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', clamp);
      window.visualViewport?.removeEventListener('resize', clamp);
    };
  }, []);
  const move = (x: number, y: number) => {
    const bounds = box.current?.getBoundingClientRect();
    if (bounds)
      setPosition(clampMonitor(x, y, bounds.width, bounds.height, innerWidth, innerHeight));
  };
  return (
    <aside
      ref={box}
      className={`propeller-monitor ${minimized ? 'is-minimized' : ''}`}
      aria-label="工程解説モニター"
      style={
        position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
      }
    >
      <div className="pm-handle-row">
        <button
          className="pm-handle"
          aria-label="モニターを移動（ドラッグまたは矢印キー）"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const bounds = box.current!.getBoundingClientRect();
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: bounds.left,
              top: bounds.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              move(
                drag.current.left + event.clientX - drag.current.x,
                drag.current.top + event.clientY - drag.current.y,
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [-24, 0],
              ArrowRight: [24, 0],
              ArrowUp: [0, -24],
              ArrowDown: [0, 24],
            };
            if (!delta[event.key]) return;
            event.preventDefault();
            const bounds = box.current!.getBoundingClientRect();
            move(bounds.left + delta[event.key][0], bounds.top + delta[event.key][1]);
          }}
        >
          <GripHorizontal size={17} />
          <span>工程モニター</span>
          <span className="pm-live-dot" />
        </button>
        <button
          className="pm-icon"
          aria-label="モニターを定位置に戻す"
          onClick={() => setPosition(null)}
        >
          <RotateCcw size={15} />
        </button>
        <button
          className="pm-icon"
          aria-label={minimized ? 'モニターを展開' : 'モニターを最小化'}
          onClick={() => setMinimized((value) => !value)}
        >
          {minimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
      </div>
      {!minimized && (
        <>
          <div className="pm-reading">
            <span>
              READING {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
            <span>スクロール連動</span>
          </div>
          <h2>{step.title}</h2>
          <ProcessDiagram step={step} progress={progress} />
          <div className="pm-labels">
            {step.labels.map((label, i) => (
              <span
                key={label}
                className={Math.min(2, Math.floor(progress * 3)) === i ? 'active' : ''}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="pm-controls">
            <button
              className="pm-icon"
              aria-label={playing ? '解説アニメーションを一時停止' : '解説アニメーションを再生'}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <input
              aria-label="解説アニメーションの再生位置"
              type="range"
              min="0"
              max="1000"
              value={Math.round(progress * 1000)}
              onChange={(event) => {
                setPlaying(false);
                setTime(Number(event.target.value) / 1000);
              }}
            />
            <span>{Math.min(8, Math.floor(progress * 8))} / 8s</span>
          </div>
          <p className="pm-disclaimer">位置関係の概念図 · 寸法・施工条件は表しません</p>
        </>
      )}
    </aside>
  );
}
