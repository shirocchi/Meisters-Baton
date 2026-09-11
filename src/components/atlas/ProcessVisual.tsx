import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Tags } from 'lucide-react';
import type { AtlasModel } from '../../domain/wikiAtlas';
import {
  amount,
  atSpan,
  cadMoldGeometry,
  clamp,
  lineContact,
  modelSections,
  path,
  project,
  ribbon,
  sectionCurve,
  type Point,
  type SpanSection,
  type SpatialPoint,
} from './processGeometry';
import { PROCESS_STEPS } from './processStages';
import './process-visual.css';

export { PROCESS_STEPS } from './processStages';

interface SceneProps {
  progress: number;
  model: AtlasModel;
  sections: SpanSection[];
  uid: string;
  labels: boolean;
  side: 'upper' | 'under';
}

const C = {
  carbon: '#424d59',
  roving: '#1e293b',
  belt: '#687b8b',
  balsa: '#d7b67e',
  glass: '#a8c8cf',
  jig: '#ba9563',
  foam: '#94c9d8',
  putty: '#e4d8a4',
  steel: '#acb9c2',
  resin: '#dfa246',
};
const Poly = ({
  points,
  fill,
  stroke = '#657785',
  opacity = 1,
}: {
  points: Point[];
  fill: string;
  stroke?: string;
  opacity?: number;
}) => (
  <path
    d={path(points, true)}
    fill={fill}
    stroke={stroke}
    strokeWidth="1"
    opacity={opacity}
    strokeLinejoin="round"
  />
);
const Line = ({
  points,
  color,
  width = 2,
  dash,
}: {
  points: Point[];
  color: string;
  width?: number;
  dash?: string;
}) => (
  <path
    d={path(points)}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray={dash}
  />
);
const Tag = ({ x, y, children, to }: { x: number; y: number; children: ReactNode; to?: Point }) => (
  <g className="process-svg-label">
    {to && (
      <>
        <path d={`M${x},${y + 7}L${to[0]},${to[1]}`} fill="none" stroke="#64788e" strokeWidth="1" />
        <circle cx={to[0]} cy={to[1]} r="2.5" fill="#2d557a" />
      </>
    )}
    <text x={x} y={y}>
      {children}
    </text>
  </g>
);

function TaperedCore({ points, thickness = 4 }: { points: Point[]; thickness?: number }) {
  const left = points[0][0],
    right = points.at(-1)![0];
  const cropped = points.filter(([x]) => x > left + (right - left) * 0.06);
  const offset = (x: number) =>
    (thickness / 2) * clamp((x - left - (right - left) * 0.06) / ((right - left) * 0.06));
  return (
    <Poly
      points={[
        ...cropped.map(([x, y]) => [x, y - offset(x)] as Point),
        ...cropped
          .slice()
          .reverse()
          .map(([x, y]) => [x, y + offset(x)] as Point),
      ]}
      fill={C.balsa}
      stroke="none"
    />
  );
}

function Surface({
  sections,
  model,
  side = 'upper',
  height = 80,
  inward = false,
  fill,
  opacity = 1,
  stroke = '#596877',
}: {
  sections: SpanSection[];
  model: AtlasModel;
  side?: 'upper' | 'under';
  height?: number;
  inward?: boolean;
  fill: string;
  opacity?: number;
  stroke?: string;
}) {
  return (
    <g opacity={opacity}>
      {sections.slice(0, -1).map((section, i) => (
        <Poly
          key={i}
          fill={fill}
          stroke="none"
          points={[
            ...sectionCurve(section, model.profile, side, height, inward).map(project),
            ...sectionCurve(sections[i + 1], model.profile, side, height, inward)
              .reverse()
              .map(project),
          ]}
        />
      ))}
      <Line
        points={[
          ...sectionCurve(sections[0], model.profile, side, height, inward).map(project),
          ...sections
            .slice(1)
            .map((s) => project(sectionCurve(s, model.profile, side, height, inward).at(-1)!)),
          ...sectionCurve(sections.at(-1)!, model.profile, side, height, inward)
            .reverse()
            .map(project),
          ...sections
            .slice(0, -1)
            .reverse()
            .map((s) => project(sectionCurve(s, model.profile, side, height, inward)[0])),
        ]}
        color={stroke}
        width={1}
      />
    </g>
  );
}

function Table({ tall = false }: { tall?: boolean }) {
  const corners: SpatialPoint[] = [
    [-20, -135, -4],
    [725, -135, -4],
    [725, 105, -4],
    [-20, 105, -4],
  ];
  return (
    <g>
      <Poly points={corners.map(project)} fill="#e5d3b5" stroke="#c3ac85" />
      <Poly
        points={[
          corners[3],
          corners[2],
          [725, 105, tall ? -42 : -13],
          [-20, 105, tall ? -42 : -13],
        ].map(project)}
        fill="#c5ab82"
        stroke="#b69a71"
      />
      {tall && (
        <Poly
          points={[corners[0], corners[3], [-20, 105, -42], [-20, -135, -42]].map(project)}
          fill="#b99c72"
          stroke="#b69a71"
        />
      )}
    </g>
  );
}

function MoldPlate({
  section,
  model,
  side,
  height = 102,
  foam = false,
  offset = 0,
}: {
  section: SpanSection;
  model: AtlasModel;
  side: 'upper' | 'under';
  height?: number;
  foam?: boolean;
  offset?: number;
}) {
  const top = sectionCurve(section, model.profile, side, height - offset);
  const left = top[0][1],
    right = top.at(-1)![1];
  const shape: SpatialPoint[] = [
    [section.span, left - 32, 0],
    [section.span, left - 32, 10],
    [section.span, left - 3, 10],
    ...top,
    [section.span, right + 3, 10],
    [section.span, right + 32, 10],
    [section.span, right + 32, 0],
  ];
  return (
    <Poly
      points={shape.map(project)}
      fill={foam ? C.foam : C.steel}
      stroke={foam ? '#76aab8' : '#758692'}
    />
  );
}

function MoldShell({
  sections,
  model,
  side,
  height = 102,
  fill,
  opacity = 1,
  lift = 0,
}: {
  sections: SpanSection[];
  model: AtlasModel;
  side: 'upper' | 'under';
  height?: number;
  fill: string;
  opacity?: number;
  lift?: number;
}) {
  const edge = (s: SpanSection, positive: boolean, h: number): SpatialPoint => [
    s.span,
    positive ? s.right : s.left,
    h + lift,
  ];
  return (
    <g opacity={opacity}>
      {[false, true].map((positive) => (
        <g key={String(positive)}>
          <Poly
            points={[
              ...sections.map((s) => edge(s, positive, height)),
              ...[...sections].reverse().map((s) => edge(s, positive, 10)),
            ].map(project)}
            fill={fill}
          />
          <Poly
            points={[
              ...sections.map((s) => edge(s, positive, 10)),
              ...[...sections]
                .reverse()
                .map(
                  (s) => [s.span, positive ? s.right + 30 : s.left - 30, 10 + lift] as SpatialPoint,
                ),
            ].map(project)}
            fill={fill}
          />
        </g>
      ))}
      <Surface sections={sections} model={model} side={side} height={height + lift} fill={fill} />
    </g>
  );
}

function HandTool({
  x,
  y,
  kind = 'sand',
  motion = 0,
}: {
  x: number;
  y: number;
  kind?: 'sand' | 'brush' | 'spray' | 'grinder' | 'bar';
  motion?: number;
}) {
  const dx = kind === 'sand' ? Math.sin(motion * Math.PI * 4) * 37 : motion * 30;
  return (
    <g transform={`translate(${x + dx} ${y})`}>
      {kind === 'sand' && (
        <>
          <path d="M-31,8L18,0L38,13L-11,23Z" fill="#ae9062" stroke="#756042" />
          <path d="M-31,8L-11,23L-11,29L-31,15Z" fill="#594839" />
          <path d="M-20,-7Q-10,-24 7,-14L24,-4L14,9L-4,6L-16,10Z" fill="#84b0ce" stroke="#497a9b" />
          <path d="M-18,-9L-42,-32L-28,-46L-3,-18" fill="#d8e4eb" stroke="#91a9bb" />
        </>
      )}
      {kind === 'brush' && (
        <>
          <path d="M-8,-42L1,-43L8,-7L-1,-3Z" fill="#bd9465" />
          <path d="M-6,-6L14,-10L20,14L-3,21Z" fill={C.resin} stroke="#a7813b" />
        </>
      )}
      {kind === 'spray' && (
        <>
          <rect x="-12" y="-48" width="28" height="49" rx="6" fill="#d3dce2" stroke="#7d909e" />
          <path d="M-4,-48V-56H8V-48" fill="#697f91" />
          <path d="M19,-39L86,-20L62,24Z" fill="#adc3d9" opacity=".3" />
          <path
            d="M19,-39L72,-20M19,-34L62,8"
            stroke="#698cac"
            strokeWidth="2"
            strokeDasharray="3 6"
          />
        </>
      )}
      {kind === 'grinder' && (
        <>
          <rect
            x="-25"
            y="-31"
            width="38"
            height="16"
            rx="5"
            transform="rotate(23)"
            fill="#315d75"
          />
          <circle cx="20" cy="2" r="15" fill="#c3cdd3" stroke="#556572" strokeWidth="3" />
          <path d="M7,13L-12,24M11,15L0,36M17,17L17,35" stroke="#dc9b45" strokeWidth="2" />
        </>
      )}
      {kind === 'bar' && (
        <path
          d="M-6,-60L12,-10Q17,6 3,11L-10,13"
          fill="none"
          stroke="#435566"
          strokeWidth="9"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function DetailBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <g>
      <rect x="20" y="355" width="760" height="143" rx="12" fill="#fff" stroke="#dbe3e9" />
      <text className="process-detail-label" x="36" y="379">
        {title}
      </text>
      {children}
    </g>
  );
}

function MoldScene({ progress: p, model, sections, uid, labels, side }: SceneProps) {
  if (model.manufacturing)
    return (
      <CadMoldScene
        progress={p}
        model={model}
        sections={sections}
        uid={uid}
        labels={labels}
        side={side}
      />
    );
  const released = amount(p, 9),
    female = amount(p, 10);
  const lift = released * 78;
  const section = sections[10];
  const detailTop = model.profile[side].map(
    ([x, y]) => [160 + x * 340, 412 - (side === 'upper' ? y : -y) * 300] as Point,
  );
  return (
    <>
      <g opacity={1 - female}>
        <Table tall />
        <MoldShell
          sections={sections}
          model={model}
          side={side}
          height={95}
          fill={C.foam}
          opacity={amount(p, 1)}
        />
        {sections
          .slice()
          .reverse()
          .map((s, i) => (
            <g key={i}>
              {p > 0 && (
                <g opacity={amount(p, 1)}>
                  <MoldPlate
                    section={{ ...s, span: s.span + 12 }}
                    model={model}
                    side={side}
                    foam
                    offset={7}
                  />
                  <MoldPlate
                    section={{ ...s, span: s.span + 3 }}
                    model={model}
                    side={side}
                    foam
                    offset={7}
                  />
                </g>
              )}
              <MoldPlate section={s} model={model} side={side} />
            </g>
          ))}
        <MoldShell
          sections={sections}
          model={model}
          side={side}
          height={103}
          fill={p < 4 ? C.putty : '#d6ddd9'}
          opacity={amount(p, 2)}
        />
        {p > 4 && (
          <MoldShell
            sections={sections}
            model={model}
            side={side}
            height={108}
            fill="#e7ece7"
            opacity={amount(p, 5)}
            lift={lift}
          />
        )}
        {p > 5 && (
          <MoldShell
            sections={sections}
            model={model}
            side={side}
            height={113}
            fill={`url(#${uid}-carbon)`}
            opacity={amount(p, 6)}
            lift={lift}
          />
        )}
        {p >= 2 && p < 3 && <HandTool x={360} y={165} kind="brush" motion={p % 1} />}
        {p >= 3 && p < 4 && <HandTool x={360} y={165} motion={p % 1} />}
        {p >= 4 && p < 5 && <HandTool x={320} y={132} kind="spray" motion={p % 1} />}
        {p >= 8 && p < 9 && <HandTool x={405} y={264} kind="grinder" motion={p % 1} />}
        {p >= 9 && p < 10 && <HandTool x={262} y={215 - lift / 2} kind="bar" motion={p % 1} />}
        {p >= 7 && p < 8 && (
          <g transform="translate(610 68)">
            <circle r="32" fill="#fff" stroke="#52718d" strokeWidth="2" />
            <path d="M0,-21V0L14,9" fill="none" stroke="#52718d" strokeWidth="3" />
            <text x="0" y="54" textAnchor="middle" fontSize="20" fill="#253e58">
              24時間以上
            </text>
          </g>
        )}
      </g>
      {female > 0 && (
        <g opacity={female}>
          <Table />
          <Surface
            sections={sections}
            model={model}
            side={side}
            height={30}
            inward
            fill="#495c6a"
          />
          <Surface
            sections={sections}
            model={model}
            side={side}
            height={38}
            inward
            fill="#e5eae5"
          />
          <Tag x={72} y={58} to={project([350, 0, 38])}>
            外皮を成形する凹面
          </Tag>
          <Tag x={528} y={300}>
            upper・underを別々に作る
          </Tag>
        </g>
      )}
      {labels && female === 0 && (
        <>
          <Tag x={40} y={55} to={project([section.span, 0, 105 + lift])}>
            {p >= 6
              ? '硬化後に外す大積層'
              : p >= 4
                ? '凸型の製品面'
                : p >= 2
                  ? '基準面まで盛るパテ'
                  : '断面を決めるステンレス板'}
          </Tag>
          <Tag x={476} y={337} to={project([section.span, section.right + 20, 5])}>
            高い側面と両側の足
          </Tag>
        </>
      )}
      <DetailBox
        title={
          p < 5
            ? '断面の拡大：スタイロは基準面より低くする'
            : p < 9
              ? '断面の拡大：凸型へ重ねて凹型の面を写す'
              : '断面の拡大：凸型と凹型を分離する'
        }
      >
        <Poly
          points={[
            [130, 477],
            [130, 462],
            [160, 462],
            ...detailTop.map(([x, y]) => [x, y + (p < 2 ? 6 : 0)] as Point),
            [500, 462],
            [530, 462],
            [530, 477],
          ]}
          fill={p >= 2 ? C.putty : C.foam}
        />
        <Line points={detailTop} color="#6a8292" width={3} />
        {p >= 2 && p < 5 && (
          <Line
            points={detailTop.map(([x, y]) => [x, y - 4])}
            color={p >= 4 ? '#9eb0ad' : C.putty}
            width={5}
          />
        )}
        {p >= 5 && (
          <Line
            points={detailTop.map(([x, y]) => [x, y - 7 - released * 15])}
            color="#bdccc1"
            width={6}
          />
        )}
        {p >= 6 &&
          Array.from({ length: 8 }, (_, i) => (
            <Line
              key={i}
              points={detailTop.map(([x, y]) => [x, y - 14 - i * 3 - released * 15])}
              color={i % 2 ? '#7b8c95' : '#46586a'}
              width={2}
            />
          ))}
        <text x="557" y="417" fontSize="18" fill="#314d68">
          {p >= 6 ? '合計 8 層' : p >= 2 ? 'パテで面をつなぐ' : 'オフセット'}
        </text>
        <text x="557" y="445" fontSize="16" fill="#50667d">
          {p >= 6 ? 'CFRP / GFRP' : p >= 2 ? '手作業で研磨' : 'パテの厚みを残す'}
        </text>
        {p >= 6 && (
          <text x="557" y="469" fontSize="16" fill="#50667d">
            ガラスマット
          </text>
        )}
      </DetailBox>
    </>
  );
}

function CadMoldScene({ progress: p, model, uid, labels, side }: SceneProps) {
  const geometry = useMemo(() => cadMoldGeometry(model, side)!, [model, side]);
  const released = amount(p, 9),
    female = amount(p, 10);
  const lift = released * 57;
  const representative = geometry.source[Math.floor(geometry.source.length / 2)];
  const xs = representative.outline.map(([x]) => x),
    ys = representative.outline.map(([, y]) => y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const k = Math.min(300 / (maxX - minX), 84 / (maxY - minY));
  const detail = ([x, y]: Point): Point => [193 + (x - minX) * k, 487 - (y - minY) * k];
  const rawOutline = representative.outline.map(detail),
    rawProduct = representative.product.map(detail);
  const middle = geometry.sections[Math.floor(geometry.sections.length / 2)];
  const topPoint = middle.product[Math.floor(middle.product.length / 2)];
  const top = project([middle.span, ...topPoint]);
  const shell = (fill: string, opacity: number, dy = 0) => (
    <g opacity={opacity} transform={`translate(0 ${dy})`}>
      <path d={geometry.envelope} fill={fill} stroke="none" />
      <path d={geometry.productSurface} fill={fill} stroke="#7c8d98" strokeWidth=".65" />
      {geometry.sections
        .filter((_, i) => i === 0 || i === geometry.sections.length - 1)
        .map((s, i) => (
          <Line
            key={i}
            points={s.outline.map(([x, y]) => project([s.span, x, y]))}
            color="#70818c"
            width={1}
          />
        ))}
    </g>
  );
  return (
    <>
      <g opacity={1 - female}>
        <Table tall />
        {shell(C.foam, amount(p, 1), 4)}
        {geometry.sections
          .slice()
          .reverse()
          .map((s, i) => (
            <Poly
              key={i}
              points={s.outline.map(([x, y]) => project([s.span, x, y]))}
              fill={C.steel}
              stroke="#768997"
              opacity={p < 2 ? 0.88 : 0.35}
            />
          ))}
        {shell(p < 4 ? C.putty : '#d8dfdb', amount(p, 2), -1)}
        {p > 4 && shell('#e5ebe5', amount(p, 5), -4 - lift)}
        {p > 5 && shell(`url(#${uid}-carbon)`, amount(p, 6), -8 - lift)}
        {p >= 2 && p < 3 && <HandTool x={top[0]} y={top[1] - 10} kind="brush" motion={p % 1} />}
        {p >= 3 && p < 4 && <HandTool x={top[0]} y={top[1] - 10} motion={p % 1} />}
        {p >= 4 && p < 5 && (
          <HandTool x={top[0] - 50} y={top[1] - 23} kind="spray" motion={p % 1} />
        )}
        {p >= 7 && p < 8 && (
          <g transform="translate(655 58)">
            <circle r="28" fill="#fff" stroke="#52718d" strokeWidth="2" />
            <path d="M0,-20V0L13,9" fill="none" stroke="#52718d" strokeWidth="3" />
            <text y="48" textAnchor="middle" fontSize="18" fill="#2e4860">
              24時間以上
            </text>
          </g>
        )}
        {p >= 8 && p < 9 && (
          <HandTool x={top[0] + 20} y={top[1] + 63} kind="grinder" motion={p % 1} />
        )}
        {p >= 9 && p < 10 && (
          <HandTool x={top[0] - 85} y={top[1] + 55 - lift / 2} kind="bar" motion={p % 1} />
        )}
      </g>
      {female > 0 && (
        <g opacity={female}>
          <Table />
          <g transform="translate(0 436) scale(1 -1)">
            {shell(`url(#${uid}-carbon)`, 1, 45)}
            <path
              d={geometry.productSurface}
              transform="translate(0 41)"
              fill="#e6ece7"
              stroke="#859990"
              strokeWidth="1.5"
            />
          </g>
        </g>
      )}
      {labels && (
        <>
          <Tag x={41} y={43} to={[top[0], top[1] - lift]}>
            {p < 2
              ? '断面板とオフセットしたスタイロ'
              : p < 5
                ? '手で面を出した凸型'
                : p < 9
                  ? '製品面・側面・足へ積層'
                  : '離型した凹型'}
          </Tag>
          <Tag x={460} y={335}>
            {side}の設計データに沿う輪郭
          </Tag>
        </>
      )}
      <DetailBox title={`CAD実断面：${side}の型は足と側面が左右で異なる`}>
        <Poly
          points={rawOutline}
          fill={p >= 2 ? C.putty : p >= 1 ? C.foam : C.steel}
          stroke="#728998"
        />
        <Line points={rawProduct} color="#708b9b" width={2} />
        {p >= 2 && (
          <Line
            points={rawProduct.map(([x, y]) => [x, y - 2])}
            color={p >= 4 ? '#aebdb3' : '#caba8b'}
            width={3}
          />
        )}
        {p > 4 && (
          <Line
            points={rawProduct.map(([x, y]) => [x, y - 5 - released * 11])}
            color="#b9c9bd"
            width={3}
          />
        )}
        {p > 5 &&
          Array.from({ length: 8 }, (_, i) => (
            <Line
              key={i}
              points={rawProduct.map(([x, y]) => [x, y - 8 - i * 2 - released * 11])}
              color={i % 2 ? '#768a96' : '#465b6e'}
              width={1.5}
            />
          ))}
        <text x="448" y="416" fontSize="18" fill="#34526d">
          {p >= 6 ? '合計8層を積層' : '高い側面と非対称の足'}
        </text>
        <text x="448" y="444" fontSize="16" fill="#526b81">
          {p >= 6
            ? 'CFRP・GFRP・ガラスマット'
            : p >= 2
              ? 'ステンレス板に合わせて研磨'
              : 'スタイロは製品面より低くする'}
        </text>
        <text x="448" y="474" fontSize="15" fill="#526b81">
          上下の型を切り替えて比較
        </text>
      </DetailBox>
    </>
  );
}

function FemaleBase({
  model,
  sections,
  uid,
  side,
}: Pick<SceneProps, 'model' | 'sections' | 'uid' | 'side'>) {
  return (
    <>
      <Table />
      <Surface
        sections={sections}
        model={model}
        side={side}
        height={24}
        inward
        fill={`url(#${uid}-carbon)`}
      />
      <Surface sections={sections} model={model} side={side} height={31} inward fill="#dce5df" />
    </>
  );
}

function SkinScene({ progress: p, model, sections, uid, labels, side }: SceneProps) {
  const peel = amount(p, 4),
    breathe = amount(p, 5),
    vacuum = amount(p, 6),
    demold = amount(p, 7);
  const layers: [number, string, number][] = [
    [1, `url(#${uid}-carbon45)`, 38],
    [2, `url(#${uid}-wood)`, 44],
    [3, `url(#${uid}-carbon45)`, 50],
  ];
  const layerLine = model.profile[side].map(
    ([x, y]) => [165 + x * 400, 465 + (side === 'upper' ? y : -y) * 220] as Point,
  );
  return (
    <>
      <FemaleBase model={model} sections={sections} uid={uid} side={side} />
      {layers.map(
        ([at, fill, height]) =>
          p > at - 1 && (
            <Surface
              key={at}
              model={model}
              sections={sections}
              side={side}
              inward
              fill={fill}
              height={height + (1 - amount(p, at)) * 80 + demold * 70}
              opacity={amount(p, at)}
            />
          ),
      )}
      {p > 3 && (
        <Surface
          model={model}
          sections={sections}
          side={side}
          inward
          fill={`url(#${uid}-peel)`}
          height={57 + (1 - peel) * 60 + demold * 145}
          opacity={peel * (1 - demold)}
        />
      )}
      {p > 4 && (
        <Surface
          model={model}
          sections={sections}
          side={side}
          inward
          fill="#e4e2de"
          height={64 + (1 - breathe) * 60 + demold * 160}
          opacity={breathe * (1 - demold) * 0.9}
        />
      )}
      {p > 5 && (
        <g opacity={vacuum * (1 - demold)}>
          <Surface
            model={model}
            sections={sections}
            side={side}
            inward
            fill="#a1bfde"
            height={71 + (1 - vacuum) * 90}
            opacity={0.3}
          />
          <path d="M555,260C642,323 683,284 705,312" fill="none" stroke="#6d8497" strokeWidth="8" />
          <rect x="676" y="295" width="80" height="42" rx="8" fill="#5a7388" />
          <path d="M692,295V283H737V295" fill="none" stroke="#5a7388" strokeWidth="6" />
          <circle cx="719" cy="313" r="11" fill="#e7f0f4" />
          <path d="M714,313L724,307" stroke="#47657e" strokeWidth="2" />
        </g>
      )}
      {p < 1 && (
        <g transform="translate(220 78)">
          <path
            d="M0,0H254L270,123H15Z"
            fill="#adcde4"
            fillOpacity=".25"
            stroke="#8eb0cc"
            strokeWidth="2"
          />
          <path d="M12,10H244" stroke="#78a0be" strokeWidth="3" />
          <path d="M31,27L222,24L238,102L44,105Z" fill={`url(#${uid}-carbon45)`} stroke="#4d6577" />
          <path
            d="M52,33C75,87 187,94 212,41"
            stroke={C.resin}
            fill="none"
            strokeWidth="12"
            opacity=".7"
          />
          <HandTool x={105} y={37} motion={p} />
          <Tag x={3} y={-13}>
            袋の中でエポキシ樹脂を含浸
          </Tag>
        </g>
      )}
      {labels && (
        <>
          <Tag x={40} y={45} to={project([340, 0, 50 + demold * 70])}>
            {p >= 7
              ? '積層を終えた外皮'
              : p >= 6
                ? '空気を抜いて袋を密着'
                : p >= 5
                  ? '白いブリーザークロス'
                  : p >= 4
                    ? 'ピールプライクロス'
                    : p >= 3
                      ? '内側のカーボンクロス ±45°'
                      : p >= 2
                        ? 'バルサのコアを位置決め'
                        : '外側のカーボンクロス ±45°'}
          </Tag>
          <Tag x={82} y={335}>
            {side}用の凹型
          </Tag>
        </>
      )}
      <DetailBox title="積層断面：型の内側へ順番に重ねる">
        <Line points={layerLine.map(([x, y]) => [x, y + 8])} color="#9aaba4" width={12} />
        {layers.map(
          ([at, , height]) =>
            p >= at && (
              <Line
                key={at}
                points={layerLine.map(([x, y]) => [x, y - (height - 38) * 1.5 - demold * 16])}
                color={at === 2 ? C.balsa : C.carbon}
                width={at === 2 ? 8 : 5}
              />
            ),
        )}
        {p >= 4 && (
          <Line
            points={layerLine.map(([x, y]) => [x, y - 27 - demold * 50])}
            color="#be9da0"
            width={4}
            dash="5 3"
          />
        )}
        {p >= 5 && (
          <Line
            points={layerLine.map(([x, y]) => [x, y - 33 - demold * 65])}
            color="#d9d5ce"
            width={7}
          />
        )}
        {p >= 6 && (
          <Line
            points={layerLine.map(([x, y]) => [x, y - 41 - (1 - vacuum) * 20 - demold * 75])}
            color="#80a5c8"
            width={2}
          />
        )}
        <text x="590" y="418" fontSize="16" fill="#425b73">
          副資材
        </text>
        <text x="590" y="449" fontSize="16" fill="#425b73">
          CFRP / バルサ / CFRP
        </text>
        <text x="590" y="477" fontSize="16" fill="#425b73">
          凹型
        </text>
      </DetailBox>
    </>
  );
}

function EmptySkin({
  model,
  sections,
  uid,
  side = 'upper',
  height = 42,
  opacity = 1,
}: Pick<SceneProps, 'model' | 'sections' | 'uid'> & {
  side?: 'upper' | 'under';
  height?: number;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <Surface
        model={model}
        sections={sections}
        side={side}
        height={height}
        inward
        fill={C.balsa}
      />
      <Surface
        model={model}
        sections={sections}
        side={side}
        height={height + 4}
        inward
        fill={`url(#${uid}-carbon45)`}
      />
    </g>
  );
}

function FlangeScene({ progress: p, model, sections, uid, labels, side }: SceneProps) {
  const count = side === 'upper' ? 6 : 4;
  const roving = amount(p, 1),
    belt = amount(p, 2);
  const selected = sections.filter((s) => s.span <= 700 * Math.max(0.01, roving));
  const centerline = sections.map((s) => project([s.span, 0, 51]));
  return (
    <>
      <Table />
      <EmptySkin model={model} sections={sections} uid={uid} side={side} />
      <Line points={centerline} color="#c782a0" width={2} dash="5 5" />
      {p >= 1 &&
        Array.from({ length: count }, (_, i) => (
          <Poly
            key={i}
            points={ribbon(
              selected.length > 1 ? selected : sections.slice(0, 2),
              (i - (count - 1) / 2) * 3.6,
              3,
              54,
            )}
            fill={i % 2 ? '#364457' : '#1f2a3d'}
            stroke="#687688"
            opacity={roving}
          />
        ))}
      {p >= 2 && (
        <Poly
          points={ribbon(sections, 0, count * 3.6 + 11, 59 + (1 - belt) * 70)}
          fill={`url(#${uid}-belt)`}
          opacity={belt}
        />
      )}
      {p < 1 && <HandTool x={318} y={217} kind="brush" motion={p} />}
      {labels && (
        <>
          <Tag x={40} y={47} to={project([350, 0, 59])}>
            {p >= 2 ? '黒帯：ロービングの上に沿わせる' : '最大翼厚付近を根元から端まで'}
          </Tag>
          <Tag x={480} y={333}>
            {side}：ロービング {count} 本
          </Tag>
        </>
      )}
      <DetailBox title={`フランジの拡大：${side}は${count}本`}>
        <path d="M130,474Q323,498 548,464" stroke={C.carbon} strokeWidth="15" fill="none" />
        <path d="M130,474Q323,498 548,464" stroke={C.balsa} strokeWidth="4" fill="none" />
        {p >= 1 &&
          Array.from({ length: count }, (_, i) => (
            <ellipse
              key={i}
              cx={275 + i * 13}
              cy={470}
              rx={8}
              ry={6}
              fill={C.roving}
              stroke="#687788"
              opacity={roving}
            />
          ))}
        {p >= 2 && (
          <path
            d={`M248,479Q257,454 276,459H${282 + count * 13}Q${306 + count * 13},463 ${317 + count * 13},476`}
            stroke={C.belt}
            strokeWidth="7"
            fill="none"
            opacity={belt}
          />
        )}
        <text x="572" y="423" fontSize="17" fill="#2a435e">
          細幅の開繊平織クロス
        </text>
        <text x="572" y="450" fontSize="16" fill="#526980">
          ロービングを上から覆う
        </text>
        <text x="572" y="477" fontSize="16" fill="#526980">
          外皮の内面
        </text>
      </DetailBox>
    </>
  );
}

function Fixture({
  section,
  model,
  top = false,
  kind = 'web',
  lift = 0,
  opacity = 1,
}: {
  section: SpanSection;
  model: AtlasModel;
  top?: boolean;
  kind?: 'web' | 'join';
  lift?: number;
  opacity?: number;
}) {
  const shell = sectionCurve(section, model.profile, top ? 'under' : 'upper', 46, true);
  const left = section.left - 30,
    right = section.right + 30;
  const bottom: SpatialPoint[] = [
    [section.span, left, -3],
    [section.span, right, -3],
  ];
  const topHeight = kind === 'web' ? 123 : 92;
  const shape: SpatialPoint[] = top
    ? [
        [section.span, left, topHeight + lift],
        [section.span, right, topHeight + lift],
        [section.span, right, 26 + lift],
        ...shell
          .slice()
          .reverse()
          .map(([z, x, y]) => [z, x, y + 10 + lift] as SpatialPoint),
        [section.span, left, 26 + lift],
      ]
    : [...bottom, [section.span, right, 26], ...shell.slice().reverse(), [section.span, left, 26]];
  return (
    <g opacity={opacity}>
      <Poly points={shape.map(project)} fill={top ? '#c9aa7b' : '#b28f5e'} stroke="#8f744e" />
      {top && kind === 'web' && (
        <Line
          points={[
            [section.span, 0, 51 + lift],
            [section.span, 0, 108 + lift],
          ].map(project)}
          color="#f5f7f7"
          width={4}
        />
      )}
      {[left + 8, right - 8].map((x, i) => {
        const [px, py] = project([section.span, x, 28 + (top ? lift : 0)]);
        return (
          <path
            key={i}
            d={`M${px - 4},${py - 4}q-7,-8 0,-9q7,0 3,8l4,6q6,7 -1,8q-7,0 -3,-7Z`}
            fill="none"
            stroke="#806848"
            strokeWidth="1.3"
          />
        );
      })}
    </g>
  );
}

function FixtureBank({
  sections,
  model,
  top = false,
  kind,
  lift,
  opacity = 1,
}: {
  sections: SpanSection[];
  model: AtlasModel;
  top?: boolean;
  kind?: 'web' | 'join';
  lift?: number;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      {sections
        .slice()
        .reverse()
        .map((s, i) => (
          <Fixture key={i} section={s} model={model} top={top} kind={kind} lift={lift} />
        ))}
    </g>
  );
}

function InternalParts({
  sections,
  model,
  spar = true,
  web = true,
  lift = 0,
  uid,
}: {
  sections: SpanSection[];
  model: AtlasModel;
  spar?: boolean;
  web?: boolean;
  lift?: number;
  uid: string;
}) {
  const bodyPart =
    model.body.parts.find((part) => part.id === 'upper-outer') ?? model.body.parts[0];
  const bodyLength = Math.max(1, bodyPart.scale[2] * 65535);
  const relativeSpan = (radius: number) => ((radius - bodyPart.min[2]) / bodyLength) * 700;
  const end = relativeSpan(330);
  const tail = [atSpan(sections, end), ...sections.filter((s) => s.span > end)];
  return (
    <>
      {spar && (
        <>
          <Line
            points={[project([relativeSpan(30), 0, 50]), project([end, 0, 50])]}
            color="#303d4b"
            width={10}
          />
          {[135, 215, 295].map((r) => {
            const z = relativeSpan(r);
            return (
              <Poly
                key={r}
                points={[
                  [z - 3, -19, 40],
                  [z + 3, -19, 40],
                  [z + 3, 19, 40],
                  [z - 3, 19, 40],
                ].map(project)}
                fill="#687784"
              />
            );
          })}
        </>
      )}
      <Poly points={ribbon(sections, 0, 14, 52)} fill={`url(#${uid}-belt)`} />
      {web && (
        <>
          <Poly
            points={[
              ...tail.map((s) => project([s.span, 0, 53 + lift])),
              ...[...tail].reverse().map((s) => project([s.span, 0, 82 + lift])),
            ]}
            fill={`url(#${uid}-wood)`}
            stroke="#97b6ba"
          />
          <Line
            points={tail.map((s) => project([s.span, 0, 82 + lift]))}
            color="#8daeb5"
            width={3}
          />
        </>
      )}
    </>
  );
}

function JigDetail({
  model,
  kind,
  p,
  uid,
}: {
  model: AtlasModel;
  kind: 'web' | 'join';
  p: number;
  uid: string;
}) {
  if (model.manufacturing) return <CadJigDetail model={model} kind={kind} p={p} />;
  const upper = model.profile.upper.map(([x, y]) => [170 + x * 380, 438 + y * 360] as Point);
  const under = model.profile.under.map(([x, y]) => [170 + x * 380, 438 + y * 360] as Point);
  const isJoin = kind === 'join';
  const fitted = amount(p, isJoin ? 4 : 3),
    web = isJoin ? 1 : amount(p, 4),
    close = isJoin ? amount(p, 3) : 0;
  const upperY = 478,
    webX = 280;
  const topY = 400 - (1 - fitted) * 17;
  return (
    <DetailBox
      title={
        isJoin ? '断面：受け治具へ貼り合わせ治具をはめる' : '断面：溝でウェブ材の位置と向きを決める'
      }
    >
      <Poly
        points={[[137, 490], [577, 490], [577, 449], ...[...upper].reverse(), [137, 449]]}
        fill="#c1a170"
        stroke="#9e7b4c"
      />
      <Line points={upper} color={C.carbon} width={11} />
      <TaperedCore points={upper} thickness={3} />
      <path
        d="M188,429Q168,425 170,438"
        fill="none"
        stroke={C.carbon}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <ellipse cx={webX} cy={upperY - 2} rx={18} ry={6} fill={C.roving} />
      <path
        d={`M${webX - 26},${upperY}Q${webX - 19},${upperY - 12} ${webX},${upperY - 10}Q${webX + 19},${upperY - 12} ${webX + 28},${upperY - 3}`}
        fill="none"
        stroke={C.belt}
        strokeWidth={5}
      />
      {p >= (isJoin ? 0 : 4) && (
        <g opacity={web}>
          <rect
            x={webX - 5}
            y={431 - (1 - web) * 30}
            width={10}
            height={36}
            fill={`url(#${uid}-wood)`}
            stroke={C.glass}
            strokeWidth={3}
          />
        </g>
      )}
      {isJoin && p >= 1 && (
        <path d="M171,438Q164,450 185,457" stroke={C.resin} fill="none" strokeWidth="5" />
      )}
      {isJoin && p >= 2 && (
        <>
          <ellipse cx={webX} cy={428} rx={10} ry={5} fill={C.putty} stroke="#bfae70" />
          <path d="M505,445L536,443L520,438Z" fill={C.putty} />
        </>
      )}
      {isJoin && p >= 3 && (
        <g transform={`translate(0 ${-(1 - close) * 35})`}>
          <Line points={under.filter(([x]) => x > 185)} color={C.carbon} width={9} />
          <TaperedCore points={under} thickness={2} />
        </g>
      )}
      {p >= (isJoin ? 4 : 3) && (
        <g opacity={fitted}>
          <path
            d={`M137,${topY}H577V449H550${
              isJoin
                ? `L${[...under]
                    .reverse()
                    .map(([x, y]) => `${x},${y - 5}`)
                    .join('L')}`
                : `V${topY + 26}H${webX + 3}V444H${webX - 3}V${topY + 26}H170`
            }V449H137Z`}
            fill="#d2b68d"
            stroke="#927149"
          />
          {[149, 565].map((x) => (
            <path
              key={x}
              d={`M${x - 7},443q-8,-12 1,-13q11,0 4,11l8,8q8,9 -1,10q-10,0 -3,-9Z`}
              fill="#c1a170"
              stroke="#8b6c46"
            />
          ))}
        </g>
      )}
      <text x="600" y="423" fontSize="17" fill="#354f68">
        {isJoin ? '上からunderを押す' : '細い溝に差し込む'}
      </text>
      <text x="600" y="450" fontSize="16" fill="#526980">
        パズル状の嵌合
      </text>
      <text x="600" y="477" fontSize="16" fill="#526980">
        upperは下側で固定
      </text>
    </DetailBox>
  );
}

function CadJigDetail({ model, kind, p }: { model: AtlasModel; kind: 'web' | 'join'; p: number }) {
  const data = model.manufacturing!.jigs;
  const isJoin = kind === 'join';
  const support = data.join.supportPaths;
  const moving = isJoin ? data.join.pressPaths : data.web.paths;
  const all = [...support, ...moving].flat();
  const minX = Math.min(...all.map(([x]) => x)),
    maxX = Math.max(...all.map(([x]) => x));
  const minY = Math.min(...all.map(([, y]) => y)),
    maxY = Math.max(...all.map(([, y]) => y));
  const scale = Math.min(330 / (maxX - minX), 103 / (maxY - minY));
  const transform = ([x, y]: Point, offset = 0): Point => [
    183 + (x - minX) * scale,
    488 - (y - minY) * scale - offset,
  ];
  const fit = amount(p, isJoin ? 4 : 3);
  const upperContact = data.join.upperContact;
  const underContact = data.join.underContact;
  const webStart =
    upperContact && data.web.slot ? lineContact(data.web.slot, upperContact) : undefined;
  const webEnd =
    underContact && data.web.slot ? lineContact(data.web.slot, underContact) : undefined;
  const insert = isJoin ? 1 : amount(p, 4);
  return (
    <DetailBox
      title={isJoin ? 'CAD実断面：共通受けと貼り合わせ治具' : 'CAD実断面：ウェブ立て治具の斜めの溝'}
    >
      {support.map((curve, index) => (
        <Poly
          key={`support-${index}`}
          points={curve.map((point) => transform(point))}
          fill="#c9ac7c"
          stroke="#8e7452"
        />
      ))}
      {upperContact && (
        <>
          <Line points={upperContact.map((point) => transform(point))} color={C.carbon} width={4} />
          <Line points={upperContact.map((point) => transform(point))} color={C.balsa} width={1} />
        </>
      )}
      {fit > 0 &&
        moving.map((curve, index) =>
          index === 0 ? (
            <Poly
              key={index}
              points={curve.map((point) => transform(point, (1 - fit) * 30))}
              fill="#dec598"
              stroke="#957a50"
              opacity={fit}
            />
          ) : (
            <Line
              key={index}
              points={curve.map((point) => transform(point, (1 - fit) * 30))}
              color="#957a50"
              width={1}
            />
          ),
        )}
      {webStart && webEnd && insert > 0 && (
        <g opacity={insert}>
          <Line
            points={[transform(webStart, (1 - insert) * 26), transform(webEnd, (1 - insert) * 26)]}
            color={C.glass}
            width={5}
          />
          <Line
            points={[transform(webStart, (1 - insert) * 26), transform(webEnd, (1 - insert) * 26)]}
            color={C.balsa}
            width={2.5}
          />
          <circle cx={transform(webStart)[0]} cy={transform(webStart)[1]} r={3} fill={C.roving} />
        </g>
      )}
      {isJoin && underContact && p > 2 && (
        <Line
          points={underContact.map((point) => transform(point, (1 - amount(p, 3)) * 22))}
          color={C.carbon}
          width={3.5}
        />
      )}
      {!isJoin && p >= 5 && underContact && (
        <Line
          points={underContact.map((point) => transform(point))}
          color="#8298ad"
          width={2}
          dash="3 3"
        />
      )}
      {isJoin && p >= 2 && webEnd && (
        <circle
          cx={transform(webEnd)[0]}
          cy={transform(webEnd)[1]}
          r={3}
          fill={C.putty}
          stroke="#b09b64"
          strokeWidth={0.7}
        />
      )}
      <text x="425" y="417" fontSize="18" fill="#35526c">
        {isJoin ? 'underに沿う押さえ' : '溝がウェブの向きを決める'}
      </text>
      <text x="425" y="446" fontSize="16" fill="#536c80">
        丸い嵌合部で位置を固定
      </text>
      <text x="425" y="476" fontSize="15" fill="#536c80">
        630mm用治具の設計輪郭
      </text>
    </DetailBox>
  );
}

function WebScene({ progress: p, model, sections, uid, labels }: SceneProps) {
  return (
    <>
      <Table />
      <FixtureBank sections={sections} model={model} />
      <EmptySkin model={model} sections={sections} uid={uid} />
      <InternalParts
        sections={sections}
        model={model}
        uid={uid}
        spar={p >= 1}
        web={p > 3}
        lift={(1 - amount(p, 4)) * 85}
      />
      {p > 2 && (
        <FixtureBank
          sections={sections.filter((_, i) => i % 2 === 0)}
          model={model}
          top
          kind="web"
          lift={(1 - amount(p, 3)) * 100}
          opacity={p >= 5 ? 0.6 : amount(p, 3) * 0.85}
        />
      )}
      {p >= 2 && p < 3 && (
        <g transform="translate(259 53)">
          <path d="M0,30L265,0L267,49L2,79Z" fill={C.glass} stroke="#86a9b4" />
          <path d="M0,48L265,18L267,67L2,97Z" fill={`url(#${uid}-wood)`} stroke="#997445" />
          <path d="M0,65L265,35L267,84L2,114Z" fill={C.glass} fillOpacity=".65" stroke="#86a9b4" />
          <Tag x={-128} y={4}>
            マイクロガラス / 2mmバルサ / マイクロガラス
          </Tag>
        </g>
      )}
      {labels && (
        <>
          <Tag x={42} y={48} to={project([390, 0, p >= 3 ? 105 : 60])}>
            {p >= 4
              ? '溝に通したウェブ材をフランジ上に立てる'
              : p >= 3
                ? 'ウェブ立て治具'
                : p >= 2
                  ? '両面を±45°で補強'
                  : p >= 1
                    ? '桁リブでペラスパーを外皮へ固定'
                    : '外皮の形に沿う受け治具'}
          </Tag>
          <Tag x={456} y={337}>
            受け治具の間隔：60mm
          </Tag>
        </>
      )}
      <JigDetail model={model} kind="web" p={p} uid={uid} />
    </>
  );
}

function JoinScene({ progress: p, model, sections, uid, labels }: SceneProps) {
  const under = amount(p, 3),
    clampFit = amount(p, 4);
  return (
    <>
      <Table />
      <FixtureBank sections={sections} model={model} />
      <EmptySkin model={model} sections={sections} uid={uid} />
      <InternalParts sections={sections} model={model} uid={uid} />
      {p >= 1 && (
        <Line
          points={sections.map((s) => project([s.span, s.left + 3, 49]))}
          color={C.resin}
          width={4}
        />
      )}
      {p >= 2 && (
        <>
          <Line points={sections.map((s) => project([s.span, 0, 84]))} color={C.putty} width={6} />
          <Line
            points={sections.map((s) => project([s.span, s.right - 4, 49]))}
            color={C.putty}
            width={5}
          />
        </>
      )}
      {p > 2 && (
        <EmptySkin
          model={model}
          sections={sections}
          uid={uid}
          side="under"
          height={74 + (1 - under) * 115}
          opacity={under}
        />
      )}
      {p > 3 && (
        <FixtureBank
          sections={sections}
          model={model}
          top
          kind="join"
          lift={(1 - clampFit) * 120}
          opacity={clampFit * 0.92}
        />
      )}
      {labels && (
        <>
          <Tag x={40} y={50} to={project([300, 0, p >= 4 ? 92 : 78 + (1 - under) * 115])}>
            {p >= 4
              ? '貼り合わせ治具でunderを押し当てる'
              : p >= 3
                ? '上からunderをかぶせる'
                : p >= 2
                  ? 'ウェブ材上部と後縁にエポパテ'
                  : p >= 1
                    ? '前縁の重ね代にエポキシ樹脂'
                    : '内部部材はupperと一緒に固定'}
          </Tag>
          <Tag x={427} y={337}>
            upperは作業台側で動かさない
          </Tag>
        </>
      )}
      <JigDetail model={model} kind="join" p={p} uid={uid} />
    </>
  );
}

function PaintReference({
  url,
  width = 520,
  height = 77,
}: {
  url: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 3800 560" preserveAspectRatio="none">
      <g transform="translate(3800 0) rotate(90)">
        <svg width="560" height="3800" viewBox="1110 90 560 3800" preserveAspectRatio="none">
          <image href={url} width="2896" height="4096" />
        </svg>
      </g>
    </svg>
  );
}

function FinishScene({
  progress: p,
  model,
  sections,
  uid,
  labels,
  paintImageUrl,
}: SceneProps & { paintImageUrl?: string }) {
  const finishFill = p >= 2 ? '#f7f7f3' : `url(#${uid}-carbon45)`;
  const last = sections.at(-1)!;
  const tipLift = (1 - amount(p, 0.8)) * 35;
  const outline = [
    ...sectionCurve(sections[0], model.profile, 'upper', 63).map(project),
    ...sections.slice(1).map((s) => project(sectionCurve(s, model.profile, 'upper', 63).at(-1)!)),
    ...sectionCurve(last, model.profile, 'upper', 63).reverse().map(project),
    ...sections
      .slice(0, -1)
      .reverse()
      .map((s) => project(sectionCurve(s, model.profile, 'upper', 63)[0])),
  ];
  return (
    <>
      <Table />
      <Surface model={model} sections={sections} height={63} fill={finishFill} />
      <Surface
        model={model}
        sections={sections}
        side="under"
        height={61}
        inward
        fill={finishFill}
      />
      <Poly
        points={[
          [last.span + tipLift, last.left, 62],
          [last.span + tipLift, last.right, 62],
          [last.span + 33 + tipLift, (last.left + last.right) / 2, 63],
        ].map(project)}
        fill={p >= 2 ? '#f6f5f0' : '#c6ced0'}
      />
      <Line
        points={[
          [last.span, last.left, 63],
          [last.span, last.right, 63],
        ].map(project)}
        color={p < 2 ? C.putty : '#cbd2d1'}
        width={5}
      />
      {p >= 1 && p < 2 && <HandTool x={659} y={145} motion={p % 1} />}
      {p >= 2 && p < 3 && <HandTool x={390} y={165} kind="spray" motion={p % 1} />}
      {p >= 3 && p < 5 && (
        <g opacity={1 - amount(p, 5)}>
          {[1, 3, 6, 10, 14, 17].map((index) => {
            const s = sections[index];
            return (
              <Poly
                key={index}
                points={[
                  [s.span - 9, s.left, 68],
                  [s.span + 9, s.left, 68],
                  [s.span + 9, s.right, 68],
                  [s.span - 9, s.right, 68],
                ].map(project)}
                fill="#e5d593"
                stroke="#bea951"
              />
            );
          })}
        </g>
      )}
      {p > 3 && paintImageUrl && (
        <>
          <defs>
            <clipPath id={`${uid}-paint-surface`}>
              <path d={path(outline, true)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}-paint-surface)`}>
            <g transform="translate(124 233) rotate(-11.5)" opacity={amount(p, 4)}>
              <PaintReference url={paintImageUrl} width={530} height={62} />
            </g>
          </g>
        </>
      )}
      {p >= 4 && p < 5 && <HandTool x={343} y={144} kind="spray" motion={p % 1} />}
      {labels && (
        <>
          <Tag x={38} y={43} to={project([last.span, (last.left + last.right) / 2, 63])}>
            {p < 2
              ? 'ペラ端をエポパテで取り付ける'
              : p < 3
                ? 'サーフェーサーで面を整える'
                : p < 4
                  ? '図案に沿ってマスキング'
                  : '図案を確認して塗装する'}
          </Tag>
          <Tag x={418} y={337}>
            白地・濃紺・黒の塗装
          </Tag>
        </>
      )}
      <DetailBox title={p < 3 ? '接合部と塗装前の面を確認' : '2026年7月15日の塗装図案'}>
        {p < 3 ? (
          <>
            <path d="M140,443L418,425L418,465L140,475Z" fill={finishFill} stroke="#697d8e" />
            <path
              d={`M${440 + tipLift},425Q${526 + tipLift},422 ${554 + tipLift},441Q${512 + tipLift},461 ${440 + tipLift},465Z`}
              fill={p >= 2 ? '#f5f5ef' : '#c9d2d5'}
              stroke="#697d8e"
            />
            <path d="M421,426L435,426L435,465L421,465Z" fill={C.putty} />
            <text x="593" y="432" fontSize="18" fill="#344c63">
              ペラ端
            </text>
            <text x="593" y="462" fontSize="16" fill="#536a7d">
              接合部の段差を整える
            </text>
          </>
        ) : paintImageUrl ? (
          <>
            <g transform="translate(62 405)">
              <PaintReference url={paintImageUrl} width={526} height={77} />
            </g>
            <text x="618" y="430" fontSize="17" fill="#354f69">
              実際の図案
            </text>
            <text x="618" y="458" fontSize="15" fill="#536a7d">
              模様の位置を確認
            </text>
          </>
        ) : (
          <>
            <text x="75" y="433" fontSize="18" fill="#35516c">
              実際の塗装図案を、本文の画像で確認
            </text>
            <text x="75" y="465" fontSize="16" fill="#597086">
              マスキング → 塗装 → マスキングを外す
            </text>
          </>
        )}
      </DetailBox>
    </>
  );
}

export interface ProcessVisualProps {
  stage: string;
  step: number;
  onStepChange?: (step: number) => void;
  model?: AtlasModel;
  paintImageUrl?: string;
}

export function ProcessVisual({
  stage,
  step,
  onStepChange,
  model,
  paintImageUrl,
}: ProcessVisualProps) {
  const steps = PROCESS_STEPS[stage] ?? PROCESS_STEPS.overview;
  const max = steps.length - 1;
  const [progress, setProgress] = useState(clamp(step, 0, max));
  const [playing, setPlaying] = useState(false);
  const [labels, setLabels] = useState(true);
  const [sectionOnly, setSectionOnly] = useState(false);
  const [side, setSide] = useState<'upper' | 'under'>('upper');
  const uid = `process-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const notified = useRef<number | null>(null);
  const changeRef = useRef(onStepChange);
  changeRef.current = onStepChange;
  const position = useRef(progress);
  position.current = progress;
  const [reducedMotion, setReducedMotion] = useState(false);
  const sections = useMemo(() => (model ? modelSections(model) : []), [model]);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    changed();
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    setProgress(clamp(step, 0, max));
    setPlaying(false);
    notified.current = null;
    setSide('upper');
    setSectionOnly(false);
  }, [stage]);
  useEffect(() => {
    if (notified.current !== null && Math.abs(step - notified.current) < 0.01) return;
    setProgress(clamp(step, 0, max));
    setPlaying(false);
  }, [step, max]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = performance.now();
    notified.current = Math.floor(position.current + 0.0001);
    const tick = (now: number) => {
      const next = Math.min(max, position.current + clamp(now - previous, 0, 80) / 1900);
      previous = now;
      position.current = next;
      setProgress(next);
      const index = Math.floor(next + 0.0001);
      if (index !== notified.current) {
        notified.current = index;
        changeRef.current?.(index);
      }
      if (next < max) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, max]);
  const select = (value: number) => {
    const next = clamp(value, 0, max);
    setPlaying(false);
    setProgress(next);
    notified.current = next;
    onStepChange?.(next);
  };
  const index = Math.min(max, Math.floor(progress + 0.0001));
  const current = steps[index];
  const scene: SceneProps | undefined = model
    ? { progress, model, sections, uid, labels, side }
    : undefined;
  return (
    <section
      className="process-visual"
      aria-label={`${stage === 'mold' ? '型作り' : stage === 'skin' ? '外皮積層' : stage === 'flange' ? 'フランジ積層' : stage === 'web' ? '内部部材' : stage === 'join' ? '貼り合わせ' : '仕上げ'}の工程図`}
      data-process-stage={stage}
      data-process-step={index}
    >
      <div className="process-toolbar">
        {['mold', 'skin', 'flange'].includes(stage) && (
          <div className="process-side" aria-label="製作する外皮">
            {(['upper', 'under'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <button
          className="process-label-toggle"
          type="button"
          aria-pressed={labels}
          onClick={() => setLabels((value) => !value)}
        >
          <Tags size={16} />
          部材名
        </button>
        <span className="process-schematic">工程模式図</span>
        {model?.manufacturing && ['mold', 'web', 'join'].includes(stage) && (
          <button
            type="button"
            aria-pressed={sectionOnly}
            onClick={() => setSectionOnly((value) => !value)}
          >
            実断面を拡大
          </button>
        )}
      </div>
      {scene ? (
        <svg
          className={`process-scene${sectionOnly ? ' process-scene-detail' : ''}`}
          viewBox={sectionOnly ? '158 376 244 122' : '0 0 800 514'}
          role="img"
          aria-label={`${current.title}。${current.detail}`}
        >
          <title>{current.title}</title>
          <defs>
            <pattern id={`${uid}-carbon`} width="10" height="10" patternUnits="userSpaceOnUse">
              <rect width="10" height="10" fill="#43505c" />
              <path d="M0,0L10,10M-5,5L5,15M5,-5L15,5" stroke="#62717e" strokeWidth="3" />
            </pattern>
            <pattern id={`${uid}-carbon45`} width="11" height="11" patternUnits="userSpaceOnUse">
              <rect width="11" height="11" fill="#44535f" />
              <path d="M0,0L11,11M0,11L11,0" stroke="#72808c" strokeWidth="1.5" />
            </pattern>
            <pattern id={`${uid}-belt`} width="10" height="10" patternUnits="userSpaceOnUse">
              <rect width="10" height="10" fill="#72818c" />
              <path d="M0,3H10M3,0V10" stroke="#495b70" strokeWidth="3" />
            </pattern>
            <pattern id={`${uid}-wood`} width="23" height="15" patternUnits="userSpaceOnUse">
              <rect width="23" height="15" fill="#dbc091" />
              <path
                d="M0,3Q11,5 23,3M0,11Q11,9 23,11"
                stroke="#bd9f6e"
                fill="none"
                strokeWidth=".8"
              />
            </pattern>
            <pattern id={`${uid}-peel`} width="16" height="16" patternUnits="userSpaceOnUse">
              <rect width="16" height="16" fill="#e4e0dc" />
              <path d="M0,5H16M5,0V16" stroke="#ad8f92" strokeWidth="1.5" />
            </pattern>
          </defs>
          {stage === 'mold' ? (
            <MoldScene {...scene} />
          ) : stage === 'skin' ? (
            <SkinScene {...scene} />
          ) : stage === 'flange' ? (
            <FlangeScene {...scene} />
          ) : stage === 'web' ? (
            <WebScene {...scene} />
          ) : stage === 'join' ? (
            <JoinScene {...scene} />
          ) : (
            <FinishScene {...scene} paintImageUrl={paintImageUrl} />
          )}
        </svg>
      ) : (
        <p className="process-missing" role="status">
          工程図の形状データを読み込んでいます…
        </p>
      )}
      {sectionOnly && (
        <p className="process-detail-caption">
          {stage === 'mold'
            ? '型の実CAD断面。upperとunderで足と側面の形が異なります。色は手順に応じてステンレス・スタイロ・パテ・積層材へ変わります。'
            : stage === 'web'
              ? '濃い茶はupperを支える受け、薄い茶はウェブ立て治具。黒い外皮・フランジの上に、水色で縁取ったウェブ材を立てます。'
              : '下側の受けにupperを固定し、上側の貼り合わせ治具でunderを押し当てます。丸い嵌合部が両者の位置を決めます。'}
        </p>
      )}
      <div className="process-current">
        <span>
          {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </span>
        <label className="process-visually-hidden" htmlFor={`${uid}-select`}>
          工程図の手順
        </label>
        <select
          id={`${uid}-select`}
          value={index}
          onChange={(event) => select(Number(event.target.value))}
        >
          {steps.map((s, i) => (
            <option key={s.id} value={i}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <input
        type="range"
        className="process-seek"
        aria-label="工程図のシークバー"
        aria-valuetext={`${index + 1}/${steps.length} ${current.title}`}
        min={0}
        max={max}
        step={0.01}
        value={progress}
        onChange={(event) => select(Number(event.target.value))}
      />
      <div className="process-controls">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => select(index - 1)}
          aria-label="前の手順"
        >
          <ChevronLeft size={19} />
        </button>
        <button
          type="button"
          className="process-play"
          onClick={() => {
            if (reducedMotion) {
              select(progress >= max ? 0 : Math.min(max, index + 1));
              return;
            }
            if (progress >= max) {
              setProgress(0);
              position.current = 0;
            }
            setPlaying((value) => !value);
          }}
          aria-label={
            playing ? '工程の再生を一時停止' : reducedMotion ? '次の手順を表示' : '工程を再生'
          }
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
          {playing ? '一時停止' : reducedMotion ? '次の手順' : '工程を再生'}
        </button>
        <button
          type="button"
          disabled={index === max}
          onClick={() => select(index + 1)}
          aria-label="次の手順"
        >
          <ChevronRight size={19} />
        </button>
      </div>
      <p className="process-note">断面の厚さ・治具の表示数は、構造を読めるよう調整しています。</p>
    </section>
  );
}
