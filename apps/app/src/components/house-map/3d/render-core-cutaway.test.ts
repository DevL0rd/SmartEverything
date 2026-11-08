import { Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { NOMINAL_WALL_HEIGHT_METRES, buildSceneGeometry } from './vacuum-geometry';
import { WallCutaway } from './render-core-cutaway';
import { scrubbedScene, vacuumInput } from './scene-input-fixture';
import { layerGeometry } from './render-core-orbit';

const geometry = buildSceneGeometry(vacuumInput(scrubbedScene));

const NONE_FULL: ReadonlySet<string> = new Set();

function wallsMesh(): Mesh {
  const layer = geometry.base.find((candidate) => candidate.id === 'walls');
  if (layer === undefined) throw new Error('no walls');
  return new Mesh(layerGeometry(layer), new MeshBasicMaterial());
}

function highest(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.max.y ?? 0;
}

describe('wall cutaway on the walls mesh', () => {
  it('updates the one merged mesh only when the cut changes', () => {
    const mesh = wallsMesh();
    const cutaway = WallCutaway.of(geometry, mesh);
    const iso = { azimuth: Math.PI / 5, polar: 0.95 };
    expect(cutaway.update(iso, NONE_FULL)).toBe(true);
    expect(cutaway.update({ ...iso, azimuth: iso.azimuth + 0.01 }, NONE_FULL)).toBe(false);
    expect(cutaway.view().cutIds.size).toBeGreaterThan(0);
    expect(highest(mesh)).toBeCloseTo(NOMINAL_WALL_HEIGHT_METRES, 5);
  });

  it('lowers every wall to the base strip for the top camera and leaves the source layer untouched', () => {
    const mesh = wallsMesh();
    const cutaway = WallCutaway.of(geometry, mesh);
    cutaway.update({ azimuth: 0, polar: 0.02 }, NONE_FULL);
    const everyWall = new Set(geometry.walls.map((span) => span.wallId));
    expect(cutaway.view()).toEqual({
      style: 'low',
      cutIds: everyWall,
      lowHeight: geometry.lowWallHeight,
    });
    expect(highest(mesh)).toBeCloseTo(geometry.cutHeight, 5);
    expect(highest(wallsMesh())).toBeGreaterThan(geometry.cutHeight);
    const source = geometry.base.find((candidate) => candidate.id === 'walls');
    expect(cutaway.pickLayer()?.positions).not.toEqual(source?.positions);
    cutaway.update({ azimuth: 0, polar: 0.95 }, NONE_FULL);
    expect(cutaway.view().cutIds.size).toBeLessThan(everyWall.size);
  });

  it('keeps a held wall at full height from the top camera and cuts it again once let go', () => {
    const mesh = wallsMesh();
    const cutaway = WallCutaway.of(geometry, mesh);
    const top = { azimuth: 0, polar: 0.02 };
    const held = geometry.walls[0]?.wallId;
    if (held === undefined) throw new Error('no walls');
    cutaway.update(top, new Set([held]));
    expect(cutaway.view().cutIds.has(held)).toBe(false);
    expect(cutaway.view().cutIds.size).toBe(new Set(geometry.walls.map((s) => s.wallId)).size - 1);
    expect(highest(mesh)).toBeGreaterThan(geometry.cutHeight);
    expect(cutaway.update(top, NONE_FULL)).toBe(true);
    expect(cutaway.view().cutIds.has(held)).toBe(true);
    expect(highest(mesh)).toBeCloseTo(geometry.cutHeight, 5);
  });
});
