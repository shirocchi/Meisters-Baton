import { describe, expect, it } from 'vitest';
import { aircraftJourney } from '../src/components/book/aircraftJourney';

describe('continuous aircraft journey', () => {
  it('keeps the camera and visibility continuous on both sides of every keyframe', () => {
    for (const time of [2, 4, 5, 6.5, 7, 8, 9, 11, 12, 16, 17]) {
      const a = aircraftJourney(time - 0.0001),
        b = aircraftJourney(time + 0.0001);
      expect(Math.abs(a.distance - b.distance)).toBeLessThan(0.01);
      expect(Math.hypot(...a.target.map((v, i) => v - b.target[i]))).toBeLessThan(0.01);
      expect(Math.hypot(...a.forward.map((v, i) => v - b.forward[i]))).toBeLessThan(0.01);
      expect(Math.abs(a.rotation - b.rotation)).toBeLessThan(0.01);
      expect(Math.abs(a.opening - b.opening)).toBeLessThan(0.01);
    }
  });
  it('reveals the same upper assembly only after the other blade and airframe fade', () => {
    expect(aircraftJourney(0)).toMatchObject({ opening: 0, airframeAlpha: 1, otherBladeAlpha: 1 });
    expect(aircraftJourney(12)).toMatchObject({ opening: 0, airframeAlpha: 0, otherBladeAlpha: 0 });
    expect(aircraftJourney(18)).toMatchObject({
      opening: 1,
      airframeAlpha: 0,
      otherBladeAlpha: 0,
      rotation: 0,
    });
    for (const aspect of [0.45, 1, 1.5, 2.5]) {
      const pose = aircraftJourney(15, aspect);
      expect(pose.distance).toBeGreaterThan(0);
      expect(Math.hypot(...pose.forward)).toBeCloseTo(1);
      expect(Math.hypot(...pose.up)).toBeCloseTo(1);
    }
  });
});
