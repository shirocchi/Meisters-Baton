import type { AtlasModel } from '../../domain/wikiAtlas';

export type Point = [number, number];
export type SpatialPoint = [number, number, number];
export interface SpanSection {
  span: number;
  left: number;
  right: number;
  tilt: number;
}

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const amount = (value: number, at: number) => clamp(value - at + 1);
export const path = (points: Point[], close = false) =>
  points.length
    ? `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}${close ? 'Z' : ''}`
    : '';

// Dimensions and mesh vertices arrive through the authenticated model asset.
// The public renderer contains no club CAD coordinates.
export function modelSections(model: AtlasModel): SpanSection[] {
  const part = model.body.parts.find((p) => p.id === 'upper-outer') ?? model.body.parts[0];
  const binary = atob(part.positions);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  const values = new DataView(bytes.buffer);
  const rows = new Map<number, SpatialPoint[]>();
  for (let i = 0; i + 5 < bytes.length; i += 6) {
    const v = [0, 1, 2].map(
      (axis) => part.min[axis] + values.getUint16(i + axis * 2, true) * part.scale[axis],
    ) as SpatialPoint;
    const z = Math.round(v[2] * 10) / 10;
    const row = rows.get(z) ?? [];
    row.push(v);
    rows.set(z, row);
  }
  const sorted = [...rows].sort(([a], [b]) => a - b);
  const start = sorted[0]?.[0] ?? 0;
  const end = sorted.at(-1)?.[0] ?? start + 1;
  const scale = 700 / Math.max(1, end - start);
  const result: SpanSection[] = [];
  for (let i = 0; i <= 20; i++) {
    const target = start + ((end - start) * i) / 20;
    const [z, row] = sorted.reduce(
      (best, r) => (Math.abs(r[0] - target) < Math.abs(best[0] - target) ? r : best),
      sorted[0],
    );
    const xs = row.map((v) => v[0]);
    const left = Math.min(...xs),
      right = Math.max(...xs);
    const leftPoint = row.reduce((a, b) => (a[0] < b[0] ? a : b));
    const rightPoint = row.reduce((a, b) => (a[0] > b[0] ? a : b));
    result.push({
      span: (z - start) * scale,
      left: left * scale,
      right: right * scale,
      tilt: (rightPoint[1] - leftPoint[1]) * scale * 0.35,
    });
  }
  return result;
}

export function atSpan(sections: SpanSection[], span: number): SpanSection {
  const index = sections.findIndex((s) => s.span >= span);
  if (index <= 0) return { ...sections[0], span };
  const a = sections[index - 1],
    b = sections[index];
  const t = clamp((span - a.span) / Math.max(0.01, b.span - a.span));
  return {
    span,
    left: a.left + (b.left - a.left) * t,
    right: a.right + (b.right - a.right) * t,
    tilt: a.tilt + (b.tilt - a.tilt) * t,
  };
}

export function project([span, cross, height]: readonly number[]): Point {
  return [125 + span * 0.76 + cross * 0.5, 306 - span * 0.155 + cross * 0.4 - height * 0.72];
}

export function sectionCurve(
  section: SpanSection,
  profile: AtlasModel['profile'],
  side: 'upper' | 'under' = 'upper',
  height = 80,
  inward = false,
): SpatialPoint[] {
  const width = section.right - section.left;
  return profile[side]
    .filter((_, i) => i % 3 === 0 || i === profile[side].length - 1)
    .map(([x, y]) => [
      section.span,
      section.left + x * width,
      height + (inward ? -1 : 1) * y * width * 1.7 + section.tilt * (x - 0.5),
    ]);
}

export function ribbon(
  sections: SpanSection[],
  cross: number,
  width: number,
  height: number,
): Point[] {
  return [
    ...sections.map((s) => project([s.span, cross + width / 2, height + s.tilt * 0.05])),
    ...[...sections]
      .reverse()
      .map((s) => project([s.span, cross - width / 2, height + s.tilt * 0.05])),
  ];
}

export function resamplePath(points: Point[], count = 120): Point[] {
  if (points.length < 2) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  const total = lengths.at(-1)!;
  const result: Point[] = [];
  let index = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (index < points.length - 1 && lengths[index] < target) index++;
    const a = points[index - 1],
      b = points[index];
    const t =
      (target - lengths[index - 1]) / Math.max(0.000001, lengths[index] - lengths[index - 1]);
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

export function lineContact(line: Point[], curve: Point[]): Point | undefined {
  if (line.length < 2 || curve.length < 2) return undefined;
  const [origin, end] = line;
  const direction: Point = [end[0] - origin[0], end[1] - origin[1]];
  const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1],
      b = curve[i];
    const edge: Point = [b[0] - a[0], b[1] - a[1]];
    const offset: Point = [a[0] - origin[0], a[1] - origin[1]];
    const determinant = cross(direction, edge);
    if (Math.abs(determinant) < 1e-9) continue;
    const t = cross(offset, edge) / determinant;
    const u = cross(offset, direction) / determinant;
    if (u >= -0.0001 && u <= 1.0001)
      return [origin[0] + t * direction[0], origin[1] + t * direction[1]];
  }
  return undefined;
}

export function cadMoldGeometry(model: AtlasModel, side: 'upper' | 'under') {
  const data = model.manufacturing?.molds[side];
  if (!data) return undefined;
  const source = data.sections.slice().sort((a, b) => a.span - b.span);
  const points = source.flatMap((s) => s.outline);
  const base = Math.min(...points.map((p) => p[1]));
  const midX = (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2;
  const start = source[0].span;
  const scale = 700 / Math.max(1, source.at(-1)!.span - start);
  const sections = source.map((s) => ({
    span: (s.span - start) * scale,
    outline: s.outline.map(([x, y]) => [(x - midX) * scale, (y - base) * scale] as Point),
    product: s.product.map(([x, y]) => [(x - midX) * scale, (y - base) * scale] as Point),
  }));
  const rings = sections.map((s) => resamplePath(s.outline, 100));
  let envelope = '',
    productSurface = '';
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i],
      b = sections[i + 1];
    for (let j = 0; j < 99; j++) {
      if (rings[i][j][1] < 0.01 && rings[i][j + 1][1] < 0.01) continue;
      const face = [
        project([a.span, ...rings[i][j]]),
        project([a.span, ...rings[i][j + 1]]),
        project([b.span, ...rings[i + 1][j + 1]]),
        project([b.span, ...rings[i + 1][j]]),
      ];
      const signed = face.reduce((sum, point, index) => {
        const next = face[(index + 1) % face.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0);
      envelope += path(signed < 0 ? face.reverse() : face, true);
    }
    productSurface += path(
      [
        ...a.product.map(([x, y]) => project([a.span, x, y])),
        ...b.product
          .slice()
          .reverse()
          .map(([x, y]) => project([b.span, x, y])),
      ],
      true,
    );
  }
  return { sections, source, envelope, productSurface };
}
