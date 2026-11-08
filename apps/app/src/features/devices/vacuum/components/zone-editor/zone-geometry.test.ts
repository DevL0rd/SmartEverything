import { describe, expect, it } from 'vitest';
import {
  defaultShape,
  dragHandle,
  handlesOf,
  hitShape,
  moveRect,
  moveShape,
  nudgeShape,
  resizeRect,
  resizeRectTo,
  sizeText,
} from './zone-geometry';
import {
  cleanZonesOf,
  countsOf,
  limitReason,
  restrictedOf,
  restrictedShapesOf,
  restrictedShapesOfScene,
  signatureOf,
  type Draft,
  type RectShape,
} from './zone-shapes';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 8 };

const margin = 22 / 42;

const square: RectShape = {
  form: 'rect',
  key: 1,
  kind: 'no_go',
  rect: { x1: 2, y1: 2, x2: 4, y2: 4 },
};

describe('zone rectangles', () => {
  it('moves inside the map and keeps its size at the edge', () => {
    expect(moveRect(square.rect, 20, 0, bounds)).toEqual({ x1: 8, y1: 2, x2: 10, y2: 4 });
    expect(moveRect(square.rect, -5, -5, bounds)).toEqual({ x1: 0, y1: 0, x2: 2, y2: 2 });
  });

  it('resizes from a corner while the opposite corner stays', () => {
    expect(resizeRect(square.rect, 'ne', { x: 6, y: 5 }, bounds)).toEqual({
      x1: 2,
      y1: 2,
      x2: 6,
      y2: 5,
    });
    expect(resizeRect(square.rect, 'sw', { x: 1, y: 1 }, bounds)).toEqual({
      x1: 1,
      y1: 1,
      x2: 4,
      y2: 4,
    });
  });

  it('never shrinks below the minimum side or leaves the map', () => {
    const tiny = resizeRect(square.rect, 'ne', { x: 0, y: 0 }, bounds);
    expect(tiny.x2 - tiny.x1).toBeCloseTo(0.2);
    expect(tiny.y2 - tiny.y1).toBeCloseTo(0.2);
    expect(resizeRect(square.rect, 'ne', { x: 99, y: 99 }, bounds)).toMatchObject({
      x2: 10,
      y2: 8,
    });
  });

  it('sets an exact size and pulls it back inside', () => {
    expect(resizeRectTo(square.rect, 3, 1, bounds)).toEqual({ x1: 2, y1: 2, x2: 5, y2: 3 });
    expect(resizeRectTo({ x1: 8, y1: 6, x2: 9, y2: 7 }, 4, 4, bounds)).toEqual({
      x1: 6,
      y1: 4,
      x2: 10,
      y2: 8,
    });
  });
});

describe('zone shapes', () => {
  it('starts a new shape in the middle of the map', () => {
    const area = defaultShape('no_mop', 3, bounds);
    expect(area).toMatchObject({
      form: 'rect',
      key: 3,
      rect: { x1: 4.5, y1: 3.5, x2: 5.5, y2: 4.5 },
    });
    const wall = defaultShape('wall', 4, bounds);
    expect(wall).toMatchObject({ form: 'wall', from: { x: 4.5, y: 4 }, to: { x: 5.5, y: 4 } });
  });

  it('moves a wall by its ends and refuses to collapse it', () => {
    const wall = defaultShape('wall', 1, bounds);
    expect(dragHandle(wall, 'to', { x: 7, y: 5 }, bounds)).toMatchObject({ to: { x: 7, y: 5 } });
    expect(dragHandle(wall, 'to', { x: 4.55, y: 4 }, bounds)).toBe(wall);
    const moved = moveShape(wall, 99, 0, bounds);
    expect(moved).toMatchObject({ from: { x: 9, y: 4 }, to: { x: 10, y: 4 } });
  });

  it('nudges by 0.1 m', () => {
    const next = nudgeShape(square, { x: 0.1, y: 0 }, bounds);
    expect(next).toMatchObject({ rect: { x1: 2.1, x2: 4.1 } });
    const down = nudgeShape(square, { x: 0, y: -0.1 }, bounds);
    expect(down).toMatchObject({ rect: { y1: 1.9, y2: 3.9 } });
  });

  it('offers four corner handles on a rectangle and two on a wall', () => {
    expect(handlesOf(square).map((handle) => handle.id)).toEqual(['nw', 'ne', 'se', 'sw']);
    expect(handlesOf(defaultShape('wall', 1, bounds)).map((handle) => handle.id)).toEqual([
      'from',
      'to',
    ]);
  });

  it('describes the size in metres', () => {
    expect(sizeText(square)).toBe('2.0 by 2.0 m');
    expect(sizeText(defaultShape('wall', 1, bounds))).toBe('1.0 m long');
  });
});

describe('zone hit testing', () => {
  const draft: Draft = [square, { ...square, key: 2, rect: { x1: 3, y1: 3, x2: 6, y2: 6 } }];

  it('picks the shape drawn last where two overlap', () => {
    expect(hitShape(draft, null, { x: 3.5, y: 3.5 }, margin)).toEqual({ key: 2, handle: null });
    expect(hitShape(draft, null, { x: 2.2, y: 2.2 }, margin)).toEqual({ key: 1, handle: null });
  });

  it('prefers a handle of the selected shape', () => {
    expect(hitShape(draft, 1, { x: 4, y: 4 }, margin)).toEqual({ key: 1, handle: 'ne' });
  });

  it('misses empty map', () => {
    expect(hitShape(draft, null, { x: 9, y: 7 }, margin)).toBeNull();
  });

  it('hits a wall near its line', () => {
    const wall = defaultShape('wall', 5, bounds);
    expect(hitShape([wall], null, { x: 5, y: 4.05 }, margin)).toEqual({ key: 5, handle: null });
    expect(hitShape([wall], null, { x: 5, y: 6 }, margin)).toBeNull();
  });
});

describe('zone drafts', () => {
  const zones = [
    {
      id: 1,
      kind: 'no_go',
      points: [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 1, y: 2 },
      ],
    },
    {
      id: 2,
      kind: 'no_mop',
      points: [
        { x: 5, y: 1 },
        { x: 6, y: 2 },
        { x: 5, y: 3 },
        { x: 4, y: 2 },
      ],
    },
    {
      id: 3,
      kind: 'wall',
      points: [
        { x: 0, y: 5 },
        { x: 4, y: 5 },
      ],
    },
    {
      id: 4,
      kind: 'hidden',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  ];

  it('reads the scene: axis aligned areas edit, rotated areas stay fixed', () => {
    const draft = restrictedShapesOfScene(zones);
    expect(draft.map((shape) => `${shape.kind}:${shape.form}`)).toEqual([
      'no_go:rect',
      'no_mop:fixed',
      'wall:wall',
    ]);
    expect(draft.map((shape) => shape.key)).toEqual([1, 2, 3]);
  });

  it('writes back exactly what it read', () => {
    const draft = restrictedShapesOfScene(zones);
    const restricted = restrictedOf(draft);
    expect(restricted.noGo).toHaveLength(1);
    expect(restricted.noMop[0]).toEqual(zones[1]?.points);
    expect(restricted.walls).toEqual([{ from: { x: 0, y: 5 }, to: { x: 4, y: 5 } }]);
    expect(signatureOf(restrictedShapesOf(restricted))).toBe(signatureOf(draft));
  });

  it('counts zones apart from restricted areas and stops at the limits', () => {
    const many: Draft = Array.from({ length: 5 }, (_, index) => ({
      ...square,
      key: index + 1,
      kind: 'clean' as const,
    }));
    expect(countsOf(many)).toEqual({ clean: 5, restricted: 0 });
    expect(limitReason(many, 'clean')).toBe('Up to 5 zones per clean.');
    expect(limitReason(many, 'no_go')).toBeNull();
    expect(cleanZonesOf(many)).toHaveLength(5);
    const restricted: Draft = Array.from({ length: 10 }, (_, index) => ({
      ...square,
      key: index + 1,
    }));
    expect(limitReason(restricted, 'wall')).toBe('Up to 10 no-go areas and walls in total.');
    expect(limitReason(restricted, 'clean')).toBeNull();
  });
});
