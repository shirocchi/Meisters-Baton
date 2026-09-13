import type { Vec3 } from './aircraftGeometry';

// Camera path from the first visible animation in the user's shared reference.
// The final orbit reveals the corrected upper assembly from its inner face.
// Only the motion is reused; the public, corrected teaching geometry stays local.
const frames: { time: number; target: Vec3; position: Vec3 }[] = [
  { time: 0, target: [-1, 0, 0.65], position: [14, -31, 10] },
  { time: 2, target: [-1, 0, 0.65], position: [14, -31, 10] },
  { time: 6.5, target: [2.35, 0, 0.5], position: [7, -5, 3.8] },
  { time: 8, target: [2.35, 0, 0.5], position: [7, -5, 3.8] },
  { time: 11, target: [2.35, 0, 1.29], position: [4.15, -1.75, 2.12] },
  { time: 12, target: [2.35, 0, 1.29], position: [4.15, -1.75, 2.12] },
  { time: 16, target: [2.35, 0, 1.29], position: [0, -2.15, 2.32] },
  { time: 18, target: [2.35, 0, 1.29], position: [0, -2.15, 2.32] },
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
export function aircraftJourney(time: number, aspect = 1) {
  const t = Math.max(0, Math.min(18, time));
  const end = frames.findIndex((frame) => frame.time > t);
  const a = frames[end < 0 ? frames.length - 1 : Math.max(0, end - 1)];
  const b = frames[end < 0 ? frames.length - 1 : end];
  const blend = a === b ? 0 : ease((t - a.time) / (b.time - a.time));
  const target = a.target.map((v, k) => v + (b.target[k] - v) * blend) as Vec3;
  const offsetA = a.position.map((v, k) => v - a.target[k]);
  const offsetB = b.position.map((v, k) => v - b.target[k]);
  const lengthA = Math.hypot(...offsetA),
    lengthB = Math.hypot(...offsetB);
  const direction = offsetA.map(
    (v, k) => (v / lengthA) * (1 - blend) + (offsetB[k] / lengthB) * blend,
  );
  const norm = Math.hypot(...direction);
  const distance =
    Math.exp(Math.log(lengthA) * (1 - blend) + Math.log(lengthB) * blend) *
    Math.max(1, 1.2 / aspect) *
    (0.7 + 0.3 * ease((t - 2) / 4.5));
  const forward = direction.map((v) => v / norm) as Vec3;
  const planar = Math.hypot(forward[0], forward[1]);
  const right: Vec3 = [-forward[1] / planar, forward[0] / planar, 0];
  const up: Vec3 = [-forward[2] * right[1], forward[2] * right[0], planar];
  const ramp = (from: number, to: number) => ease((t - from) / (to - from));
  const spin = t < 4 ? t * 5 : t < 7 ? 20 + 7.5 * ((t - 4) / 3 - ((t - 4) / 3) ** 2 / 2) : 23.75;
  return {
    target,
    forward,
    right,
    up,
    distance,
    opening: ramp(12, 17),
    airframeAlpha: 1 - ramp(5, 9),
    otherBladeAlpha: 1 - ramp(9, 12),
    rotation: (spin - 23.75) * (1 - ramp(4, 7)),
  };
}
