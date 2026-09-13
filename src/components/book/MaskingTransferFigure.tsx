import { useId, useState } from 'react';

const STEPS = [
  {
    button: '1. 重ねる',
    title: 'C の上に図案 B を並べ、A を重ねる',
    explanation:
      'C は作業台を保護する下敷きです。その上に図案の3片 B1・B2・B3 を並べます。3片にまたがる A は、並びを保って持ち上げるためのテープです。',
    description:
      '作業台の紙に下敷き C があり、その上に図案 B1、B2、B3 が並ぶ。持ち上げ用 A が3片を覆う。右のブレード役の紙には後縁の線がある。',
  },
  {
    button: '2. 持ち上げる',
    title: 'A と B を一緒に持ち上げる',
    explanation:
      'A に3片の B が付いたまま、まとめて持ち上げます。B1・B2・B3 の順番と間隔を見比べましょう。C は運ばず、作業台の紙に残します。',
    description:
      'A と図案 B1、B2、B3 が一緒に浮き、右の紙へ向かう。3片の並びは変わらない。下敷き C は左の作業台に残っている。',
  },
  {
    button: '3. 移して置く',
    title: '後縁の線に対する向きを合わせて置く',
    explanation:
      'ブレード役の紙に描いた後縁の線を見て、A と B を一緒に置きます。この時点では A も B も紙の上です。持ち上げる前と同じ3片の並びになっているか確かめます。',
    description:
      'A と図案 B1、B2、B3 が右のブレード役の紙へ移る。後縁の線に対する向きを合わせて置く。C は左の作業台に残ったまま。',
  },
  {
    button: '4. A だけ外す',
    title: 'B を押さえ、上の A だけを外す',
    explanation:
      '図案の B を紙に残し、上の持ち上げ用 A だけをゆっくり剥がします。B1・B2・B3 の順番と間隔は保たれています。残した B と、その周囲の塗る部分を指し、塗料は使わずに終えます。',
    description:
      '右の紙から持ち上げ用 A だけが剥がれる。図案 B1、B2、B3 は元と同じ並びで紙に残る。左の下敷き C は作業台に残っている。',
  },
];

const COLORS = {
  ink: '#344d34',
  lift: '#4e8195',
  pattern: '#bb8649',
  base: '#bdc4ae',
};

function PatternPieces() {
  return (
    <g data-masking-pieces="B1 B2 B3">
      {[20, 82, 144].map((x, index) => (
        <g key={x}>
          <path
            d={`M${x} 14l44 2-2 40-42-2Z`}
            fill={COLORS.pattern}
            stroke="#76562e"
            strokeWidth="1.5"
          />
          <text x={x + 22} y="43" textAnchor="middle" fontSize="22" fill="#262d20">
            B{index + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A paper rehearsal of the July 17 transfer record, not a reconstruction of tool handling. */
export function MaskingTransferFigure({ figure = '演習図 F' }: { figure?: string }) {
  const [step, setStep] = useState(0);
  const id = useId();
  const current = STEPS[step];
  const bundleX = step === 0 ? 54 : step === 1 ? 206 : 348;
  const bundleY = step === 1 ? 88 : 206;
  const atDestination = step >= 2;

  return (
    <figure className="book-rehearsal-figure book-masking-transfer">
      <p style={{ margin: '0 0 10px', fontSize: 16 }}>
        <strong>{figure}　3片の並びを保って移す</strong>
      </p>
      <div
        role="group"
        aria-label="図案を移す演習の段階"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}
      >
        {STEPS.map((item, index) => (
          <button
            key={item.button}
            type="button"
            aria-pressed={step === index}
            onClick={() => setStep(index)}
            style={{
              minHeight: 44,
              width: '100%',
              margin: 0,
              padding: '10px 8px',
              fontSize: 14,
              background: step === index ? '#405d43' : '#e7ebdf',
              color: step === index ? '#ffffff' : '#344d34',
              boxShadow: step === index ? 'inset 0 -3px #1f3823' : 'none',
            }}
          >
            {item.button}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true" style={{ margin: '18px 0', lineHeight: 1.9 }}>
        <p style={{ margin: '0 0 6px', fontSize: 16 }}>
          <strong>{current.title}</strong>
        </p>
        <p style={{ margin: 0, fontSize: 14 }}>{current.explanation}</p>
      </div>
      <p className="book-masking-scroll-hint">
        図は左右にスクロールして読めます。作業台と移し先、下の断面を見比べてください。
      </p>
      <div
        className="book-masking-scroll"
        tabIndex={0}
        role="region"
        aria-label="図案転写の拡大図。左右にスクロールできます"
      >
        <svg
          viewBox="0 0 620 570"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          data-masking-step={step + 1}
        >
          <title id={`${id}-title`}>{`${figure}：${current.title}`}</title>
          <desc id={`${id}-description`}>{current.description}</desc>
          <text x="24" y="30" fontSize="21">
            上から見た配置
          </text>
          <text x="42" y="180" fontSize="21">
            作業台の紙
          </text>
          <text x="340" y="180" fontSize="21">
            ブレード役の紙
          </text>
          <rect x="34" y="191" width="254" height="111" rx="3" fill="#f5efdf" stroke="#a7ac98" />
          <rect x="46" y="202" width="230" height="82" fill={COLORS.base} stroke="#748364" />
          <text x="56" y="279" fontSize="18">
            C
          </text>
          <path d="M328 191H584V302H328Z" fill="#fffdf4" stroke="#a7ac98" />
          <path d="M341 286H572" stroke={COLORS.ink} strokeWidth="3" strokeDasharray="7 5" />
          <text x="341" y="330" fontSize="21">
            破線：後縁の線
          </text>
          <text x="36" y="330" fontSize="21">
            C はここに残る
          </text>
          {step === 1 && (
            <g fill="none" stroke={COLORS.lift} strokeWidth="3">
              <path d="M159 187Q175 135 198 128M189 124l9 4-4 9" />
              <path d="M418 126Q461 141 471 187M463 179l8 8 5-11" />
            </g>
          )}
          <g transform={`translate(${bundleX} ${bundleY})`}>
            <PatternPieces />
            {step < 3 && (
              <>
                <rect
                  x="6"
                  y="3"
                  width="200"
                  height="64"
                  rx="2"
                  fill={COLORS.lift}
                  fillOpacity="0.16"
                  stroke={COLORS.lift}
                  strokeWidth="3"
                  strokeDasharray="6 3"
                />
                <text x="190" y="-9" fontSize="22" fill={COLORS.lift}>
                  A
                </text>
              </>
            )}
          </g>
          {step === 3 && (
            <g>
              <path
                d="M361 143Q395 90 438 110L552 130L550 80L438 58Q386 38 353 106Z"
                fill={COLORS.lift}
                fillOpacity="0.2"
                stroke={COLORS.lift}
                strokeWidth="3"
              />
              <path
                d="M352 192V151l-7 11m7-11 7 11"
                fill="none"
                stroke={COLORS.lift}
                strokeWidth="3"
              />
              <text x="458" y="107" fontSize="24" fill={COLORS.lift}>
                A
              </text>
              <text x="42" y="93" fontSize="22">
                A だけを剥がす
              </text>
              <text x="42" y="126" fontSize="21">
                B の3片は残す
              </text>
            </g>
          )}
          <path d="M24 351H596" stroke="#cbd1c1" />
          <text x="24" y="387" fontSize="21">
            {atDestination ? '置き先を横から見る' : '重なりを横から見る'}
          </text>
          {step < 3 ? (
            <rect x="48" y="415" width="256" height="12" fill={COLORS.lift} />
          ) : (
            <path
              d="M50 424Q103 375 166 399L304 415"
              fill="none"
              stroke={COLORS.lift}
              strokeWidth="12"
            />
          )}
          <text x="324" y="428" fontSize="21" fill={COLORS.lift}>
            A 持ち上げ用
          </text>
          {[68, 150, 232].map((x) => (
            <rect key={x} x={x} y="444" width="52" height="13" fill={COLORS.pattern} />
          ))}
          <text x="324" y="458" fontSize="21">
            B 図案の3片
          </text>
          {!atDestination && (
            <>
              <rect
                x="48"
                y={step === 1 ? 500 : 474}
                width="256"
                height="12"
                fill={COLORS.base}
                stroke="#748364"
              />
              <text x="324" y={step === 1 ? 513 : 487} fontSize="21">
                C 下敷き
              </text>
            </>
          )}
          <path
            d={`M39 ${atDestination ? 481 : step === 1 ? 521 : 496}H313`}
            stroke="#acae9f"
            strokeWidth="6"
          />
          {atDestination && (
            <text x="324" y="491" fontSize="21">
              ブレード役の紙
            </text>
          )}
          <text x="24" y="558" fontSize="18">
            層の隙間と厚さは、見分けるために拡大しています。
          </text>
        </svg>
      </div>
      <figcaption>
        7月17日の「図案をまとめて移す」記録を読むための、刃物を使わない紙の予行演習です。 A
        は持ち上げ用、B は図案、C
        は下敷き。図案の形や位置は演習用で、実物の加工姿勢や粘着力を再現する図ではありません。
        紙やテープが破れるときは止め、どの層を残すかを指で説明してください。
      </figcaption>
    </figure>
  );
}
