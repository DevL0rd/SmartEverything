import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('three contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'three')).toBe(installedVersion('three'));
  });

  it('has type definitions of the same minor release', () => {
    const [major, minor] = installedVersion('three').split('.');
    expect(declaredVersion(APP_MANIFEST, '@types/three')).toMatch(
      new RegExp(`^${String(major)}\\.${String(minor)}\\.\\d+$`),
    );
    expect(installedVersion('@types/three')).toBe(declaredVersion(APP_MANIFEST, '@types/three'));
  });

  it('triangulates a concave outline into corners minus two triangles', () => {
    const outline = [
      new Vector2(0, 0),
      new Vector2(4, 0),
      new Vector2(4, 4),
      new Vector2(2, 1),
      new Vector2(0, 4),
    ];
    const faces = ShapeUtils.triangulateShape(outline, []);
    expect(faces).toHaveLength(3);
    expect(new Set(faces.flat())).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('measures a polygon area signed by its winding', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(ShapeUtils.area(square)).toBe(4);
    expect(ShapeUtils.area(square.toReversed())).toBe(-4);
  });

  it('builds indexed buffer geometry that the renderer can bound without a browser', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, -1]), 3),
    );
    geometry.setIndex(new BufferAttribute(Uint32Array.from([0, 1, 2]), 1));
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.toArray()).toEqual([1, 0, 0]);
    expect(geometry.boundingBox?.min.toArray()).toEqual([0, 0, -1]);
    expect(geometry.index?.count).toBe(3);
  });
});
