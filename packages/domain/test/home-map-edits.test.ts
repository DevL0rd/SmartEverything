import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HOME_MAP, type HomeMap } from '../src/home-map';
import {
  HOME_MAP_ACTOR,
  HOME_MAP_EDIT_BATCH,
  HOME_MAP_REVISION_ENTRY,
  homeMapActorKind,
  type HomeMapOp,
} from '../src/home-map-edit-ops';
import { applyHomeMapEdits, type HomeMapEditContext } from '../src/home-map-edits';

const DEVICE = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const OTHER_DEVICE = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';
const HAND = { kind: 'hand' };
const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

type Rec = Record<string, unknown>;

const first = <T>(list: readonly T[]): T => {
  const item = list[0];
  if (item === undefined) throw new Error('empty');
  return item;
};

const USER: HomeMapEditContext = { actor: 'profile:alice', at: '2026-10-25T11:00:00.000Z' };
const SOURCE: HomeMapEditContext = { actor: 'source:robot', at: '2026-10-25T11:00:00.000Z' };

const wall = (id: string, from: number): Rec => ({
  id,
  from: { x: from, y: 0 },
  to: { x: from + 4, y: 0 },
  thickness: 0.1,
  height: null,
  kind: 'solid',
  origin: HAND,
});

const opening = (id: string, wallId: string): Rec => ({
  id,
  wallId,
  offset: 1,
  width: 0.9,
  kind: 'door',
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: null,
  lockDeviceId: null,
  origin: HAND,
});

const object = (id: string, locked = false): Rec => ({
  id,
  modelId: 'cat.sofa.two_seat',
  finish: null,
  params: { width: 1.8 },
  at: { x: 1, y: 1 },
  rotation: 0,
  elevation: 0,
  label: null,
  locked,
  origin: HAND,
});

const placement = (deviceId: string, floorId = 'floor-1'): Rec => ({
  deviceId,
  floorId,
  at: { x: 2, y: 2 },
  rotation: 0,
  height: 2.4,
  tilt: 0,
  mount: 'ceiling',
  auto: true,
  camera: null,
});

const floor = (id: string, level: number): Rec => ({
  id,
  name: id,
  level,
  elevation: level * 2.7,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const base = (): HomeMap =>
  HOME_MAP.parse({
    id: 'home',
    schemaVersion: 1,
    revision: 5,
    name: 'House',
    north: 0,
    updatedAt: '2026-10-25T10:00:00.000Z',
    sources: [],
    notices: [],
    floors: [
      {
        ...floor('floor-1', 0),
        rooms: [
          {
            id: 'room-1',
            name: null,
            homeRoomId: null,
            polygon: { outer: SQUARE, holes: [] },
            labelAt: { x: 2, y: 1.5 },
            colourSlot: 1,
            floorMaterial: { kind: 'wood', variant: null, tint: null },
            wallPaint: null,
            ceilingHeight: null,
            origin: { kind: 'source', sourceId: 'robot', ref: 'room:1', overridden: [] },
          },
        ],
        walls: [wall('wall-1', 0), wall('wall-2', 4)],
        openings: [opening('op-1', 'wall-1'), opening('op-2', 'wall-2'), opening('op-3', 'wall-1')],
        objects: [object('obj-1'), object('obj-2', true)],
        placements: [placement(DEVICE)],
        annotations: [
          { id: 'a-1', kind: 'pin', at: { x: 1, y: 1 }, text: 'Leak' },
          { id: 'a-2', kind: 'measure', from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, text: '4 m' },
        ],
      },
      floor('floor-2', 1),
    ],
  });

const edit = (source: HomeMap, ops: readonly HomeMapOp[], context = USER): HomeMap =>
  applyHomeMapEdits(source, ops, context).map;

const settle = (source: HomeMap): object => ({ ...source, revision: 0, updatedAt: '' });

describe('actors and schemas', () => {
  it('knows the three actor kinds and rejects others', () => {
    expect(homeMapActorKind('profile:a')).toBe('profile');
    expect(homeMapActorKind('ai:a')).toBe('ai');
    expect(homeMapActorKind('source:s')).toBe('source');
    expect(HOME_MAP_ACTOR.safeParse('robot:1').success).toBe(false);
    expect(HOME_MAP_ACTOR.safeParse('profile:').success).toBe(false);
  });

  it('parses batches and revision entries and rejects unknown ops and fields', () => {
    const ops: HomeMapOp[] = [{ op: 'remove', kind: 'object', floorId: 'floor-1', id: 'obj-1' }];
    expect(HOME_MAP_EDIT_BATCH.safeParse({ baseRevision: 5, ops }).success).toBe(true);
    expect(HOME_MAP_EDIT_BATCH.safeParse({ baseRevision: 5, ops: [] }).success).toBe(false);
    expect(HOME_MAP_EDIT_BATCH.safeParse({ baseRevision: 5, ops: [{ op: 'nuke' }] }).success).toBe(
      false,
    );
    const entry = { revision: 6, ops, inverse: ops, actor: 'ai:alice', at: USER.at };
    expect(HOME_MAP_REVISION_ENTRY.safeParse(entry).success).toBe(true);
    expect(HOME_MAP_REVISION_ENTRY.safeParse({ ...entry, extra: 1 }).success).toBe(false);
  });
});

describe('applying edits', () => {
  it('adds an object, keeps an unknown model id and bumps the revision once per batch', () => {
    const input = base();
    const result = applyHomeMapEdits(
      input,
      [
        {
          op: 'add',
          kind: 'object',
          floorId: 'floor-1',
          element: { ...object('obj-9'), modelId: 'cat.from.a_newer_build' },
        },
        { op: 'add', kind: 'object', floorId: 'floor-1', element: object('obj-10') },
      ],
      USER,
    );
    const objects = result.map.floors[0]?.objects ?? [];
    expect(objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2', 'obj-9', 'obj-10']);
    expect(objects[2]?.modelId).toBe('cat.from.a_newer_build');
    expect(result.map.revision).toBe(6);
    expect(result.map.updatedAt).toBe(USER.at);
    expect(input.revision).toBe(5);
    expect(input.floors[0]?.objects).toHaveLength(2);
  });

  it('reports conflicts per element, drops those ops and applies the rest', () => {
    const result = applyHomeMapEdits(
      base(),
      [
        { op: 'remove', kind: 'object', floorId: 'floor-1', id: 'gone' },
        { op: 'update', kind: 'object', floorId: 'floor-1', id: 'obj-1', patch: { label: 'Sofa' } },
        { op: 'add', kind: 'object', floorId: 'floor-1', element: object('obj-1') },
        { op: 'add', kind: 'object', floorId: 'nowhere', element: object('obj-5') },
        { op: 'add', kind: 'opening', floorId: 'floor-1', element: opening('op-9', 'no-wall') },
        { op: 'move', kind: 'object', floorId: 'floor-1', id: 'obj-2', dx: 1, dy: 1 },
      ],
      USER,
    );
    expect(result.conflicts.map((c) => [c.index, c.reason, c.kind, c.id])).toEqual([
      [0, 'missing_element', 'object', 'gone'],
      [2, 'exists', 'object', 'obj-1'],
      [3, 'missing_floor', 'object', null],
      [4, 'missing_parent', 'opening', 'op-9'],
      [5, 'locked', 'object', 'obj-2'],
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.map.floors[0]?.objects[0]?.label).toBe('Sofa');
    expect(result.map.revision).toBe(6);
  });

  it('keeps the map and revision when every op conflicts', () => {
    const input = base();
    const result = applyHomeMapEdits(
      input,
      [{ op: 'remove', kind: 'wall', floorId: 'floor-1', id: 'gone' }],
      USER,
    );
    expect(result.map).toBe(input);
    expect(result.inverse).toEqual([]);
  });

  it('merges updates field by field so the later write wins per field', () => {
    const result = edit(base(), [
      {
        op: 'update',
        kind: 'object',
        floorId: 'floor-1',
        id: 'obj-1',
        patch: { label: 'A', rotation: 10 },
      },
      { op: 'update', kind: 'object', floorId: 'floor-1', id: 'obj-1', patch: { label: 'B' } },
    ]);
    expect(result.floors[0]?.objects[0]).toMatchObject({ label: 'B', rotation: 10 });
  });

  it('rejects patches that change the key, add unknown fields or break a field', () => {
    const patches = [{ id: 'other' }, { colour: 'red' }, { rotation: 'north' }];
    for (const patch of patches) {
      const result = applyHomeMapEdits(
        base(),
        [{ op: 'update', kind: 'object', floorId: 'floor-1', id: 'obj-1', patch }],
        USER,
      );
      expect(result.conflicts[0]?.reason).toBe('invalid');
    }
  });

  it('marks fields a user changes on a source element and leaves source edits unmarked', () => {
    const op: HomeMapOp = {
      op: 'update',
      kind: 'room',
      floorId: 'floor-1',
      id: 'room-1',
      patch: { name: 'Study', colourSlot: 4 },
    };
    const byUser = edit(base(), [op]).floors[0]?.rooms[0]?.origin;
    expect(byUser).toMatchObject({ kind: 'source', overridden: ['name', 'colourSlot'] });
    const byAi = edit(base(), [op], { ...USER, actor: 'ai:alice' }).floors[0]?.rooms[0]?.origin;
    expect(byAi).toMatchObject({ overridden: ['name', 'colourSlot'] });
    const bySource = edit(base(), [op], SOURCE).floors[0]?.rooms[0]?.origin;
    expect(bySource).toMatchObject({ overridden: [] });
  });

  it('moves rooms, walls, objects, annotations and placements, and a user placement stops being auto', () => {
    const moved = edit(base(), [
      { op: 'move', kind: 'room', floorId: 'floor-1', id: 'room-1', dx: 2, dy: 1 },
      { op: 'move', kind: 'wall', floorId: 'floor-1', id: 'wall-1', dx: 1, dy: 1 },
      { op: 'move', kind: 'object', floorId: 'floor-1', id: 'obj-1', dx: -1, dy: 2 },
      { op: 'move', kind: 'annotation', floorId: 'floor-1', id: 'a-2', dx: 1, dy: 0 },
      { op: 'move', kind: 'placement', floorId: 'floor-1', id: DEVICE, dx: 1, dy: 1 },
    ]).floors;
    const moved1 = first(moved);
    expect(first(moved1.rooms).polygon.outer[0]).toEqual({ x: 2, y: 1 });
    expect(first(moved1.rooms).labelAt).toEqual({ x: 4, y: 2.5 });
    expect(first(moved1.walls).to).toEqual({ x: 5, y: 1 });
    expect(first(moved1.objects).at).toEqual({ x: 0, y: 3 });
    expect(moved1.annotations[1]).toMatchObject({ from: { x: 1, y: 0 }, to: { x: 5, y: 0 } });
    expect(first(moved1.placements)).toMatchObject({ at: { x: 3, y: 3 }, auto: false });
  });

  it('slides an opening along its wall, clamped to the wall', () => {
    const slide = (dx: number, dy: number): number | undefined =>
      edit(base(), [{ op: 'move', kind: 'opening', floorId: 'floor-1', id: 'op-1', dx, dy }])
        .floors[0]?.openings[0]?.offset;
    expect(slide(1.5, 7)).toBe(2.5);
    expect(slide(-9, 0)).toBe(0);
    expect(slide(99, 0)).toBeCloseTo(3.1);
  });

  it('removing a wall removes its openings and the inverse restores them in order', () => {
    const input = base();
    const result = applyHomeMapEdits(
      input,
      [{ op: 'remove', kind: 'wall', floorId: 'floor-1', id: 'wall-1' }],
      USER,
    );
    expect(result.map.floors[0]?.openings.map((o) => o.id)).toEqual(['op-2']);
    expect(settle(edit(result.map, result.inverse))).toEqual(settle(input));
  });

  it('keeps one placement per device across floors and the placement floor consistent', () => {
    const result = applyHomeMapEdits(
      base(),
      [
        { op: 'add', kind: 'placement', floorId: 'floor-2', element: placement(DEVICE, 'floor-2') },
        { op: 'add', kind: 'placement', floorId: 'floor-2', element: placement(OTHER_DEVICE) },
        {
          op: 'add',
          kind: 'placement',
          floorId: 'floor-2',
          element: placement(OTHER_DEVICE, 'floor-2'),
        },
      ],
      USER,
    );
    expect(result.conflicts.map((c) => c.reason)).toEqual(['exists', 'invalid']);
    expect(result.map.floors[1]?.placements).toHaveLength(1);
  });

  it('edits floors: add, set, reorder, remove, and refuses a reorder that is not a permutation', () => {
    const input = base();
    const result = applyHomeMapEdits(
      input,
      [
        { op: 'addFloor', floor: floor('floor-3', 2) },
        { op: 'addFloor', floor: floor('floor-3', 2) },
        { op: 'setFloor', floorId: 'floor-2', patch: { name: 'Upstairs', ceilingHeight: 2.4 } },
        { op: 'reorderFloors', order: ['floor-2', 'floor-1'] },
        { op: 'reorderFloors', order: ['floor-3', 'floor-2', 'floor-1'] },
        { op: 'removeFloor', floorId: 'floor-1' },
        { op: 'removeFloor', floorId: 'floor-1' },
        { op: 'setMap', patch: { name: 'Home', north: 30 } },
      ],
      USER,
    );
    expect(result.conflicts.map((c) => [c.index, c.reason])).toEqual([
      [1, 'exists'],
      [3, 'order_mismatch'],
      [6, 'missing_floor'],
    ]);
    expect(result.map.floors.map((f) => f.id)).toEqual(['floor-3', 'floor-2']);
    expect(result.map.floors[1]).toMatchObject({ name: 'Upstairs', ceilingHeight: 2.4 });
    expect(result.map).toMatchObject({ name: 'Home', north: 30 });
    expect(settle(edit(result.map, result.inverse))).toEqual(settle(input));
  });

  it('edits sources and notices with the source actor', () => {
    const notice = {
      id: 'n-1',
      kind: 'source_changed',
      elementId: 'room-1',
      detail: 'Changed',
      createdAt: USER.at,
    };
    const added = edit(base(), [{ op: 'add', kind: 'notice', element: notice }], SOURCE);
    expect(added.notices).toHaveLength(1);
    const removed = edit(added, [{ op: 'remove', kind: 'notice', id: 'n-1' }], SOURCE);
    expect(removed.notices).toHaveLength(0);
  });
});

const pick = <T>(items: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...items);

const opArbitrary: fc.Arbitrary<HomeMapOp> = fc.oneof(
  fc.record({
    op: fc.constant('move' as const),
    kind: pick(['room', 'wall', 'opening', 'object', 'placement', 'annotation'] as const),
    floorId: pick(['floor-1', 'floor-2']),
    id: pick([
      'room-1',
      'wall-1',
      'wall-2',
      'op-1',
      'op-2',
      'obj-1',
      'obj-2',
      'a-1',
      'a-2',
      DEVICE,
    ]),
    dx: fc.integer({ min: -3, max: 3 }),
    dy: fc.integer({ min: -3, max: 3 }),
  }),
  fc.record({
    op: fc.constant('update' as const),
    kind: fc.constant('object' as const),
    floorId: pick(['floor-1', 'floor-2']),
    id: pick(['obj-1', 'obj-2', 'obj-3']),
    patch: fc.record({
      label: fc.string({ maxLength: 4 }),
      rotation: fc.integer({ min: 0, max: 90 }),
    }),
  }),
  fc.record({
    op: fc.constant('update' as const),
    kind: fc.constant('room' as const),
    floorId: fc.constant('floor-1'),
    id: pick(['room-1', 'room-2']),
    patch: fc.record({
      name: fc.string({ maxLength: 4 }),
      colourSlot: fc.integer({ min: 1, max: 8 }),
    }),
  }),
  fc.record({
    op: fc.constant('add' as const),
    kind: fc.constant('object' as const),
    floorId: pick(['floor-1', 'floor-2']),
    element: pick(['obj-1', 'obj-3', 'obj-4']).map((id) => object(id)),
  }),
  fc.record({
    op: fc.constant('remove' as const),
    kind: pick(['room', 'wall', 'opening', 'object', 'annotation', 'placement'] as const),
    floorId: pick(['floor-1', 'floor-2']),
    id: pick(['room-1', 'wall-1', 'op-2', 'obj-1', 'a-1', DEVICE]),
  }),
  fc.record({
    op: fc.constant('reorderFloors' as const),
    order: pick([['floor-2', 'floor-1'], ['floor-1']]),
  }),
  fc.record({
    op: fc.constant('setFloor' as const),
    floorId: pick(['floor-1', 'floor-2']),
    patch: fc.record({ name: fc.string({ maxLength: 4 }) }),
  }),
  fc.record({ op: fc.constant('removeFloor' as const), floorId: pick(['floor-1', 'floor-2']) }),
  fc.record({ op: fc.constant('addFloor' as const), floor: fc.constant(floor('floor-3', 2)) }),
);

describe('properties', () => {
  it('applying a batch then its inverse restores the document and never mutates the input', () => {
    fc.assert(
      fc.property(fc.array(opArbitrary, { maxLength: 10 }), (ops) => {
        const input = base();
        const frozen = structuredClone(input);
        const result = applyHomeMapEdits(input, ops, USER);
        expect(input).toEqual(frozen);
        expect(HOME_MAP.safeParse(result.map).success).toBe(true);
        expect(result.applied.length + result.conflicts.length).toBe(ops.length);
        const back = applyHomeMapEdits(result.map, result.inverse, USER);
        expect(back.conflicts).toEqual([]);
        expect(settle(back.map)).toEqual(settle(input));
      }),
      { numRuns: 20 },
    );
  });

  it('a move followed by the opposite move restores the position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        (dx, dy) => {
          const targets = [
            ['room', 'room-1'],
            ['wall', 'wall-1'],
            ['annotation', 'a-2'],
            ['placement', DEVICE],
            ['object', 'obj-1'],
          ] as const;
          const ops: HomeMapOp[] = targets.flatMap(([kind, id]) => [
            { op: 'move' as const, kind, floorId: 'floor-1', id, dx, dy },
            { op: 'move' as const, kind, floorId: 'floor-1', id, dx: -dx, dy: -dy },
          ]);
          const result = applyHomeMapEdits(base(), ops, SOURCE);
          expect(result.conflicts).toEqual([]);
          const before = first(base().floors);
          const after = first(result.map.floors);
          expect(first(after.rooms).polygon).toEqual(first(before.rooms).polygon);
          expect(first(after.walls)).toEqual(first(before.walls));
          expect(first(after.objects).at).toEqual(first(before.objects).at);
        },
      ),
      { numRuns: 20 },
    );
  });
});
