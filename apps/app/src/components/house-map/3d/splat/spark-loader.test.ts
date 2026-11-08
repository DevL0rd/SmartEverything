import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { SplatEditRgbaBlendMode, SplatEditSdfType, SplatFileType } from '@sparkjsdev/spark';
import { applyPlacement, createBandEdit, sparkFileType, type HeightBand } from './spark-loader';

function hiddenAt(band: HeightBand, point: Vector3): boolean {
  const edit = createBandEdit(band);
  const distances = (edit.sdfs ?? []).map((plane) => plane.worldToLocal(point.clone()).z);
  return Math.min(...distances) < 0;
}

describe('sparkFileType', () => {
  it('maps every stored scan format to the Spark file type', () => {
    expect(sparkFileType('ply')).toBe(SplatFileType.PLY);
    expect(sparkFileType('splat')).toBe(SplatFileType.SPLAT);
    expect(sparkFileType('spz')).toBe(SplatFileType.SPZ);
    expect(sparkFileType('rad')).toBe(SplatFileType.RAD);
  });
});

describe('createBandEdit', () => {
  const groundFloor: HeightBand = { bottom: 0, top: 2.6 };

  it('fades splats to zero opacity with two half spaces', () => {
    const edit = createBandEdit(groundFloor);

    expect(edit.rgbaBlendMode).toBe(SplatEditRgbaBlendMode.MULTIPLY);
    expect(edit.invert).toBe(false);
    expect(edit.sdfs?.map((sdf) => [sdf.type, sdf.opacity])).toEqual([
      [SplatEditSdfType.PLANE, 0],
      [SplatEditSdfType.PLANE, 0],
    ]);
  });

  it('keeps splats inside the floor band and hides those below and above it', () => {
    expect(hiddenAt(groundFloor, new Vector3(3, 1.2, -7))).toBe(false);
    expect(hiddenAt(groundFloor, new Vector3(-40, 0.01, 25))).toBe(false);
    expect(hiddenAt(groundFloor, new Vector3(0, -0.3, 0))).toBe(true);
    expect(hiddenAt(groundFloor, new Vector3(0, 2.9, 0))).toBe(true);
    expect(hiddenAt(groundFloor, new Vector3(120, 5.5, -80))).toBe(true);
  });

  it('reads a band given top first the same way', () => {
    const upstairs: HeightBand = { bottom: 5.4, top: 2.8 };

    expect(hiddenAt(upstairs, new Vector3(0, 4, 0))).toBe(false);
    expect(hiddenAt(upstairs, new Vector3(0, 1, 0))).toBe(true);
    expect(hiddenAt(upstairs, new Vector3(0, 6, 0))).toBe(true);
  });
});

describe('applyPlacement', () => {
  it('moves, turns about the vertical axis and scales the scan uniformly', () => {
    const target = new Group();

    applyPlacement(target, { x: 2, y: 0.5, z: -1, yawDeg: 90, scale: 2 });
    const corner = target.localToWorld(new Vector3(1, 0, 0));

    expect(corner.x).toBeCloseTo(2);
    expect(corner.y).toBeCloseTo(0.5);
    expect(corner.z).toBeCloseTo(-3);
    expect(target.scale.toArray()).toEqual([2, 2, 2]);
  });
});
