import {
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_POINT,
  HOME_MAP_OBJECT_WRITE,
  homeMapPolygonArea,
  type HomeMap,
  type HomeMapOp,
  type HomeMapRoom,
  type VacuumScene,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FrameCheck } from '../../src/home-map/merge/pipeline';
import { rectifyPoint } from '../../src/home-map/merge/rectify';
import {
  NOW,
  den,
  edit,
  emptyMap,
  floorOf,
  hall,
  importScene,
  jitter,
  newId,
  planFor,
  robotRoom,
  withRooms,
} from './import-fixtures';
import { rectRing, syntheticScene } from './scene-fixtures';

const HELD_DOCK = z.object({ at: HOME_MAP_POINT });

const first = (): HomeMap => importScene(emptyMap(), syntheticScene).map;

const roomNamed = (map: HomeMap, name: string): HomeMapRoom => {
  const found = floorOf(map).rooms.find((room) => room.name === name);
  if (!found) throw new Error(`no room ${name}`);
  return found;
};

const kindsOf = (ops: readonly HomeMapOp[]): readonly string[] =>
  ops.flatMap((op) => ('kind' in op ? [`${op.op}:${op.kind}`] : [op.op]));

const noticeOp = (kind: 'source_moved' | 'source_changed', detail: string): HomeMapOp => ({
  op: 'add',
  kind: 'notice',
  element: HOME_MAP_NOTICE_WRITE.parse({
    id: newId(),
    kind,
    elementId: 'src-1',
    detail,
    createdAt: NOW,
  }),
});

describe('the first import', () => {
  it('creates the floor, the source and everything the robot map holds in one revision', () => {
    const { plan, map } = importScene(emptyMap(), syntheticScene);
    expect(plan.kind).toBe('first');
    if (plan.kind !== 'first') return;
    expect(plan.actor).toBe('source:src-1');
    expect(kindsOf(plan.ops)[0]).toBe('addFloor');
    expect(map.revision).toBe(1);
    const floor = floorOf(map);
    expect(floor.name).toBe('Ground floor');
    expect([floor.rooms.length, floor.walls.length, floor.openings.length]).toEqual([2, 7, 1]);
    expect(floor.objects.length).toBeGreaterThan(0);
    expect(floor.placements).toHaveLength(1);
    expect(map.sources[0]?.tombstones).toEqual([]);
  });

  it('uses a floor that already exists', () => {
    const floored = edit(emptyMap(), [
      {
        op: 'addFloor',
        floor: {
          id: 'floor-0',
          name: 'Mine',
          level: 0,
          elevation: 0,
          ceilingHeight: 2.6,
          rooms: [],
          walls: [],
          openings: [],
          objects: [],
          placements: [],
          annotations: [],
        },
      },
    ]);
    const { plan, map } = importScene(floored, syntheticScene);
    expect(kindsOf(plan.kind === 'noop' ? [] : plan.ops)).not.toContain('addFloor');
    expect(floorOf(map).name).toBe('Mine');
    expect(map.floors).toHaveLength(1);
  });
});

describe('a re-import with nothing beyond the tolerance', () => {
  it('writes nothing, no revision, for the same scene and for robot noise under 2 cm', () => {
    const map = first();
    for (const scene of [syntheticScene, jitter(syntheticScene)]) {
      const result = importScene(map, scene);
      expect(result.plan).toEqual({ kind: 'noop' });
      expect(result.map).toBe(map);
    }
  });
});

describe('one transaction, one revision', () => {
  const changed = (): VacuumScene => {
    const scene = withRooms(hall(), { ...den(rectRing(4.1, 0, 8.35, 3)), floor: 4010 });
    return {
      ...scene,
      doors: scene.doors.map((door) => ({
        ...door,
        from: { ...door.from, y: door.from.y + 0.2 },
        to: { ...door.to, y: door.to.y + 0.2 },
      })),
      carpets: scene.carpets.map((carpet) => ({
        ...carpet,
        ring: rectRing(1.2, 1, 2.7, 2),
      })),
    };
  };

  it('puts rooms, walls, openings, floor material and the base into one revision of the source actor', () => {
    const before = first();
    const { plan, map } = importScene(before, changed());
    if (plan.kind !== 'merge') throw new Error('expected a merge');
    expect(plan.actor).toBe('source:src-1');
    const kinds = new Set(kindsOf(plan.ops));
    for (const expected of ['update:wall', 'update:opening', 'update:source']) {
      expect(kinds).toContain(expected);
    }
    expect(plan.ops.filter((op) => op.op === 'update' && op.kind === 'room').length).toBe(2);
    expect(map.revision).toBe(before.revision + 1);
    expect(roomNamed(map, 'Den').floorMaterial).toMatchObject({ kind: 'wood' });
    expect(map.sources[0]?.lastImportedAt).toBe(NOW);
    expect(map.sources[0]?.base['carpets']).toHaveLength(1);
    expect(importScene(map, changed()).plan.kind).toBe('noop');
  });
});

describe('rule 7: objects, placements, names, paint, annotations and floors are never touched', () => {
  it('leaves the user work and the source objects as they were', () => {
    const base = first();
    const chair = HOME_MAP_OBJECT_WRITE.parse({
      id: 'chair',
      modelId: 'cat.seating.chair',
      finish: null,
      params: {},
      at: { x: 2, y: 2 },
      rotation: 0,
      elevation: 0,
      label: 'Reading chair',
      locked: false,
      origin: { kind: 'hand' },
    });
    const edited = edit(base, [
      { op: 'add', kind: 'object', floorId: 'floor-0', element: chair },
      {
        op: 'add',
        kind: 'annotation',
        floorId: 'floor-0',
        element: { id: 'note', kind: 'note', at: { x: 1, y: 1 }, text: 'Fix the lamp' },
      },
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: roomNamed(base, 'Den').id,
        patch: { name: 'Cinema', wallPaint: 'navy', ceilingHeight: 3 },
      },
      { op: 'setFloor', floorId: 'floor-0', patch: { name: 'Main floor', ceilingHeight: 2.8 } },
    ]);
    const scene = withRooms(hall(), den(rectRing(4.1, 0, 8.35, 3)));
    const { map } = importScene(edited, scene);
    const [before, after] = [floorOf(edited), floorOf(map)];
    expect(after.objects).toEqual(before.objects);
    expect(after.placements).toEqual(before.placements);
    expect(after.annotations).toEqual(before.annotations);
    expect([after.name, after.ceilingHeight]).toEqual(['Main floor', 2.8]);
    expect(roomNamed(map, 'Cinema')).toMatchObject({ wallPaint: 'navy', ceilingHeight: 3 });
    expect(homeMapPolygonArea(roomNamed(map, 'Cinema').polygon)).toBeCloseTo(12.75, 1);
  });
});

describe('rules 1 to 5 inside the pipeline', () => {
  it('rule 1: a room the user did not change follows the robot', () => {
    const { map } = importScene(first(), withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3))));
    expect(homeMapPolygonArea(roomNamed(map, 'Den').polygon)).toBeCloseTo(15, 1);
  });

  it('rule 2: a reshaped room keeps the user polygon and gets a choice', () => {
    const base = first();
    const edited = edit(base, [
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: roomNamed(base, 'Den').id,
        patch: { polygon: { outer: rectRing(4.1, 0, 7.6, 3), holes: [] } },
      },
    ]);
    const { map } = importScene(edited, withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3))));
    expect(roomNamed(map, 'Den').polygon).toEqual(roomNamed(edited, 'Den').polygon);
    expect(map.notices.map((notice) => notice.kind)).toEqual(['source_changed']);
  });

  it('rule 3: a room missing from the scene stays with a notice', () => {
    const { map } = importScene(first(), withRooms(hall()));
    expect(floorOf(map).rooms).toHaveLength(2);
    expect(map.notices.map((notice) => notice.kind)).toEqual(['source_missing']);
  });

  it('rule 4: a new robot room is added with its source origin and no hand room link', () => {
    const study = robotRoom(den(), 3, 'Study', rectRing(8.2, 0, 10.2, 3));
    const { map } = importScene(first(), withRooms(hall(), den(), study));
    expect(roomNamed(map, 'Study')).toMatchObject({
      homeRoomId: null,
      origin: { kind: 'source', sourceId: 'src-1', ref: '3', overridden: [] },
    });
  });

  it('rule 5: a room the robot gave a new id is matched by overlap and keeps its id', () => {
    const base = first();
    const renumbered = robotRoom(den(), 5, 'Den', rectRing(4.1, 0, 8.1, 3));
    const { map } = importScene(base, withRooms(hall(), renumbered));
    expect(roomNamed(map, 'Den').id).toBe(roomNamed(base, 'Den').id);
    expect(roomNamed(map, 'Den').origin).toMatchObject({ ref: '5' });
    expect(map.notices).toEqual([]);
  });
});

describe('rule 10: floor material', () => {
  const sceneWith = (hallCode: number, denCode: number): VacuumScene =>
    withRooms({ ...hall(), floor: hallCode }, { ...den(), floor: denCode });

  it('imports a new robot floor code into a room the user gave no material', () => {
    const { map } = importScene(first(), sceneWith(4000, 9999));
    expect(roomNamed(map, 'Hall').floorMaterial).toMatchObject({ kind: 'tile' });
  });

  it('never replaces a material the user picked', () => {
    const base = first();
    const edited = edit(base, [
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: roomNamed(base, 'Den').id,
        patch: { floorMaterial: { kind: 'carpet', variant: null, tint: null } },
      },
    ]);
    const { map } = importScene(edited, sceneWith(4010, 4010));
    expect(roomNamed(map, 'Den').floorMaterial).toMatchObject({ kind: 'carpet' });
  });

  it('shows an unknown robot code as no material and keeps the number, never guessed', () => {
    const { map } = importScene(first(), sceneWith(7777, 9999));
    expect(roomNamed(map, 'Hall').floorMaterial).toEqual({
      kind: 'plain',
      variant: null,
      tint: null,
    });
    expect(map.sources[0]?.base.rooms.map((room) => room['floorCode'])).toEqual([7777, 9999]);
  });

  it('refreshes the held dock from the rectified scene on a keep', () => {
    const { map } = importScene(first(), {
      ...sceneWith(4010, 4010),
      dock: { x: 3.5, y: 2.5, yaw: 0 },
    });
    const source = map.sources[0];
    if (!source) throw new Error('source');
    const expected = rectifyPoint(source.transform, { x: 3.5, y: 2.5 });
    const { at } = HELD_DOCK.parse(source.base['dock']);
    expect(at.x).toBeCloseTo(expected.x, 6);
    expect(at.y).toBeCloseTo(expected.y, 6);
  });

  it('writes nothing when the robot code did not change', () => {
    expect(importScene(first(), sceneWith(4010, 9999)).plan.kind).toBe('noop');
  });
});

describe('the frame check comes first', () => {
  const widened = (): VacuumScene => withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3)));

  it('stops the import after writing the notice, so nothing under the user moves', () => {
    const base = first();
    const refuse: FrameCheck = () => ({
      kind: 'refuse',
      ops: [noticeOp('source_moved', 'The robot map moved. Align it.')],
    });
    const { plan, map } = importScene(base, widened(), refuse);
    expect(plan.kind).toBe('refused');
    if (plan.kind !== 'refused') return;
    expect(kindsOf(plan.ops)).toEqual(['add:notice']);
    expect(map.revision).toBe(base.revision + 1);
    expect(floorOf(map)).toEqual(floorOf(base));
    expect(map.sources[0]).toEqual(base.sources[0]);
  });

  it('writes nothing when it refuses and the notice is already there', () => {
    const refuse: FrameCheck = () => ({ kind: 'refuse', ops: [] });
    expect(planFor(first(), widened(), refuse)).toEqual({ kind: 'noop' });
  });

  it('applies a realignment with its notice and then merges the scene in the new frame', () => {
    const base = first();
    const seen: string[] = [];
    const realign: FrameCheck = (input) => {
      seen.push(`${input.source.id}:${input.floor.id}:${String(input.map.revision)}`);
      return {
        kind: 'realign',
        transform: { ...input.source.transform, tx: input.source.transform.tx + 0.1 },
        ops: [noticeOp('source_moved', 'The robot map moved, the map was realigned: check it.')],
      };
    };
    const { map } = importScene(base, syntheticScene, realign);
    expect(seen).toEqual(['src-1:floor-0:1']);
    expect(map.sources[0]?.transform.tx).toBeCloseTo((base.sources[0]?.transform.tx ?? 0) + 0.1, 9);
    expect(map.notices.map((notice) => notice.kind)).toEqual(['source_moved']);
    expect(map.revision).toBe(base.revision + 1);
    expect(roomNamed(map, 'Hall').polygon.outer[0]?.x).toBeCloseTo(0.6, 6);
  });
});
