import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_GRID_M,
  HOME_MAP_OBJECT_WRITE,
  homeMapPointInPolygon,
  homeMapResize,
  type HomeMapFloor,
  type HomeMapVec,
} from '@smarteverything/domain';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  BIG,
  LAMP,
  SHELF,
  SMALL,
  SOFA,
  SOFA_ID,
  floorWith,
  onlyObject,
  row,
  sofa,
  southDoor,
  specOf,
} from './furniture-fixture';
import { FINISH_TOKEN_HASH } from '../../../../components/models/three/finish-token-hash';
import {
  ALL_CATEGORIES,
  armedNotice,
  categoriesOf,
  furnitureRows,
  matchRows,
  pieceElement,
  pieceElevation,
  pieceFootprint,
  placeOp,
  placeOverlay,
  sourceOf,
  supportTop,
  targetRoom,
} from './furniture-model';
import {
  boxOf,
  editFactsOf,
  editObjectOf,
  gripAt,
  hitObject,
} from '../../../../components/house-map/edit/furniture-box';

describe('the catalogue listing', () => {
  const rows = [
    row('cat.living.sofa', 'Sofa', 'living', ['couch']),
    row('dev.light.bulb', 'Bulb', 'light'),
    row('cat.bedroom.bed', 'Bed', 'bedroom'),
  ];

  it('keeps only catalogue furniture, in title order', () => {
    expect(furnitureRows(rows).map((each) => each.id)).toEqual([
      'cat.bedroom.bed',
      'cat.living.sofa',
    ]);
    expect(categoriesOf(furnitureRows(rows))).toEqual(['bedroom', 'living']);
  });

  it('searches titles, aliases and categories within the chosen category', () => {
    const furniture = furnitureRows(rows);
    expect(matchRows(furniture, 'couch', ALL_CATEGORIES).map((each) => each.title)).toEqual([
      'Sofa',
    ]);
    expect(matchRows(furniture, 'bedroom', ALL_CATEGORIES).map((each) => each.title)).toEqual([
      'Bed',
    ]);
    expect(matchRows(furniture, '', 'living').map((each) => each.title)).toEqual(['Sofa']);
    expect(matchRows(furniture, 'sofa', 'bedroom')).toEqual([]);
  });

  it('feeds the baked thumbnail from the catalogue spec hash and the default finish', () => {
    expect(sourceOf(row('cat.living.sofa', 'Sofa', 'living'), SOFA)).toEqual({
      spec: SOFA,
      specHash: 'a'.repeat(64),
      tokenHash: FINISH_TOKEN_HASH,
      finish: 'oat',
      params: {},
    });
  });
});

describe('placing a piece', () => {
  it('targets the chosen room, else the largest room', () => {
    const floor = floorWith([]);
    expect(targetRoom(floor, SMALL)?.id).toBe(SMALL);
    expect(targetRoom(floor, null)?.id).toBe(BIG);
  });

  it('adds the model at a free spot inside the room with its default finish', () => {
    const floor = floorWith([]);
    const room = targetRoom(floor, null);
    if (room === null) throw new Error('no room');
    const op = placeOp({ floor, room, modelId: SOFA.id, spec: SOFA, id: 'new', specOf });
    if (op?.op !== 'add') throw new Error('not added');
    const element = HOME_MAP_OBJECT_WRITE.parse(op.element);
    expect(element.modelId).toBe(SOFA.id);
    expect(element.finish).toBe('oat');
    expect(homeMapPointInPolygon(room.polygon, element.at)).toBe(true);
  });

  it('places nothing when the room has no free spot', () => {
    const floor = floorWith([]);
    const room = targetRoom(floor, SMALL);
    if (room === null) throw new Error('no room');
    expect(placeOp({ floor, room, modelId: SOFA.id, spec: SOFA, id: 'new', specOf })).toBeNull();
  });

  it('keeps a wall piece clear of a door in the wall it would hang on', () => {
    const place = (floor: HomeMapFloor): HomeMapVec => {
      const room = targetRoom(floor, BIG);
      if (room === null) throw new Error('no room');
      const op = placeOp({ floor, room, modelId: SHELF.id, spec: SHELF, id: 'new', specOf });
      if (op?.op !== 'add') throw new Error('not added');
      return HOME_MAP_OBJECT_WRITE.parse(op.element).at;
    };
    const open = place(floorWith([]));
    expect(open.x).toBeGreaterThan(2);
    expect(open.x).toBeLessThan(3);
    const blocked = place(floorWith([], southDoor(2, 1)));
    const half = SHELF.footprint.width / 2;
    expect(blocked.x + half <= 2 || blocked.x - half >= 3).toBe(true);
  });
});

describe('handles on a placed piece', () => {
  it('stretching writes the model width param, clamped to its range', () => {
    const object = onlyObject(floorWith([sofa()]));
    const facts = editFactsOf(SOFA);
    expect(facts?.sizeParams).toEqual([
      { name: 'width', axis: 'width', min: 1.6, max: 3, scale: 1, extra: 0, resizes: true },
    ]);
    const made = homeMapResize({
      object: editObjectOf(object, SOFA),
      facts,
      handle: 's',
      pointer: { x: 2, y: 9 },
      options: { gridM: HOME_MAP_GRID_M, presetRadiusM: null, keepProportions: false },
    });
    expect(made.params).toEqual({ width: 3 });
    expect(made.box.w).toBe(3);
  });

  it('hits the piece under the finger and offers no handles when it is locked', () => {
    const floor = floorWith([sofa(true)]);
    const object = onlyObject(floor);
    const box = boxOf(object, specOf);
    expect(hitObject(floor, { x: 2.3, y: 2.8 }, specOf)?.id).toBe(SOFA_ID);
    expect(hitObject(floor, { x: 4.5, y: 4.5 }, specOf)).toBeNull();
    expect(gripAt(box, true, { x: 2, y: 2 + box.w / 2 }, 0.01)).toBeNull();
    expect(gripAt(box, false, { x: 2, y: 2 + box.w / 2 }, 0.01)).toEqual({
      kind: 'resize',
      handle: 's',
    });
  });
});

describe('an armed piece', () => {
  it('names the piece in the tap hint', () => {
    expect(armedNotice('Armchair')).toBe('Tap the floor to place the armchair');
  });

  it('builds a hand placed element with the default finish', () => {
    const element = pieceElement({
      ...{ id: SOFA_ID, modelId: SOFA.id, spec: SOFA },
      ...{ at: { x: 1, y: 2 }, rotation: 15, elevation: 0 },
    });
    expect(HOME_MAP_OBJECT_WRITE.parse(element)).toEqual({
      ...{ id: SOFA_ID, modelId: SOFA.id, finish: 'oat', params: {} },
      ...{ at: { x: 1, y: 2 }, rotation: 15, elevation: 0, label: null, locked: false },
      origin: { kind: 'hand' },
    });
  });

  it.each([
    { id: '', modelId: SOFA.id },
    { id: SOFA_ID, modelId: '' },
  ])('rejects an invalid persisted furniture identity: %j', (identity) => {
    expect(() =>
      pieceElement({
        ...identity,
        spec: SOFA,
        at: { x: 1, y: 2 },
        rotation: 15,
        elevation: 0,
      }),
    ).toThrow();
  });

  it('puts the scene in place mode with the footprint of the piece and no selection', () => {
    const base = { ...NO_EDIT_OVERLAY, mode: 'select' as const, selection: [SOFA_ID] };
    const overlay = placeOverlay(base, pieceFootprint(SOFA.id, SOFA));
    expect(overlay).toMatchObject({
      mode: 'place',
      selection: [],
      gizmo: null,
      place: { kind: 'object', footprint: { w: 2, d: 0.9 }, rotation: 0 },
    });
  });

  it('finds the top of the highest piece under a point', () => {
    const floor = floorWith([sofa()]);
    const heights = (id: string): number | null => (id === SOFA_ID ? 0.8 : null);
    expect(supportTop(floor, heights, { x: 2.3, y: 2.8 }, specOf)).toBeCloseTo(0.8);
    expect(supportTop(floor, heights, { x: 4.5, y: 4.5 }, specOf)).toBe(0);
    expect(supportTop(floor, () => null, { x: 2.3, y: 2.8 }, specOf)).toBe(0);
  });

  it('keeps floor pieces on the floor and lifts table pieces to the surface', () => {
    expect(pieceElevation(SOFA.id, SOFA, 0.8)).toBe(0);
    expect(pieceElevation(LAMP.id, LAMP, 0.8)).toBe(0.8);
  });
});
