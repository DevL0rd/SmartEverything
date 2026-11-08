import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { XIAOMI_SMART_TOWER_FAN_2_MODEL as FAN } from '../../src/models/fan';

type Part = ModelSpec['parts'][number];

const DEGREE = Math.PI / 180;

function part(id: string): Part {
  const found = FAN.parts.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no part ${id}`);
  return found;
}

function numbers(values: readonly unknown[] | undefined): readonly number[] {
  return (values ?? []).map((value) => (typeof value === 'number' ? value : 0));
}

interface Box {
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly halfDepth: number;
  readonly rows: readonly number[];
}

function boxOf(entry: Part): Box {
  const { geometry } = entry;
  if (geometry.type === 'slats') {
    const span = (geometry.count - 1) * Number(geometry.spacing);
    const rows = Array.from(
      { length: geometry.count },
      (_, index) => span / 2 - index * Number(geometry.spacing),
    );
    const halfHeight = Number(geometry.height) / 2;
    return {
      halfWidth: Number(geometry.width) / 2,
      halfHeight,
      halfDepth: Number(geometry.depth) / 2,
      rows,
    };
  }
  if (geometry.type !== 'roundedBox') throw new Error(`${entry.id} is not a box`);
  const halfHeight = Number(geometry.height) / 2;
  return {
    halfWidth: Number(geometry.width) / 2,
    halfHeight,
    halfDepth: Number(geometry.depth) / 2,
    rows: [0],
  };
}

function corners(entry: Part): readonly (readonly [number, number, number])[] {
  const box = boxOf(entry);
  const [px = 0, py = 0, pz = 0] = numbers(entry.transform?.position);
  const tilt = (numbers(entry.transform?.rotation)[0] ?? 0) * DEGREE;
  return box.rows.flatMap((row) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) =>
        [-1, 1].map((sz): readonly [number, number, number] => {
          const y = row + sy * box.halfHeight;
          const z = sz * box.halfDepth;
          return [
            px + sx * box.halfWidth,
            py + y * Math.cos(tilt) - z * Math.sin(tilt),
            pz + y * Math.sin(tilt) + z * Math.cos(tilt),
          ];
        }),
      ),
    ),
  );
}

function shellRadius(y: number): number {
  const column = part('column').geometry;
  if (column.type !== 'cylinder') throw new Error('column is not a cylinder');
  const top = Number(column.topRadius);
  const bottom = Number(column.bottomRadius);
  const height = Number(column.height);
  return bottom + ((top - bottom) * (y + height / 2)) / height;
}

describe('Xiaomi Smart Tower Fan 2 model', () => {
  it('is a valid spec', () => {
    expect(MODEL_SPEC.safeParse(FAN).success).toBe(true);
  });

  it('keeps every louvre slat inside the slot and against the tapered shell', () => {
    const slot = corners(part('slotInterior'));
    const slotTop = Math.max(...slot.map(([, y]) => y));
    const slotBottom = Math.min(...slot.map(([, y]) => y));
    const slotSide = Math.max(...slot.map(([x]) => Math.abs(x)));
    for (const [x, y, z] of corners(part('louvres'))) {
      expect(Math.abs(x)).toBeLessThanOrEqual(slotSide);
      expect(y).toBeLessThanOrEqual(slotTop);
      expect(y).toBeGreaterThanOrEqual(slotBottom);
      expect(z - shellRadius(y)).toBeLessThan(0.002);
      expect(z - shellRadius(y)).toBeGreaterThan(-0.01);
    }
  });

  it('sweeps the whole column so the slats turn with the shell', () => {
    const sweep = FAN.channels?.find((channel) => channel.id === 'sweep');
    expect(sweep?.target).toBe('column');
    expect(part('louvres').parent).toBe('column');
    expect(part('slotInterior').parent).toBe('column');
  });
});
