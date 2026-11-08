import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import {
  homeMapAutoPlace,
  type HomeMapAutoDevice,
  type HomeMapAutoFacts,
  type HomeMapAutoOccupant,
  type HomeMapAutoPlaceInput,
  type HomeMapAutoRole,
} from '../src/home-map-auto-place';
import { HOME_MAP_FLOOR_ID } from '../src/home-map-elements';
import { homeMapPointInPolygon, type HomeMapPolygonShape } from '../src/home-map-geometry';
import { HOME_MAP_PLACEMENT_WRITE, type HomeMapPlacement } from '../src/home-map-placement';

const FACTS: Readonly<Record<string, HomeMapAutoFacts>> = {
  lamp: { mount: 'floor', defaultHeightM: 0, footprint: { w: 0.3, d: 0.3, h: 1.5 } },
  purifier: { mount: 'floor', defaultHeightM: 0, footprint: { w: 0.5, d: 0.5, h: 0.7 } },
  speaker: { mount: 'table', defaultHeightM: 0.75, footprint: { w: 0.2, d: 0.2, h: 0.2 } },
  tv: { mount: 'wall', defaultHeightM: 1, footprint: { w: 1.2, d: 0.08, h: 0.7 } },
  switch: { mount: 'wall', defaultHeightM: 1.2, footprint: { w: 0.08, d: 0.02, h: 0.08 } },
  ac: { mount: 'wall', defaultHeightM: 2, footprint: { w: 0.9, d: 0.2, h: 0.3 } },
  camera: {
    mount: 'wall',
    defaultHeightM: 2,
    footprint: { w: 0.1, d: 0.1, h: 0.1 },
    fov: { hDeg: 110, vDeg: 60, rangeM: 8, exact: true },
  },
  presence: {
    mount: 'wall',
    defaultHeightM: 1.5,
    footprint: { w: 0.1, d: 0.03, h: 0.1 },
    fov: { hDeg: 120, vDeg: 90, rangeM: 6, exact: false },
  },
  bulb: { mount: 'ceiling', defaultHeightM: 2.6, footprint: { w: 0.2, d: 0.2, h: 0.1 } },
  sofa: { mount: 'floor', defaultHeightM: 0, footprint: { w: 2, d: 0.9, h: 0.85 } },
  wardrobe: { mount: 'floor', defaultHeightM: 0, footprint: { w: 1, d: 0.6, h: 2 } },
  shelf: { mount: 'wall', defaultHeightM: 1.5, footprint: { w: 0.8, d: 0.25, h: 0.3 } },
};

const facts = (modelId: string): HomeMapAutoFacts =>
  FACTS[modelId] ?? { mount: 'floor', defaultHeightM: 0, footprint: { w: 0.5, d: 0.5, h: 0.5 } };

const square = (size: number): HomeMapPolygonShape => ({
  outer: [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ],
  holes: [],
});

const L_ROOM: HomeMapPolygonShape = {
  outer: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 6 },
    { x: 0, y: 6 },
  ],
  holes: [],
};

const HALL: HomeMapPolygonShape = {
  outer: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 1 },
    { x: 0, y: 1 },
  ],
  holes: [],
};

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const device = (
  n: number,
  modelId: string,
  role: HomeMapAutoRole = 'generic',
): HomeMapAutoDevice => ({
  deviceId: uuid(n),
  modelId,
  role,
});

const run = (
  polygon: HomeMapPolygonShape,
  devices: readonly HomeMapAutoDevice[],
  extra: Partial<Pick<HomeMapAutoPlaceInput, 'openings' | 'occupants' | 'room'>> = {},
): ReturnType<typeof homeMapAutoPlace> =>
  homeMapAutoPlace({
    floorId: HOME_MAP_FLOOR_ID.parse('floor-1'),
    room: extra.room ?? { polygon, ceilingHeight: 2.6 },
    openings: extra.openings ?? [],
    occupants: extra.occupants ?? [],
    devices,
    facts,
  });

const placed = (result: ReturnType<typeof homeMapAutoPlace>, n: number): HomeMapPlacement => {
  const found = result.placements.find((p) => p.deviceId === uuid(n));
  if (!found) throw new Error(`device ${String(n)} was not placed`);
  return found;
};

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

const box = (at: { x: number; y: number }, modelId: string, quarterTurn: boolean): Box => {
  const { w, d } = facts(modelId).footprint;
  const hx = (quarterTurn ? w : d) / 2;
  const hy = (quarterTurn ? d : w) / 2;
  return { x0: at.x - hx, x1: at.x + hx, y0: at.y - hy, y1: at.y + hy };
};

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;

const occupant = (
  modelId: string,
  x: number,
  y: number,
  rotation: number,
): HomeMapAutoOccupant => ({
  modelId,
  at: { x, y },
  rotation,
});

const SOFA = occupant('sofa', 2, 0.45, 90);
const WARDROBE = occupant('wardrobe', 0.3, 2, 0);

describe('exports', () => {
  it('is reachable from the domain index and the output is a strict placement', () => {
    expect(domain.homeMapAutoPlace).toBe(homeMapAutoPlace);
    const result = run(square(4), [
      device(1, 'lamp'),
      device(2, 'tv', 'tv'),
      device(3, 'camera', 'camera'),
      device(4, 'bulb'),
    ]);
    expect(result.unplaced).toEqual([]);
    for (const placement of result.placements) {
      expect(HOME_MAP_PLACEMENT_WRITE.safeParse(placement).success).toBe(true);
      expect(placement.auto).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('gives the same result for any input order and sorts by device id', () => {
    const devices = [
      device(5, 'lamp', 'corner'),
      device(2, 'tv', 'tv'),
      device(9, 'bulb'),
      device(1, 'camera', 'camera'),
      device(7, 'purifier', 'corner'),
      device(3, 'ac', 'ac'),
    ];
    const forward = run(L_ROOM, devices, { occupants: [SOFA] });
    const backward = run(L_ROOM, [...devices].reverse(), { occupants: [SOFA] });
    expect(backward).toEqual(forward);
    const ids = forward.placements.map((p) => p.deviceId);
    expect(ids).toEqual([...ids].sort());
  });

  it('places nothing in a room without area and reports every device unplaced', () => {
    const flat: HomeMapPolygonShape = {
      outer: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
      ],
      holes: [],
    };
    const result = run(flat, [device(2, 'lamp'), device(1, 'tv', 'tv')]);
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toEqual([uuid(1), uuid(2)]);
  });
});

describe('L shaped room', () => {
  it('puts one ceiling light at the pole of inaccessibility', () => {
    const at = placed(run(L_ROOM, [device(1, 'bulb')]), 1);
    expect(at.mount).toBe('ceiling');
    expect(at.height).toBe(2.6);
    expect(at.at.x).toBeCloseTo(1.1716, 1);
    expect(at.at.y).toBeCloseTo(1.1716, 1);
  });

  it('spreads several ceiling lights inside the polygon and apart', () => {
    const result = run(L_ROOM, [device(1, 'bulb'), device(2, 'bulb'), device(3, 'bulb')]);
    const points = result.placements.map((p) => p.at);
    expect(result.unplaced).toEqual([]);
    for (const p of points) expect(homeMapPointInPolygon(L_ROOM, p)).toBe(true);
    for (const [i, a] of points.entries()) {
      for (const b of points.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    }
  });

  it('places cameras only in convex corners, facing the room centre, then spreads them', () => {
    const result = run(L_ROOM, [device(1, 'camera', 'camera'), device(2, 'camera', 'camera')]);
    const first = placed(result, 1);
    const second = placed(result, 2);
    expect(first.height).toBe(2.2);
    expect(first.tilt).toBe(20);
    expect(first.mount).toBe('wall');
    expect(first.at.x).toBeGreaterThan(5.8);
    expect(first.at.y).toBeLessThan(0.2);
    const toCentre = (Math.atan2(1.1716 - first.at.y, 1.1716 - first.at.x) * 180) / Math.PI;
    expect(first.rotation).toBeCloseTo((toCentre + 360) % 360, 0);
    expect(first.camera).toMatchObject({ hfovDeg: 110, rangeM: 8, fovSource: 'exact' });
    expect(first.camera?.pan).toMatchObject({ mode: 'fixed', yawDeg: first.rotation });
    expect(second.at.x).toBeLessThan(0.2);
    expect(second.at.y).toBeGreaterThan(5.8);
    for (const corner of [first, second]) {
      expect(Math.hypot(corner.at.x - 2, corner.at.y - 2)).toBeGreaterThan(1);
    }
  });

  it('puts the TV on the longest wall, centred and facing inward', () => {
    const tv = placed(run(L_ROOM, [device(1, 'tv', 'tv')]), 1);
    expect(tv.at.x).toBeCloseTo(3, 6);
    expect(tv.at.y).toBeCloseTo(0.04, 6);
    expect(tv.rotation).toBeCloseTo(90, 6);
    expect(tv.height).toBe(1);
  });

  it('keeps floor devices inside the polygon with the wall clearance', () => {
    const result = run(L_ROOM, [device(1, 'purifier', 'corner'), device(2, 'lamp', 'corner')]);
    expect(result.unplaced).toEqual([]);
    for (const p of result.placements) {
      expect(homeMapPointInPolygon(L_ROOM, p.at)).toBe(true);
      expect(Math.min(p.at.x, p.at.y)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });
});

describe('narrow hall', () => {
  it('fits a lamp, leaves a purifier unplaced and spreads ceiling lights along the length', () => {
    const result = run(HALL, [
      device(1, 'lamp', 'corner'),
      device(2, 'purifier', 'corner'),
      device(3, 'bulb'),
      device(4, 'bulb'),
      device(5, 'bulb'),
    ]);
    expect(placed(result, 1).at.y).toBeCloseTo(0.5, 6);
    expect(result.unplaced).toEqual([uuid(2)]);
    const xs = [3, 4, 5].map((n) => placed(result, n).at.x);
    expect(xs).toEqual([1, 3, 5]);
  });

  it('puts the TV centred on the long wall and a presence sensor clear of it on the same wall', () => {
    const result = run(HALL, [device(1, 'tv', 'tv'), device(2, 'presence', 'presence')]);
    const tv = placed(result, 1);
    const sensor = placed(result, 2);
    expect(tv.at.x).toBeCloseTo(3, 6);
    expect(sensor.at.y).toBeCloseTo(0.015, 6);
    expect(Math.abs(sensor.at.x - 3)).toBeGreaterThanOrEqual(0.65);
    expect(sensor.camera).toMatchObject({ fovSource: 'estimated' });
    expect(sensor.height).toBe(1.5);
  });
});

describe('furnished room', () => {
  const occupants = [SOFA, WARDROBE];

  it('keeps floor devices off furniture, off each other and clear of the walls', () => {
    const result = run(
      square(4),
      [
        device(1, 'lamp', 'corner'),
        device(2, 'lamp', 'corner'),
        device(3, 'purifier', 'corner'),
        device(4, 'speaker'),
      ],
      { occupants },
    );
    expect(result.unplaced).toEqual([]);
    const boxes = result.placements.map((p, i) =>
      box(p.at, ['lamp', 'lamp', 'purifier', 'speaker'][i] ?? 'lamp', true),
    );
    const furniture = [box(SOFA.at, 'sofa', true), box(WARDROBE.at, 'wardrobe', false)];
    for (const [i, a] of boxes.entries()) {
      for (const f of furniture) expect(boxesOverlap(a, f)).toBe(false);
      for (const b of boxes.slice(i + 1)) expect(boxesOverlap(a, b)).toBe(false);
    }
    expect(placed(result, 1).at).toEqual({ x: 0.5, y: 0.5 });
    expect(placed(result, 4).mount).toBe('table');
    expect(placed(result, 4).height).toBe(0.75);
  });

  it('lets a low sofa sit under the TV but not a tall wardrobe', () => {
    const lowSofa = placed(run(square(4), [device(1, 'tv', 'tv')], { occupants: [SOFA] }), 1);
    expect(lowSofa.at.x).toBeCloseTo(2, 6);
    const blocker = occupant('wardrobe', 2, 0.3, 90);
    const moved = placed(run(square(4), [device(1, 'tv', 'tv')], { occupants: [blocker] }), 1);
    expect(moved.at.x).toBeCloseTo(0.9, 6);
    expect(moved.at.y).toBeCloseTo(0.04, 6);
  });

  it('puts a switch beside the door and the air conditioner high on a wall', () => {
    const door = { from: { x: 1.5, y: 0 }, to: { x: 2.4, y: 0 } };
    const result = run(square(4), [device(1, 'switch', 'switch'), device(2, 'ac', 'ac')], {
      openings: [door],
    });
    const sw = placed(result, 1);
    expect(sw.at.x).toBeCloseTo(2.59, 6);
    expect(sw.at.y).toBeCloseTo(0.01, 6);
    expect(sw.height).toBe(1.2);
    expect(sw.rotation).toBeCloseTo(90, 6);
    expect(placed(result, 2).height).toBeCloseTo(2.3, 6);
  });

  it('keeps a wall device off a wall mounted object and an opening', () => {
    const door = { from: { x: 1.5, y: 0 }, to: { x: 2.5, y: 0 } };
    const shelf = occupant('shelf', 3, 0.125, 90);
    const result = run(square(4), [device(1, 'tv', 'tv')], {
      openings: [door],
      occupants: [shelf],
    });
    const tv = placed(result, 1);
    expect(tv.at.x).toBeCloseTo(0.8, 6);
    expect(tv.at.y).toBeCloseTo(0.04, 6);
  });

  it('does not reuse an occupied ceiling spot', () => {
    const existing = occupant('bulb', 2, 1, 0);
    const result = run(square(4), [device(1, 'bulb')], { occupants: [existing] });
    expect(placed(result, 1).at).toEqual({ x: 2, y: 3 });
  });
});
