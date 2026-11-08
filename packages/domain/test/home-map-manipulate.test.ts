import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import {
  homeMapBoxCorners,
  homeMapEditToWorld,
  homeMapHandlePoints,
  homeMapObjectBox,
} from '../src/home-map-manipulate-base';
import {
  homeMapPinchTwist,
  homeMapResize,
  homeMapRotateStep,
  homeMapRotateTo,
} from '../src/home-map-manipulate';
import { homeMapMoveObject, homeMapObjectGuides } from '../src/home-map-manipulate-move';
import type {
  HomeMapEditFacts,
  HomeMapEditFactsFn,
  HomeMapEditObject,
  HomeMapResizeOptions,
} from '../src/home-map-manipulate-types';

const SOFA: HomeMapEditFacts = {
  sizeParams: [
    { name: 'width', axis: 'width', min: 1, max: 4, scale: 1, extra: 0, resizes: true },
    { name: 'depth', axis: 'depth', min: 0.6, max: 1.2, scale: 1, extra: 0, resizes: true },
    { name: 'height', axis: 'height', min: 0.6, max: 1.2, scale: 1, extra: 0, resizes: true },
  ],
  presets: [],
  derive: (params) => ({ seats: Math.round((params['width'] ?? 0) / 0.9) }),
};

const BED: HomeMapEditFacts = {
  sizeParams: [
    { name: 'width', axis: 'width', min: 0.6, max: 2.5, scale: 1, extra: 0, resizes: true },
    { name: 'length', axis: 'depth', min: 1.5, max: 2.5, scale: 1, extra: 0, resizes: true },
  ],
  presets: [
    { id: 'single', label: 'Single', params: { width: 0.9, length: 2 } },
    { id: 'queen', label: 'Queen', params: { width: 1.6, length: 2 } },
    { id: 'king', label: 'King', params: { width: 1.8, length: 2 } },
  ],
};

const FACTS: Record<string, HomeMapEditFacts> = { 'cat.sofa': SOFA, 'cat.bed': BED };
const editFacts: HomeMapEditFactsFn = (modelId) => FACTS[modelId];

const object = (overrides: Partial<HomeMapEditObject> = {}): HomeMapEditObject => ({
  id: 'sofa-1',
  modelId: 'cat.sofa',
  at: { x: 0, y: 0 },
  rotation: 0,
  params: { width: 2, depth: 0.9, height: 0.8, seats: 2 },
  footprint: { w: 2, d: 0.9 },
  locked: false,
  ...overrides,
});

const FREE: HomeMapResizeOptions = { gridM: null, presetRadiusM: null, keepProportions: false };
const GRID: HomeMapResizeOptions = { gridM: 0.1, presetRadiusM: null, keepProportions: false };

describe('handles', () => {
  const view = { touchM: 0.2, stemM: 0.3 };

  it('places 8 resize handles and the rotation handle on a stem above the top edge', () => {
    const box = homeMapObjectBox(object(), SOFA);
    const points = homeMapHandlePoints(box, false, view);
    expect(points.map((p) => p.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']);
    expect(points.find((p) => p.id === 'ne')?.at).toEqual({ x: 0.45, y: -1 });
    expect(points.find((p) => p.id === 'rotate')?.at).toEqual({ x: 0, y: -1.3 });
    expect(points.every((p) => !p.outside)).toBe(true);
  });

  it('follows the rotation of the object', () => {
    const box = homeMapObjectBox(object({ rotation: 90 }), SOFA);
    const rotate = homeMapHandlePoints(box, false, view).find((p) => p.id === 'rotate');
    expect(rotate?.at.x).toBeCloseTo(1.3);
    expect(rotate?.at.y).toBeCloseTo(0);
  });

  it('moves the handles outside an object too small for them', () => {
    const box = { at: { x: 0, y: 0 }, rotation: 0, w: 0.1, d: 0.1 };
    const points = homeMapHandlePoints(box, false, view);
    expect(points.every((p) => p.outside)).toBe(true);
    expect(points.find((p) => p.id === 'ne')?.at).toEqual({ x: 0.2, y: -0.2 });
  });

  it('shows no handles on a locked object', () => {
    expect(homeMapHandlePoints(homeMapObjectBox(object(), SOFA), true, view)).toEqual([]);
  });
});

describe('resize', () => {
  it('drags one edge with the opposite edge anchored and reports the live label', () => {
    const result = homeMapResize({
      object: object(),
      facts: editFacts('cat.sofa'),
      handle: 'n',
      pointer: { x: 0, y: -1.5 },
      options: GRID,
    });
    expect(result.box.w).toBeCloseTo(2.5);
    expect(result.box.d).toBeCloseTo(0.9);
    expect(result.box.at.x).toBeCloseTo(0);
    expect(result.box.at.y).toBeCloseTo(-0.25);
    expect(result.box.at.y + result.box.w / 2).toBeCloseTo(1);
    expect(result.labels).toHaveLength(1);
    expect(result.labels[0]?.axis).toBe('width');
    expect(result.labels[0]?.valueM).toBeCloseTo(2.5);
    expect(result.labels[0]?.at.y).toBeCloseTo(-1.5);
    expect(result.ghost).toEqual(homeMapBoxCorners(homeMapObjectBox(object(), SOFA)));
  });

  it('drags an edge of a rotated object along its own axis and clamps to the model range', () => {
    const result = homeMapResize({
      object: object({ rotation: 90 }),
      facts: SOFA,
      handle: 'e',
      pointer: { x: 0, y: 1.55 },
      options: GRID,
    });
    expect(result.box.d).toBeCloseTo(1.2);
    expect(result.box.at.x).toBeCloseTo(0);
    expect(result.box.at.y).toBeCloseTo(0.15);
    expect(result.box.at.y - result.box.d / 2).toBeCloseTo(-0.45);
  });

  it('keeps the opposite corner fixed when a corner is dragged on a rotated object', () => {
    const start = object({ rotation: 30 });
    const before = homeMapBoxCorners(homeMapObjectBox(start, SOFA));
    const pointer = homeMapEditToWorld({ at: start.at, rotation: 30 }, { x: 0.7, y: 1.4 });
    const result = homeMapResize({
      object: start,
      facts: SOFA,
      handle: 'se',
      pointer,
      options: FREE,
    });
    expect(result.box.d).toBeCloseTo(1.15);
    expect(result.box.w).toBeCloseTo(2.4);
    expect(result.corners[0]?.x).toBeCloseTo(before[0]?.x ?? NaN);
    expect(result.corners[0]?.y).toBeCloseTo(before[0]?.y ?? NaN);
    expect(result.labels.map((l) => l.axis)).toEqual(['depth', 'width']);
  });

  it('keeps proportions on a corner drag with Shift', () => {
    const result = homeMapResize({
      object: object(),
      facts: SOFA,
      handle: 'se',
      pointer: { x: 0.54, y: 1 },
      options: { ...FREE, keepProportions: true },
    });
    expect(result.box.d).toBeCloseTo(0.99);
    expect(result.box.w).toBeCloseTo(2.2);
    expect(result.box.d / result.box.w).toBeCloseTo(0.9 / 2);
  });

  it('keeps the proportions at the model limit instead of squashing one side', () => {
    const result = homeMapResize({
      object: object(),
      facts: SOFA,
      handle: 'se',
      pointer: { x: 5, y: 5 },
      options: { ...FREE, keepProportions: true },
    });
    expect(result.box.d / result.box.w).toBeCloseTo(0.9 / 2);
    expect(result.box.d).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it('does not resize an axis the model has no size parameter for', () => {
    const result = homeMapResize({
      object: object({ params: {} }),
      facts: undefined,
      handle: 'se',
      pointer: { x: 4, y: 4 },
      options: GRID,
    });
    expect(result.box.w).toBe(2);
    expect(result.box.d).toBe(0.9);
    expect(result.changed).toEqual({});
  });

  it('snaps to a size preset while dragging and says which', () => {
    const bed = object({
      id: 'bed-1',
      modelId: 'cat.bed',
      params: { width: 1.4, length: 2 },
      footprint: { w: 1.4, d: 2 },
    });
    const near = { gridM: null, presetRadiusM: 0.05, keepProportions: false };
    const snapped = homeMapResize({
      object: bed,
      facts: editFacts('cat.bed'),
      handle: 'n',
      pointer: { x: 0, y: -0.92 },
      options: near,
    });
    expect(snapped.preset).toBe('queen');
    expect(snapped.params['width']).toBeCloseTo(1.6);
    const off = homeMapResize({
      object: bed,
      facts: BED,
      handle: 'n',
      pointer: { x: 0, y: -0.92 },
      options: { ...near, presetRadiusM: null },
    });
    expect(off.preset).toBeNull();
    expect(off.params['width']).toBeCloseTo(1.62);
    const far = homeMapResize({
      object: bed,
      facts: BED,
      handle: 'n',
      pointer: { x: 0, y: -1.3 },
      options: near,
    });
    expect(far.preset).toBeNull();
  });

  it('clamps to the model minimum and updates derived parameters live through editFacts', () => {
    const result = homeMapResize({
      object: object(),
      facts: editFacts('cat.sofa'),
      handle: 'w',
      pointer: { x: 0, y: 0 },
      options: FREE,
    });
    expect(result.box.d).toBeCloseTo(0.6);
    const wide = homeMapResize({
      object: object(),
      facts: SOFA,
      handle: 's',
      pointer: { x: 0, y: 2.5 },
      options: GRID,
    });
    expect(wide.params['width']).toBeCloseTo(3.5);
    expect(wide.derived).toEqual({ seats: 4 });
    expect(wide.changed).toMatchObject({ seats: 4 });
    expect(wide.changed['depth']).toBeUndefined();
  });
});

describe('models whose size params are not their outer size', () => {
  const RUG: HomeMapEditFacts = {
    sizeParams: [
      { name: 'width', axis: 'width', min: 1.2, max: 4, scale: 1, extra: 0.12, resizes: true },
    ],
    presets: [],
  };
  const ROUND: HomeMapEditFacts = {
    sizeParams: [
      { name: 'diameter', axis: 'width', min: 0.6, max: 1.6, scale: 1, extra: 0, resizes: true },
      { name: 'diameter', axis: 'depth', min: 0.6, max: 1.6, scale: 1, extra: 0, resizes: true },
    ],
    presets: [],
  };
  const STOOL: HomeMapEditFacts = {
    sizeParams: [
      { name: 'height', axis: 'width', min: 0.5, max: 0.9, scale: 0.5, extra: 0.2, resizes: false },
      { name: 'height', axis: 'height', min: 0.5, max: 0.9, scale: 1, extra: 0, resizes: true },
    ],
    presets: [],
  };
  const piece = (params: Record<string, number>, w: number, d: number): HomeMapEditObject =>
    object({ modelId: 'cat.piece', params, footprint: { w, d } });

  it('shows the outer size and stores the param under it', () => {
    const rug = piece({ width: 2.4 }, 2.52, 1.7);
    expect(homeMapObjectBox(rug, RUG).w).toBeCloseTo(2.52);
    const result = homeMapResize({
      object: rug,
      facts: RUG,
      handle: 'n',
      pointer: { x: 0, y: -1.5 },
      options: FREE,
    });
    expect(result.box.w).toBeCloseTo(2.76);
    expect(result.params['width']).toBeCloseTo(2.64);
  });

  it('grows both axes of one param from either handle', () => {
    const table = piece({ diameter: 1 }, 1, 1);
    const result = homeMapResize({
      object: table,
      facts: ROUND,
      handle: 'e',
      pointer: { x: 0.8, y: 0 },
      options: FREE,
    });
    expect(result.params['diameter']).toBeCloseTo(1.3);
    expect(result.box.d).toBeCloseTo(1.3);
    expect(result.box.w).toBeCloseTo(1.3);
  });

  it('follows an axis another param drives without a handle for it', () => {
    const stool = piece({ height: 0.7 }, 0.55, 0.55);
    expect(homeMapObjectBox(stool, STOOL).w).toBeCloseTo(0.55);
    const result = homeMapResize({
      object: stool,
      facts: STOOL,
      handle: 'n',
      pointer: { x: 0, y: -1 },
      options: FREE,
    });
    expect(result.params['height']).toBe(0.7);
    expect(result.box.w).toBeCloseTo(0.55);
  });
});

describe('rotation', () => {
  const box = { at: { x: 0, y: 0 }, rotation: 0, w: 2, d: 1 };
  const toward = (deg: number): { x: number; y: number } => ({
    x: Math.cos((deg * Math.PI) / 180) * 3,
    y: Math.sin((deg * Math.PI) / 180) * 3,
  });

  it('turns the handle angle into a rotation, zero when the handle is straight above', () => {
    expect(homeMapRotateTo({ box, pointer: { x: 0, y: -3 }, stepDeg: 15 })).toBeCloseTo(0);
    expect(homeMapRotateTo({ box, pointer: { x: 3, y: 0 }, stepDeg: 15 })).toBeCloseTo(90);
    expect(homeMapRotateTo({ box, pointer: { x: 0, y: 3 }, stepDeg: null })).toBeCloseTo(180);
  });

  it('snaps to the 15 degree step or stays free', () => {
    expect(homeMapRotateTo({ box, pointer: toward(-38), stepDeg: 15 })).toBeCloseTo(45);
    expect(homeMapRotateTo({ box, pointer: toward(-38), stepDeg: null })).toBeCloseTo(52);
  });

  it('steps by the rotation step for the wheel and wraps', () => {
    expect(homeMapRotateStep(350, 1, 15)).toBe(0);
    expect(homeMapRotateStep(90, -1, 15)).toBe(75);
  });
});

describe('pinch and twist', () => {
  it('scales every size parameter together and derives the rest', () => {
    const result = homeMapPinchTwist({
      object: object(),
      facts: SOFA,
      scale: 1.2,
      twistDeg: 0,
      stepDeg: 15,
    });
    expect(result.params['width']).toBeCloseTo(2.4);
    expect(result.params['depth']).toBeCloseTo(1.08);
    expect(result.params['height']).toBeCloseTo(0.96);
    expect(result.derived).toEqual({ seats: 3 });
    expect(result.box.at).toEqual({ x: 0, y: 0 });
  });

  it('stops at the first model limit and keeps the proportions', () => {
    const big = homeMapPinchTwist({
      object: object(),
      facts: SOFA,
      scale: 3,
      twistDeg: 0,
      stepDeg: null,
    });
    expect(big.params['depth']).toBeCloseTo(1.2);
    expect(big.params['width'] ?? 0).toBeCloseTo(2 * (1.2 / 0.9));
    expect(big.params['height'] ?? 0).toBeCloseTo(0.8 * (1.2 / 0.9));
    const small = homeMapPinchTwist({
      object: object(),
      facts: SOFA,
      scale: 0.1,
      twistDeg: 0,
      stepDeg: null,
    });
    expect(small.params['height']).toBeCloseTo(0.6);
    expect(small.params['width'] ?? 0).toBeCloseTo(1.5);
  });

  it('twists with the step or free', () => {
    const base = { object: object(), facts: SOFA, scale: 1 };
    expect(homeMapPinchTwist({ ...base, twistDeg: 38, stepDeg: 15 }).box.rotation).toBe(45);
    expect(homeMapPinchTwist({ ...base, twistDeg: 38, stepDeg: null }).box.rotation).toBeCloseTo(
      38,
    );
  });
});

describe('move guides and wall snapping', () => {
  const box = { at: { x: 0, y: 0 }, rotation: 0, w: 1, d: 1 };
  const chair = { id: 'chair', box: { at: { x: 3, y: 0 }, rotation: 0, w: 2, d: 1 } };
  const options = { radiusM: 0.1, gridM: 0.1, hugWalls: false };

  it('snaps to another object edge and centre and returns the guides', () => {
    const result = homeMapMoveObject(
      box,
      { x: 2.04, y: 0.03 },
      { walls: [], others: [chair] },
      options,
    );
    expect(result.snap).toBe('object');
    expect(result.at.x).toBeCloseTo(2);
    expect(result.at.y).toBeCloseTo(0);
    expect(result.guides.map((g) => [g.orientation, g.kind, g.targetId])).toEqual([
      ['vertical', 'edge', 'chair'],
      ['horizontal', 'centre', 'chair'],
    ]);
    expect(result.guides[0]?.from).toEqual({ x: 2.5, y: -1 });
    expect(result.guides[0]?.to).toEqual({ x: 2.5, y: 1 });
  });

  it('falls back to the grid, or stays free with the grid off', () => {
    const near = homeMapMoveObject(
      box,
      { x: 0.04, y: 0.26 },
      { walls: [], others: [chair] },
      options,
    );
    expect(near.snap).toBe('grid');
    expect(near.at.x).toBeCloseTo(0);
    expect(near.at.y).toBeCloseTo(0.3);
    const off = homeMapMoveObject(
      box,
      { x: 0.04, y: 0.26 },
      { walls: [], others: [chair] },
      { ...options, gridM: null },
    );
    expect(off.snap).toBe('free');
    expect(off.at).toEqual({ x: 0.04, y: 0.26 });
  });

  it('puts the back against the wall and faces the room', () => {
    const wall = { from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, thickness: 0.2 };
    const small = { ...box, d: 0.6 };
    const result = homeMapMoveObject(
      small,
      { x: 2, y: 0.5 },
      { walls: [wall], others: [] },
      { radiusM: 0.15, gridM: 0.1, hugWalls: true },
    );
    expect(result.snap).toBe('wall');
    expect(result.wall).toBe(wall);
    expect(result.at.x).toBeCloseTo(2);
    expect(result.at.y).toBeCloseTo(0.4);
    expect(result.rotation).toBeCloseTo(90);
    const ignored = homeMapMoveObject(
      small,
      { x: 2, y: 0.5 },
      { walls: [wall], others: [] },
      { radiusM: 0.15, gridM: 0.1, hugWalls: false },
    );
    expect(ignored.snap).not.toBe('wall');
  });

  it('releases every snap with a zero radius (Alt)', () => {
    const result = homeMapMoveObject(
      box,
      { x: 2.04, y: 0.03 },
      { walls: [], others: [chair] },
      { ...options, radiusM: 0 },
    );
    expect(result).toMatchObject({ snap: 'free', at: { x: 2.04, y: 0.03 }, guides: [] });
  });

  it('reports no guide when nothing is within reach', () => {
    const found = homeMapObjectGuides({ ...box, at: { x: 10, y: 10 } }, [chair], 0.1);
    expect(found).toEqual({ dx: null, dy: null, guides: [] });
  });
});

describe('module wiring', () => {
  it('exports the manipulation maths from the domain index', () => {
    expect(domain.homeMapResize).toBe(homeMapResize);
    expect(domain.homeMapMoveObject).toBe(homeMapMoveObject);
    expect(domain.homeMapPinchTwist).toBe(homeMapPinchTwist);
    expect(domain.homeMapHandlePoints).toBe(homeMapHandlePoints);
    expect(domain.HOME_MAP_HANDLE_IDS).toHaveLength(8);
  });
});
