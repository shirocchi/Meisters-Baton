import type { AtlasModel } from '../../domain/wikiAtlas';

export type AircraftView = 'aircraft' | 'propeller' | 'blade' | 'section';
export type ContextPart =
  'propeller' | 'wing' | 'cabin' | 'tail' | 'upper' | 'under' | 'web' | 'flange' | 'spar' | 'ribs';
export type Vec3 = [number, number, number];
export interface ContextMesh {
  group: ContextPart;
  family: 'airframe' | 'propeller';
  assembly?: 'upper' | 'under';
  opposite?: boolean;
  color: string;
  vertices: number[];
  indices: number[];
}

/** Relative placement reused from aircraft-structure-corrected.html (2026-09-11).
 * This is the photo-informed explanatory model, not measured aircraft geometry.
 * Original private photograph and STL files are deliberately not bundled.
 */
export function aircraftGeometry(model: AtlasModel) {
  const airframe: ContextMesh[] = [];
  const make = (group: ContextPart, color: string): ContextMesh => {
    const mesh: ContextMesh = { group, color, family: 'airframe', vertices: [], indices: [] };
    airframe.push(mesh);
    return mesh;
  };
  const wing = make('wing', '#d6dfd4');
  const frame = make('wing', '#6f8276');
  const cabin = make('cabin', '#cbd6cb');
  const windows = make('cabin', '#536d72');
  const tail = make('tail', '#c3d1c2');
  const tailFrame = make('tail', '#63796c');
  function patch(mesh: ContextMesh, vertices: number[], indices: number[]) {
    const offset = mesh.vertices.length / 3;
    mesh.vertices.push(...vertices);
    mesh.indices.push(...indices.map((n) => n + offset));
  }
  function rod(mesh: ContextMesh, from: Vec3, to: Vec3, radius: number, count = 8) {
    const d = to.map((v, i) => v - from[i]) as Vec3;
    const length = Math.hypot(...d);
    const axis = d.map((v) => v / length) as Vec3;
    const cross = (a: Vec3, b: Vec3): Vec3 => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const first = cross(axis, Math.abs(axis[2]) > 0.8 ? [0, 1, 0] : [0, 0, 1]);
    const norm = Math.hypot(...first);
    const u = first.map((v) => v / norm) as Vec3;
    const v = cross(axis, u);
    const positions: number[] = [];
    const indices: number[] = [];
    for (const end of [from, to])
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        positions.push(
          ...end.map((p, j) => p + radius * (u[j] * Math.cos(angle) + v[j] * Math.sin(angle))),
        );
      }
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      indices.push(i, next, i + count, next, next + count, i + count);
    }
    patch(mesh, positions, indices);
  }
  const boom = make('cabin', '#778b7e');
  rod(boom, [-6.8, 0, 0.5], [2.25, 0, 0.5], 0.025);
  const stations = [
    [-0.7, 0.012, 0.05],
    [-0.46, 0.19, 0.25],
    [-0.08, 0.29, 0.4],
    [0.45, 0.33, 0.48],
    [0.95, 0.3, 0.43],
    [1.48, 0.23, 0.29],
    [1.94, 0.1, 0.14],
    [2.14, 0.002, 0.01],
  ];
  for (const [x, ry, rz] of stations)
    for (let j = 0; j <= 32; j++) {
      const a = (j / 32) * Math.PI * 2;
      cabin.vertices.push(x, Math.cos(a) * ry, -0.41 + Math.sin(a) * rz);
    }
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < 32; j++) {
      const a = i * 33 + j;
      cabin.indices.push(a, a + 33, a + 1, a + 1, a + 33, a + 34);
    }
  for (const side of [-1, 1])
    patch(
      windows,
      [
        -0.1,
        side * 0.3,
        -0.13,
        0.32,
        side * 0.32,
        0.04,
        0.95,
        side * 0.31,
        -0.02,
        1.35,
        side * 0.24,
        -0.2,
      ],
      [0, 1, 2, 0, 2, 3],
    );
  rod(cabin, [-0.32, 0, -0.11], [-0.3, 0, 0.5], 0.07);
  rod(cabin, [1.28, 0, -0.2], [1.28, 0, 0.5], 0.065);
  function wingPoint(y: number, u: number, side = 1): Vec3 {
    const sy = Math.abs(y) / 14.6;
    const chord = 1.04 * (1 - 0.2 * sy - 0.43 * sy ** 5);
    const z = 0.5 + 0.72 * sy ** 2.8;
    const angle = ((2 - 5 * sy) * Math.PI) / 180;
    const thick =
      chord *
      0.105 *
      5 *
      (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
    return [
      0.28 + 0.1 * sy - u * chord,
      y,
      z + 0.025 * chord * Math.sin(Math.PI * u) + side * thick - u * chord * Math.sin(angle),
    ];
  }
  for (const side of [-1, 1]) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= 80; i++)
      for (let j = 0; j <= 16; j++)
        positions.push(...wingPoint(-14.6 + (29.2 * i) / 80, j / 16, side));
    for (let i = 0; i < 80; i++)
      for (let j = 0; j < 16; j++) {
        const a = i * 17 + j;
        indices.push(a, a + 17, a + 1, a + 1, a + 17, a + 18);
      }
    patch(wing, positions, indices);
  }
  for (let y = -14.4; y <= 14.4; y += 0.6)
    for (let j = 0; j < 12; j++)
      rod(frame, wingPoint(y, j / 12), wingPoint(y, (j + 1) / 12), 0.009, 4);
  for (const u of [0.02, 0.27, 0.98])
    for (let i = 0; i < 64; i++)
      rod(
        frame,
        wingPoint(-14.6 + (29.2 * i) / 64, u),
        wingPoint(-14.6 + (29.2 * (i + 1)) / 64, u),
        0.012,
        4,
      );
  const horizontal = [
    [-6.65, -1.05],
    [-6.3, -1.1],
    [-5.8, -0.92],
    [-5.68, 0],
    [-5.8, 0.92],
    [-6.3, 1.1],
    [-6.65, 1.05],
  ];
  const vertical = [
    [-6.98, 0.16],
    [-6.94, 0.78],
    [-6.83, 2.62],
    [-6.48, 2.59],
    [-6.43, 0.48],
    [-6.5, -0.22],
    [-6.78, -0.26],
  ];
  for (const [outline, isHorizontal] of [
    [horizontal, true],
    [vertical, false],
  ] as const) {
    const center: Vec3 = isHorizontal ? [-6.2, 0, 0.5] : [-6.65, 0, 0.6];
    const vertices = [...center];
    const indices: number[] = [];
    const points: Vec3[] = outline.map(([x, v]) => (isHorizontal ? [x, v, 0.5] : [x, 0, v]));
    for (const point of points) vertices.push(...point);
    for (let i = 0; i < outline.length; i++) {
      indices.push(0, i + 1, i === outline.length - 1 ? 1 : i + 2);
      rod(tailFrame, points[i], points[(i + 1) % points.length], 0.012);
    }
    patch(tail, vertices, indices);
  }
  const hub = make('propeller', '#be7945');
  hub.family = 'propeller';
  rod(hub, [2.28, 0, 0.5], [2.42, 0, 0.5], 0.035, 16);
  function unpack(
    parts: AtlasModel['body']['parts'],
    local: boolean,
    opposite = false,
  ): ContextMesh[] {
    return parts.map((part) => {
      const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const p = new DataView(bytes(part.positions).buffer);
      const ix = new DataView(bytes(part.indices).buffer);
      const vertices: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i < p.byteLength; i += 6) {
        const q = [0, 1, 2].map((k) => part.min[k] + p.getUint16(i + k * 2, true) * part.scale[k]);
        const s = opposite ? -1 : 1;
        vertices.push(
          local ? q[1] : 2.35 + q[1] / 1000,
          local ? -q[0] : (-q[0] / 1000) * s,
          local ? q[2] : 0.5 + (q[2] / 1000) * s,
        );
      }
      for (let i = 0; i < ix.byteLength; i += 2) indices.push(ix.getUint16(i, true));
      const group: ContextPart =
        part.group === 'web-core'
          ? 'web'
          : part.group === 'roving' || part.group === 'belt'
            ? 'flange'
            : (part.group as ContextPart);
      return {
        vertices,
        indices,
        group,
        family: 'propeller',
        assembly: part.assembly,
        opposite,
        color: part.color,
      };
    });
  }
  const blade = unpack(model.body.parts, false);
  const otherBlade = unpack(
    model.body.parts.filter((p) => p.group === 'upper' || p.group === 'under'),
    false,
    true,
  );
  return {
    aircraft: [...airframe, ...blade, ...otherBlade],
    propeller: [hub, ...blade, ...otherBlade],
    blade,
    section: unpack(model.local.parts, true),
  };
}
