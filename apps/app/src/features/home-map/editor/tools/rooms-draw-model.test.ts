import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_ROOM_WRITE,
  homeMapPointInPolygon,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSnapWall,
  type HomeMapVec,
} from '@smarteverything/domain';
import {
  EDIT_OVERLAY,
  NO_EDIT_OVERLAY,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  draftCorners,
  draftGhosts,
  draftLabels,
  draftShapes,
  exampleMarks,
  exampleRing,
  guideLabels,
  labelPoint,
  nextColourSlot,
} from './rooms-draw-geometry';
import {
  IDLE_DRAW,
  chooseShape,
  finishPolygon,
  hitRadiusM,
  moveCorner,
  tapDraw,
  undoCorner,
  type DrawContext,
  type DrawFloor,
  type DrawTap,
  type RoomsDrawState,
} from './rooms-draw-model';

const METRES_PER_PX = 0.02;

function room(id: string, outer: readonly HomeMapVec[], colourSlot = 1): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId: null,
    polygon: { outer, holes: [] },
    labelAt: outer[0],
    colourSlot,
    floorMaterial: { kind: 'plain', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  });
}

const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

const WALL: HomeMapSnapWall = {
  from: { x: 0, y: 6 },
  to: { x: 3, y: 6 },
  thickness: 0.1,
};

function ctxOf(
  rooms: readonly HomeMapRoom[] = [],
  walls: readonly HomeMapSnapWall[] = [],
): DrawContext {
  const floor: DrawFloor = { id: 'floor-1', rooms, walls };
  let next = 0;
  return {
    floor,
    gridM: 0.1,
    newId: (): string => {
      next += 1;
      return `room-${String(next)}`;
    },
  };
}

function tap(at: HomeMapVec, metresPerPx = METRES_PER_PX): DrawTap {
  return { at, metresPerPx };
}

function ringOf(op: HomeMapOp | undefined): readonly HomeMapVec[] {
  return op?.op === 'add' ? HOME_MAP_ROOM_WRITE.parse(op.element).polygon.outer : [];
}

function rounded(ring: readonly HomeMapVec[]): readonly HomeMapVec[] {
  return ring.map((point) => ({ x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }));
}

const POINTS = chooseShape('points');

function taps(ctx: DrawContext, points: readonly HomeMapVec[]): RoomsDrawState {
  return points.reduce<RoomsDrawState>(
    (state, at) => tapDraw(state, ctx, tap(at), null).state,
    POINTS,
  );
}

function pointsOf(state: RoomsDrawState): readonly HomeMapVec[] {
  return state.draft.kind === 'polygon' ? rounded(state.draft.points) : [];
}

describe('rectangle drawing', () => {
  it('adds a grid snapped hand room from two taps on opposite corners and selects it', () => {
    const ctx = ctxOf();
    const first = tapDraw(IDLE_DRAW, ctx, tap({ x: 1.02, y: 1.01 }), null);
    expect(first.ops).toEqual([]);
    expect(first.state.draft).toEqual({ kind: 'rect', from: { x: 1, y: 1 } });
    const step = tapDraw(first.state, ctx, tap({ x: 4.03, y: 3.04 }), null);
    const op = step.ops[0];
    expect(op).toMatchObject({ op: 'add', kind: 'room', floorId: 'floor-1' });
    expect(rounded(ringOf(op))).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 1, y: 3 },
    ]);
    const element = op?.op === 'add' ? HOME_MAP_ROOM_WRITE.parse(op.element) : null;
    expect(element).toMatchObject({ colourSlot: 1, origin: { kind: 'hand' }, name: null });
    expect(step.select).toBe('room-1');
    expect(step.state).toEqual(IDLE_DRAW);
  });

  it('keeps the first corner when the second tap collapses the rectangle to a line', () => {
    const ctx = ctxOf();
    const first = tapDraw(IDLE_DRAW, ctx, tap({ x: 1, y: 1 }), null);
    const step = tapDraw(first.state, ctx, tap({ x: 3, y: 1.02 }), null);
    expect(step.ops).toEqual([]);
    expect(step.state.draft).toEqual({ kind: 'rect', from: { x: 1, y: 1 } });
  });

  it('moves the dragged first corner', () => {
    const ctx = ctxOf();
    const first = tapDraw(IDLE_DRAW, ctx, tap({ x: 1, y: 1 }), null);
    expect(moveCorner(first.state, 0, { x: 2, y: 2 }).draft).toEqual({
      kind: 'rect',
      from: { x: 2, y: 2 },
    });
  });
});

describe('any shape drawing', () => {
  const L_SHAPE = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ];

  it('closes on a tap at the first corner and keeps every corner', () => {
    const ctx = ctxOf();
    const open = taps(ctx, L_SHAPE);
    expect(open.draft.kind).toBe('polygon');
    const step = tapDraw(open, ctx, tap({ x: 0.05, y: 0.05 }), null);
    expect(rounded(ringOf(step.ops[0]))).toEqual(L_SHAPE);
    const element =
      step.ops[0]?.op === 'add' ? HOME_MAP_ROOM_WRITE.parse(step.ops[0].element) : null;
    expect(element && homeMapPointInPolygon(element.polygon, element.labelAt)).toBe(true);
    expect(step.state).toEqual(POINTS);
  });

  it('takes the close radius from the metres per pixel of the tap', () => {
    const ctx = ctxOf();
    const open = taps(ctx, L_SHAPE.slice(0, 3));
    const near = { x: 0.3, y: 0.3 };
    expect(hitRadiusM(0.01)).toBeCloseTo(0.22);
    expect(tapDraw(open, ctx, tap(near, 0.01), null).ops).toEqual([]);
    expect(tapDraw(open, ctx, tap(near, 0.05), null).ops).toHaveLength(1);
  });

  it('snaps a corner onto the 45 degree ray from the previous corner', () => {
    const ctx = ctxOf();
    const state = taps(ctx, [
      { x: 0, y: 0 },
      { x: 3, y: 0.2 },
    ]);
    expect(pointsOf(state)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('snaps onto a wall line and names the guide', () => {
    const ctx = ctxOf([], [WALL]);
    const state = taps(ctx, [{ x: 5, y: 6.1 }]);
    expect(pointsOf(state)).toEqual([{ x: 5, y: 6 }]);
    expect(guideLabels(state.guides).map((label) => label.text)).toEqual(['On wall line']);
  });

  it('refuses a self crossing shape and keeps drawing', () => {
    const ctx = ctxOf();
    const bowTie = taps(ctx, [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ]);
    const step = finishPolygon(bowTie, ctx);
    expect(step.ops).toEqual([]);
    expect(step.state.draft.kind).toBe('polygon');
  });

  it('undoes corners one at a time back to idle', () => {
    const ctx = ctxOf();
    const two = taps(ctx, L_SHAPE.slice(0, 2));
    expect(pointsOf(undoCorner(two))).toEqual([{ x: 0, y: 0 }]);
    expect(undoCorner(undoCorner(two))).toEqual(POINTS);
  });

  it('moves a dragged corner of the draft', () => {
    const ctx = ctxOf();
    const three = taps(ctx, L_SHAPE.slice(0, 3));
    expect(pointsOf(moveCorner(three, 1, { x: 5, y: 0 }))[1]).toEqual({ x: 5, y: 0 });
  });

  it('selects the room under a tap when nothing is being drawn', () => {
    const ctx = ctxOf([room('kitchen', SQUARE)]);
    const step = tapDraw(POINTS, ctx, tap({ x: 2, y: 2 }), 'kitchen');
    expect(step).toMatchObject({ ops: [], select: 'kitchen', state: POINTS });
  });
});

describe('draft overlay', () => {
  function overlayOf(points: readonly HomeMapVec[]): unknown {
    return {
      ...NO_EDIT_OVERLAY,
      mode: 'draw-points',
      handles: draftCorners(points).map((corner) => corner.handle),
      shapes: draftShapes(points),
      ghosts: draftGhosts(points),
      labels: draftLabels(points),
    };
  }

  it('sends a valid overlay with a draggable knob for every placed corner', () => {
    for (const count of [1, 2, 3, 4]) {
      const points = SQUARE.slice(0, count);
      const overlay = EDIT_OVERLAY.parse(overlayOf(points));
      expect(overlay.handles.map((handle) => handle.kind)).toEqual(points.map(() => 'point'));
    }
  });

  it('dashes the open edge and fills the shape once it has three corners', () => {
    const tones = draftGhosts(SQUARE).map((ghost) => `${ghost.shape}:${ghost.tone}`);
    expect(tones).toEqual(['polygon:neutral', 'polyline:accent', 'polyline:snap']);
  });

  it('labels each placed side and the area', () => {
    expect(draftLabels(SQUARE).map((label) => label.text)).toEqual([
      '4.00 m',
      '4.00 m',
      '4.00 m',
      '16.0 m²',
    ]);
  });

  it('puts the example room in the middle of the drawing sheet', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 8 };
    expect(exampleRing(bounds)[0]).toEqual({ x: 2.5, y: 6 });
    expect(exampleMarks(bounds).labels.map((label) => label.text)).toEqual([
      'Tap here',
      '5.00 × 4.00 m',
    ]);
  });
});

describe('room helpers', () => {
  it('gives a new room the least used colour slot', () => {
    expect(nextColourSlot([room('a', SQUARE, 1), room('b', SQUARE, 2)])).toBe(3);
    expect(nextColourSlot([])).toBe(1);
  });

  it('puts the label inside a concave room', () => {
    const u = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(homeMapPointInPolygon({ outer: u, holes: [] }, labelPoint(u))).toBe(true);
  });
});
