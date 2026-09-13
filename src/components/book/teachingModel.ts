import type { AtlasModel } from '../../domain/wikiAtlas';

type Point = [number, number, number];
type Side = 'upper' | 'under';

/**
 * Explanatory geometry, not the club's manufacturing CAD.
 * The curved planform and twist reuse the corrected 2026-09-11 aircraft study.
 * Cross-sections, material thicknesses and opening distances remain schematic.
 */
export function teachingModel(): AtlasModel {
  const upper: [number, number][] = [];
  const under: [number, number][] = [];
  const count = 40;
  const camber = (u: number) => 0.023 * Math.sin(Math.PI * u);
  const thickness = (u: number) =>
    0.12 *
    5 *
    (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    upper.push([u, camber(u) + thickness(u)]);
    under.push([u, camber(u) - thickness(u)]);
  }
  function point(t: number, u: number, side: Side, inset = 0, local = false): Point {
    const sign = side === 'upper' ? 1 : -1;
    const chord = local ? 1 : 68 + 108 * Math.sin(Math.PI * t) ** 0.9 - 10 * t;
    const x = (u - (local ? 0 : 0.42)) * chord;
    const y = (camber(u) + sign * (thickness(u) - inset * Math.sin(Math.PI * u))) * chord;
    const twist = local ? 0 : ((9 - 7 * t) * Math.PI) / 180;
    return [
      x * Math.cos(twist) - y * Math.sin(twist),
      y * Math.cos(twist) + x * Math.sin(twist),
      local ? t * 0.45 : 100 + t * 1300,
    ];
  }
  function pack(
    id: string,
    group: string,
    assembly: Side,
    color: string,
    vertices: number[],
    indices: number[],
  ) {
    const min: Point = [Infinity, Infinity, Infinity];
    const max: Point = [-Infinity, -Infinity, -Infinity];
    vertices.forEach((v, i) => {
      min[i % 3] = Math.min(min[i % 3], v);
      max[i % 3] = Math.max(max[i % 3], v);
    });
    const scale = min.map((v, i) => (max[i] - v || 1) / 65535) as Point;
    const encoded = (a: Uint16Array) => {
      let result = '';
      for (const byte of new Uint8Array(a.buffer)) result += String.fromCharCode(byte);
      return btoa(result);
    };
    return {
      id,
      group,
      assembly,
      color,
      min,
      scale,
      positions: encoded(
        new Uint16Array(vertices.map((v, i) => Math.round((v - min[i % 3]) / scale[i % 3]))),
      ),
      indices: encoded(new Uint16Array(indices)),
    };
  }
  function strip(
    id: string,
    group: string,
    side: Side,
    color: string,
    local: boolean,
    fromInset: number,
    toInset: number,
    u0 = 0,
    u1 = 1,
    t0 = 0,
    t1 = 1,
  ) {
    const vertices: number[] = [];
    const indices: number[] = [];
    const spans = 36;
    const chords = u1 - u0 < 0.2 ? 4 : count;
    const perFace = (spans + 1) * (chords + 1);
    for (const inset of [fromInset, toInset])
      for (let i = 0; i <= spans; i++)
        for (let j = 0; j <= chords; j++)
          vertices.push(
            ...point(
              t0 + ((t1 - t0) * i) / spans,
              u0 + ((u1 - u0) * j) / chords,
              side,
              inset,
              local,
            ),
          );
    for (let face = 0; face < 2; face++)
      for (let i = 0; i < spans; i++)
        for (let j = 0; j < chords; j++) {
          const a = face * perFace + i * (chords + 1) + j;
          indices.push(a, a + chords + 1, a + 1, a + 1, a + chords + 1, a + chords + 2);
        }
    const edge = (a: number, b: number) =>
      indices.push(a, b, a + perFace, b, b + perFace, a + perFace);
    for (let i = 0; i < spans; i++) {
      edge(i * (chords + 1), (i + 1) * (chords + 1));
      edge(i * (chords + 1) + chords, (i + 1) * (chords + 1) + chords);
    }
    for (let j = 0; j < chords; j++) {
      edge(j, j + 1);
      edge(spans * (chords + 1) + j, spans * (chords + 1) + j + 1);
    }
    return pack(id, group, side, color, vertices, indices);
  }
  function web(local: boolean) {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = local ? i / 40 : 0.18 + (i / 40) * 0.8;
      for (const u of [0.411, 0.429])
        for (const side of ['upper', 'under'] as const)
          vertices.push(...point(t, u, side, 0.021, local));
    }
    for (let i = 0; i < 40; i++) {
      const a = i * 4;
      for (const [b, c] of [
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3],
      ])
        indices.push(a + b, a + c, a + b + 4, a + c, a + c + 4, a + b + 4);
    }
    return pack('web-core', 'web-core', 'upper', '#d6b477', vertices, indices);
  }
  function spar() {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const z of [100, 335])
      for (const r of [6.2, 4.4])
        for (let j = 0; j < 24; j++) {
          const a = (j / 24) * Math.PI * 2;
          vertices.push(Math.cos(a) * r, Math.sin(a) * r + 2, z);
        }
    for (let j = 0; j < 24; j++) {
      const n = (j + 1) % 24;
      for (const [a, b] of [
        [0, 48],
        [24, 72],
        [0, 24],
        [48, 72],
      ])
        indices.push(a + j, a + n, b + j, a + n, b + n, b + j);
    }
    return pack('spar-tube', 'spar', 'upper', '#435967', vertices, indices);
  }
  function rib(t: number, id: string) {
    const vertices: number[] = [];
    const indices: number[] = [];
    // Contoured collars make the attachment to the shell visible without copying private STL.
    for (const offset of [-0.0035, 0.0035])
      for (let j = 0; j < 40; j++) {
        const a = (j / 40) * Math.PI * 2;
        const u = 0.42 + Math.cos(a) * 0.38;
        const side: Side = Math.sin(a) >= 0 ? 'upper' : 'under';
        vertices.push(...point(t + offset, u, side, 0.017));
        vertices.push(Math.cos(a) * 6.5, Math.sin(a) * 6.5 + 2, 100 + (t + offset) * 1300);
      }
    for (let j = 0; j < 40; j++) {
      const a = j * 2;
      const n = ((j + 1) % 40) * 2;
      indices.push(a, n, a + 1, n, n + 1, a + 1);
      indices.push(a + 80, a + 81, n + 80, n + 80, a + 81, n + 81);
      indices.push(a, a + 80, n, n, a + 80, n + 80);
    }
    return pack(id, 'ribs', 'upper', '#b8c9c3', vertices, indices);
  }
  function parts(local: boolean) {
    const result = [];
    for (const side of ['upper', 'under'] as const) {
      const base = side === 'upper' ? '#486057' : '#81998c';
      result.push(
        strip(`${side}-outer`, side, side, base, local, 0, 0.003),
        strip(`${side}-core`, side, side, '#c7ac78', local, 0.003, 0.012),
        strip(`${side}-inner`, side, side, base, local, 0.012, 0.016),
        strip(`${side}-roving`, 'roving', side, '#79573d', local, 0.016, 0.02, 0.37, 0.47),
        strip(`${side}-belt`, 'belt', side, '#483f35', local, 0.02, 0.022, 0.35, 0.49),
      );
    }
    result.push(web(local));
    if (!local)
      result.push(spar(), rib(0.035, 'rib-root'), rib(0.095, 'rib-middle'), rib(0.155, 'rib-end'));
    return result;
  }
  return {
    body: { parts: parts(false) },
    local: { parts: parts(true) },
    profile: { upper, under },
  };
}
