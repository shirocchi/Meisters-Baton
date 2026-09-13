import { useState } from 'react';
import { MaskingTransferFigure } from './MaskingTransferFigure';

export function RehearsalFigure({ stage }: { stage: string }) {
  const [removed, setRemoved] = useState(false);
  if (stage === 'finish') return <MaskingTransferFigure />;
  if (stage === 'mold')
    return (
      <figure className="book-rehearsal-figure">
        <svg
          viewBox="0 0 620 450"
          role="img"
          aria-label="型の紙上演習図。上から見て、前縁と後縁の間に並ぶ断面板を基準として残し、隣り合う板の間のパテを整える。矢印は紙でなぞる向き。"
        >
          <text x="28" y="32">
            演習図 M　上から見た位置関係
          </text>
          <text x="268" y="77">
            前縁
          </text>
          <path d="M90 102H535V310H90Z" fill="#e8dcca" stroke="#65725b" />
          {[130, 265, 400, 510].map((x) => (
            <path key={x} d={`M${x} 102V310`} stroke="#5a7374" strokeWidth="9" />
          ))}
          <path
            d="M280 208H378L365 198M378 208L365 218"
            stroke="#405c44"
            fill="none"
            strokeWidth="4"
          />
          <text x="278" y="250" fontSize="14">
            紙でなぞる向き
          </text>
          <path d="M195 132V160" stroke="#405c44" />
          <text x="154" y="188">
            パテ
          </text>
          <text x="268" y="346">
            後縁
          </text>
          <path d="M130 310V364H65" fill="none" stroke="#405c44" />
          <text x="28" y="390">
            断面板：残す基準
          </text>
          <text x="28" y="424" fontSize="14">
            紙上の演習用。実際の板間隔・研磨条件・許容値は表さない。
          </text>
        </svg>
        <figcaption>
          右の演習で2本の線を描くときは、この図の隣り合う断面板を選びます。練習型の方向説明を読み解く概念図で、実物の加工姿勢や押す力を指定するものではありません。
        </figcaption>
      </figure>
    );
  const layers = [
    ['凹型', '#a9b39a'],
    ['外側のCF', '#334638'],
    ['バルサコア', '#d2b17b'],
    ['内側のCF', '#334638'],
    ['ピールプライ', '#bd9a9a'],
    ['ブリーザー', '#c6c5be'],
    ['袋', '#85a8bb'],
  ];
  return (
    <figure className="book-rehearsal-figure">
      <svg
        viewBox="0 0 620 430"
        role="img"
        aria-label={
          removed
            ? '演習図 S。副資材と凹型から取り出すと、外側CF・バルサコア・内側CFの3層が外皮に残る。'
            : '演習図 S。下から凹型、外側CF、バルサコア、内側CF、ピールプライ、ブリーザー、袋の順。'
        }
      >
        <text x="28" y="32">
          演習図 S　層を横から見分ける
        </text>
        {layers.map(([name, color], i) => (
          <g key={name} opacity={removed && (i === 0 || i > 3) ? 0.16 : 1}>
            <rect x="50" y={338 - i * 43} width="300" height="19" rx="2" fill={color} />
            <path d={`M355 ${348 - i * 43}H382`} stroke="#66735c" />
            <text x="392" y={354 - i * 43}>
              {name}
            </text>
          </g>
        ))}
        <path d="M24 303V227M19 236L24 227L29 236" stroke="#405c44" fill="none" strokeWidth="2" />
        <text x="28" y="410" fontSize="15">
          {removed
            ? '外皮に残る3層を、明るく示しています。'
            : '凹型を下に置き、紙を下から順に重ねます。'}
        </text>
      </svg>
      <button type="button" aria-pressed={removed} onClick={() => setRemoved(!removed)}>
        {removed ? '7枚の並びに戻す' : '外皮に残る3層を確かめる'}
      </button>
      <figcaption>
        紙の端をずらして重ねる演習の見取り図です。厚さ・枚数の製作仕様や硬化条件を表す図ではありません。「CF」は炭素繊維のクロスで、この演習では樹脂を使わず紙で代用します。
      </figcaption>
    </figure>
  );
}
