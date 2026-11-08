import { describe, expect, it } from 'vitest';
import {
  shellyAreaToHousePolygons,
  shellyHousePointInArea,
  shellyHouseToSensor,
  shellySegmentToHousePolygon,
  shellySensorToHouse,
  type ShellyHousePose,
} from '../src/home-map-frames';
import {
  homeMapPointInPolygon,
  type HomeMapPolygonShape,
  type HomeMapVec,
} from '../src/home-map-geometry';

const expectPoint = (actual: { x: number; y: number }, x: number, y: number): void => {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
};

const corner = (polygon: HomeMapPolygonShape, index: number): HomeMapVec =>
  polygon.outer[index] ?? { x: Number.NaN, y: Number.NaN };

const pose = (x: number, y: number, yawDeg: number): ShellyHousePose => ({
  at: { x, y },
  yawDeg,
});

describe('shelly sensor to house transform (R1 vectors)', () => {
  it.each([
    { name: 'V1', at: pose(0, 0, 90), input: { x: 0, y: 2 }, x: 0, y: 2 },
    { name: 'V2', at: pose(0, 0, 90), input: { x: 1, y: 0 }, x: 1, y: 0 },
    { name: 'V3', at: pose(3, 2, 0), input: { x: 1, y: 2 }, x: 5, y: 1 },
    { name: 'V4', at: pose(4, 1, 180), input: { x: 1.5, y: 3 }, x: 1, y: 2.5 },
    { name: 'V5', at: pose(1, 1, 270), input: { x: -2, y: 1 }, x: 3, y: 0 },
    { name: 'yaw 90 offset', at: pose(2, 0, 90), input: { x: 1, y: 1 }, x: 3, y: 1 },
    { name: 'yaw 45 offset', at: pose(2, 0, 45), input: { x: 1, y: 1 }, x: 2 + Math.SQRT2, y: 0 },
  ])('$name maps the sensor point to the house point', ({ at, input, x, y }) => {
    expectPoint(shellySensorToHouse(at, input), x, y);
  });

  it('house to sensor inverts sensor to house for several poses', () => {
    const poses = [pose(0, 0, 0), pose(3, 2, 37), pose(-4, 1.5, 180), pose(1, 1, 270)];
    const points = [
      { x: 0, y: 0 },
      { x: 1.25, y: 3 },
      { x: -2, y: 7.5 },
    ];
    for (const at of poses) {
      for (const point of points) {
        expectPoint(shellyHouseToSensor(at, shellySensorToHouse(at, point)), point.x, point.y);
      }
    }
  });

  it('keeps y growing away from the sensor along the facing direction', () => {
    const at = pose(2, 3, 135);
    const near = shellySensorToHouse(at, { x: 0, y: 1 });
    expectPoint(near, 2 + Math.cos((135 * Math.PI) / 180), 3 + Math.sin((135 * Math.PI) / 180));
  });
});

describe('shelly zone segments to house polygons', () => {
  const segment = [0, 0, 2, 4] as const;

  it('V6 maps the segment to the expected rotated rectangle', () => {
    const polygon = shellySegmentToHousePolygon(pose(5, 5, 0), segment);
    expect(polygon.holes).toEqual([]);
    expect(polygon.outer).toHaveLength(4);
    const expected = [
      [5, 5],
      [5, 4],
      [7, 4],
      [7, 5],
    ];
    expected.forEach(([x, y], index) => {
      expectPoint(corner(polygon, index), x ?? 0, y ?? 0);
    });
  });

  it('accepts corners in any order', () => {
    const flipped = shellySegmentToHousePolygon(pose(5, 5, 0), [2, 4, 0, 0]);
    expect(flipped).toEqual(shellySegmentToHousePolygon(pose(5, 5, 0), segment));
  });

  it('keeps a 0.5 m cell edge on the rotated grid', () => {
    const polygon = shellySegmentToHousePolygon(pose(1, 2, 33), [3, 1, 4, 2]);
    const a = corner(polygon, 0);
    const b = corner(polygon, 1);
    const d = corner(polygon, 3);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.5, 9);
    expect(Math.hypot(d.x - a.x, d.y - a.y)).toBeCloseTo(0.5, 9);
  });

  it('puts the tracks inside the segment exactly inside the house polygon', () => {
    const at = pose(5, 5, 0);
    const polygon = shellySegmentToHousePolygon(at, segment);
    const inside = shellySensorToHouse(at, { x: 0.25, y: 1 });
    const outside = shellySensorToHouse(at, { x: -0.25, y: 1 });
    expectPoint(inside, 6, 4.75);
    expectPoint(outside, 6, 5.25);
    expect(homeMapPointInPolygon(polygon, inside)).toBe(true);
    expect(homeMapPointInPolygon(polygon, outside)).toBe(false);
  });

  it('converts every segment of an area, overlaps kept, no cell cap', () => {
    const big: readonly [number, number, number, number][] = [
      [0, 0, 200, 200],
      [10, 10, 20, 20],
    ];
    const polygons = shellyAreaToHousePolygons(pose(0, 0, 90), big);
    expect(polygons).toHaveLength(2);
    const first = polygons[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expectPoint(corner(first, 2), 100, 100);
    expectPoint(corner(first, 1), 100, 0);
  });
});

describe('shelly house point in area', () => {
  const area = [[0, 0, 2, 4]] as const;

  it('agrees with the sensor frame cell test on the rotated grid', () => {
    for (const yawDeg of [0, 90, 205]) {
      const at = pose(5, 5, yawDeg);
      expect(shellyHousePointInArea(at, area, shellySensorToHouse(at, { x: 0.25, y: 1 }))).toBe(
        true,
      );
      expect(shellyHousePointInArea(at, area, shellySensorToHouse(at, { x: -0.25, y: 1 }))).toBe(
        false,
      );
      expect(shellyHousePointInArea(at, area, shellySensorToHouse(at, { x: 0.25, y: 2.5 }))).toBe(
        false,
      );
    }
  });

  it('keeps the device tie rule on cell borders', () => {
    const at = pose(0, 0, 0);
    const onHighX = shellySensorToHouse(at, { x: 1, y: 1 });
    const onLowX = shellySensorToHouse(at, { x: 0, y: 1 });
    const onLowY = shellySensorToHouse(at, { x: 0.5, y: 0 });
    const onHighY = shellySensorToHouse(at, { x: 0.5, y: 2 });
    expect(shellyHousePointInArea(at, area, onHighX)).toBe(true);
    expect(shellyHousePointInArea(at, area, onLowX)).toBe(false);
    expect(shellyHousePointInArea(at, area, onLowY)).toBe(true);
    expect(shellyHousePointInArea(at, area, onHighY)).toBe(false);
  });
});
