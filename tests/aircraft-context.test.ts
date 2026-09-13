import { describe, expect, it } from 'vitest';
import { aircraftGeometry } from '../src/components/book/aircraftGeometry';
import { teachingModel } from '../src/components/book/teachingModel';
import { atlasModelSchema } from '../src/domain/wikiAtlas';

const model = teachingModel();
const scenes = aircraftGeometry(model);

describe('aircraft teaching geometry', () => {
  it('remains compatible with the existing Atlas model contract', () => {
    expect(atlasModelSchema.safeParse(model).success).toBe(true);
    for (const parts of [model.body.parts, model.local.parts]) {
      expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
      expect(
        parts
          .filter((part) => part.assembly === 'under')
          .every((part) => ['under', 'roving', 'belt'].includes(part.group)),
      ).toBe(true);
      expect(parts.find((part) => part.group === 'web-core')?.assembly).toBe('upper');
    }
  });
  it('uses the same blade meshes when locating it on the aircraft and enlarging it', () => {
    for (const mesh of scenes.blade) {
      expect(scenes.aircraft).toContain(mesh);
      expect(scenes.propeller).toContain(mesh);
    }
    expect(scenes.aircraft.some((mesh) => mesh.group === 'wing')).toBe(true);
    expect(scenes.propeller.some((mesh) => mesh.group === 'wing')).toBe(false);
  });
  it('has finite nonempty triangle meshes with valid indices in every view', () => {
    for (const meshes of Object.values(scenes))
      for (const mesh of meshes) {
        expect(mesh.vertices.length).toBeGreaterThan(8);
        expect(mesh.vertices.every(Number.isFinite)).toBe(true);
        expect(mesh.indices.length % 3).toBe(0);
        expect(
          mesh.indices.every(
            (index) => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length / 3,
          ),
        ).toBe(true);
      }
  });
  it('keeps the web with the fixed assembly while the opposite flange follows under', () => {
    const local = scenes.section;
    expect(local.find((mesh) => mesh.group === 'web')?.assembly).toBe('upper');
    expect(local.filter((mesh) => mesh.group === 'flange').map((mesh) => mesh.assembly)).toContain(
      'under',
    );
    expect(local.some((mesh) => mesh.group === 'upper')).toBe(true);
    expect(local.some((mesh) => mesh.group === 'under')).toBe(true);
  });
});
