import { describe, expect, it } from 'vitest';
import { Color, Quaternion, Vector3 } from 'three';
import { PackedSplats } from '@sparkjsdev/spark';
import { scanPlanExtent, type SplatRead } from './scan-footprint';

const SIDE = 10;

const STEP_M = 0.2;

function syntheticScan(): PackedSplats {
  const splats = new PackedSplats({ maxSplats: SIDE * SIDE * 2 });
  for (const height of [0.1, 2.9]) {
    for (let index = 0; index < SIDE * SIDE; index += 1) {
      splats.pushSplat(
        new Vector3((index % SIDE) * STEP_M, height, -Math.floor(index / SIDE) * STEP_M),
        new Vector3(0.05, 0.02, 0.05),
        new Quaternion(),
        0.9,
        new Color(0xff0000),
      );
    }
  }
  return splats;
}

describe('scanPlanExtent', () => {
  it('bounds the scan plan with map y pointing away from the scan z axis', () => {
    const extent = scanPlanExtent(syntheticScan());

    expect(extent?.minX).toBeCloseTo(0);
    expect(extent?.minY).toBeCloseTo(0);
    expect(extent?.maxX).toBeCloseTo((SIDE - 1) * STEP_M);
    expect(extent?.maxY).toBeCloseTo((SIDE - 1) * STEP_M);
  });

  it('has no extent for an empty scan or one without any floor area', () => {
    expect(scanPlanExtent(new PackedSplats({ maxSplats: 1 }))).toBeNull();
    const line = {
      numSplats: 2,
      getSplat: (index: number): SplatRead => ({ center: { x: index, y: 0, z: 0 } }),
    };

    expect(scanPlanExtent(line)).toBeNull();
  });
});
