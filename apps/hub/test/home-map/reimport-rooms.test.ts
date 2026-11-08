import {
  HOME_MAP_SCHEMA_VERSION,
  HOME_MAP_WRITE,
  applyHomeMapEdits,
  homeMapPolygonArea,
  vacuumSceneToSourceGeometry,
  type HomeMap,
  type HomeMapActor,
  type HomeMapOp,
  type HomeMapRoom,
  type VacuumScene,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { firstImport } from '../../src/home-map/merge/first-import';
import { reimportRooms, type ReimportRoomsResult } from '../../src/home-map/merge/reimport-rooms';
import { rectifyScene } from '../../src/home-map/merge/rectify';
import { fixtureScene, rectRing, syntheticScene, type SceneRing } from './scene-fixtures';

const DEVICE = '3f2b8c1e-5d4a-4b6f-9a77-1c2d3e4f5a6b';
const NOW = '2026-10-25T10:00:00.000Z';
const ROBOT: HomeMapActor = 'source:src-1';
const USER: HomeMapActor = 'profile:me';

let counter = 0;
const newId = (): string => `n-${String((counter += 1))}`;

const mapOf = (scene: VacuumScene): HomeMap => {
  const first = firstImport({
    geometry: vacuumSceneToSourceGeometry(scene),
    sourceKind: 'xiaomi_vacuum',
    sourceId: 'src-1',
    deviceId: DEVICE,
    floorId: 'floor-0',
    importedAt: NOW,
    newId,
  });
  return HOME_MAP_WRITE.parse({
    id: 'home',
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    revision: 1,
    name: 'Home',
    north: 0,
    updatedAt: NOW,
    floors: [
      {
        id: 'floor-0',
        name: 'Ground',
        level: 0,
        elevation: 0,
        ceilingHeight: 2.6,
        rooms: first.rooms,
        walls: first.walls,
        openings: first.openings,
        objects: first.objects,
        placements: first.placements,
        annotations: [],
      },
    ],
    sources: [first.source],
    notices: [],
  });
};

const reimport = (map: HomeMap, scene: VacuumScene): ReimportRoomsResult => {
  const source = map.sources[0];
  const floor = map.floors[0];
  if (!source || !floor) throw new Error('no source');
  return reimportRooms({
    source,
    floor,
    notices: map.notices,
    scene: rectifyScene(vacuumSceneToSourceGeometry(scene), source.transform).rooms,
    importedAt: NOW,
    newId,
  });
};

const commit = (map: HomeMap, result: ReimportRoomsResult): HomeMap => {
  const source = map.sources[0];
  const ops: HomeMapOp[] = [...result.ops];
  if (source && result.baseChanged) {
    ops.push({
      op: 'update',
      kind: 'source',
      id: source.id,
      patch: { base: { ...source.base, rooms: result.baseRooms } },
    });
  }
  const applied = applyHomeMapEdits(map, ops, { actor: ROBOT, at: NOW });
  expect(applied.conflicts).toEqual([]);
  return HOME_MAP_WRITE.parse(applied.map);
};

const edit = (map: HomeMap, ops: HomeMapOp[]): HomeMap => {
  const applied = applyHomeMapEdits(map, ops, { actor: USER, at: NOW });
  expect(applied.conflicts).toEqual([]);
  return applied.map;
};

const ofKind = (ops: readonly HomeMapOp[], kind: string): readonly HomeMapOp[] =>
  ops.filter((op) => 'kind' in op && op.kind === kind);

const overriddenOf = (room: HomeMapRoom): readonly string[] =>
  room.origin.kind === 'source' ? room.origin.overridden : [];

const roomsOf = (map: HomeMap): readonly HomeMapRoom[] => map.floors[0]?.rooms ?? [];
const roomNamed = (map: HomeMap, name: string): HomeMapRoom => {
  const found = roomsOf(map).find((room) => room.name === name);
  if (!found) throw new Error(`no room ${name}`);
  return found;
};

const robotRoom = (
  base: VacuumScene['rooms'][number],
  id: number,
  name: string,
  ring: SceneRing,
): VacuumScene['rooms'][number] => ({
  ...base,
  id,
  name,
  label: { x: (ring[0]?.x ?? 0) + 0.5, y: (ring[0]?.y ?? 0) + 0.5 },
  rings: [ring],
});

const [HALL, DEN] = syntheticScene.rooms;
if (!HALL || !DEN) throw new Error('fixture rooms');
const withRooms = (...rooms: VacuumScene['rooms']): VacuumScene => ({ ...syntheticScene, rooms });
const hall = (ring: SceneRing = rectRing(0, 0, 4, 3)): VacuumScene['rooms'][number] =>
  robotRoom(HALL, 1, 'Hall', ring);
const den = (ring: SceneRing = rectRing(4.1, 0, 8.1, 3)): VacuumScene['rooms'][number] =>
  robotRoom(DEN, 2, 'Den', ring);

const jitter = (scene: VacuumScene): VacuumScene => ({
  ...scene,
  rooms: scene.rooms.map((room) => ({
    ...room,
    rings: room.rings.map((ring) =>
      ring.map((p, i) => ({
        x: p.x + (i % 2 === 0 ? 0.008 : -0.008),
        y: p.y + (i % 3 === 0 ? 0.006 : -0.006),
      })),
    ),
  })),
});

describe('a jittered scene makes no revision', () => {
  it('writes nothing for robot noise under 2 cm on the synthetic house', () => {
    const map = mapOf(syntheticScene);
    const result = reimport(map, jitter(syntheticScene));
    expect(result.ops).toEqual([]);
    expect(result.baseChanged).toBe(false);
  });

  it('writes nothing for the same scene or its jittered copy on the synthetic vacuum fixture', () => {
    const map = mapOf(fixtureScene);
    for (const scene of [fixtureScene, jitter(fixtureScene)]) {
      const result = reimport(map, scene);
      expect(result.ops).toEqual([]);
      expect(result.baseChanged).toBe(false);
    }
  });

  it('does not let repeated jitter drift the base', () => {
    let map = mapOf(syntheticScene);
    const before = JSON.stringify(map.sources[0]?.base.rooms);
    for (let round = 0; round < 5; round += 1) {
      map = commit(map, reimport(map, jitter(syntheticScene)));
    }
    expect(JSON.stringify(map.sources[0]?.base.rooms)).toBe(before);
    expect(map.revision).toBe(1);
  });
});

describe('rule 1: a room the user did not change follows the robot', () => {
  it('replaces the polygon and the label beyond the tolerance, only for that room', () => {
    const map = mapOf(syntheticScene);
    const result = reimport(map, withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3))));
    expect(result.ops).toHaveLength(1);
    const next = commit(map, result);
    expect(homeMapPolygonArea(roomNamed(next, 'Den').polygon)).toBeCloseTo(15, 1);
    expect(roomNamed(next, 'Hall')).toEqual(roomNamed(map, 'Hall'));
    expect(roomNamed(next, 'Den').origin).toEqual(roomNamed(map, 'Den').origin);
    expect(
      homeMapPolygonArea(next.sources[0]?.base.rooms[1]?.polygon ?? { outer: [], holes: [] }),
    ).toBeCloseTo(15, 1);
  });

  it('keeps a label the user moved and never touches name, material, paint or ceiling', () => {
    let map = mapOf(syntheticScene);
    const denId = roomNamed(map, 'Den').id;
    map = edit(map, [
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: denId,
        patch: {
          name: 'Cinema',
          labelAt: { x: 7, y: 2 },
          floorMaterial: { kind: 'carpet', variant: null, tint: null },
          wallPaint: 'navy',
          ceilingHeight: 3,
        },
      },
    ]);
    const result = reimport(
      map,
      withRooms(hall(), robotRoom(DEN, 2, 'Den renamed', rectRing(4.1, 0, 9.1, 3))),
    );
    const patches = result.ops.flatMap((op) => (op.op === 'update' ? [Object.keys(op.patch)] : []));
    expect(patches).toEqual([['polygon']]);
    const next = commit(map, result);
    const room = roomNamed(next, 'Cinema');
    expect(room).toMatchObject({
      labelAt: { x: 7, y: 2 },
      wallPaint: 'navy',
      ceilingHeight: 3,
      floorMaterial: { kind: 'carpet' },
    });
    expect(overriddenOf(room)).toContain('name');
    expect(overriddenOf(room)).not.toContain('polygon');
  });

  it('is applied by the source actor without marking the room as user changed', () => {
    const map = mapOf(syntheticScene);
    const next = commit(map, reimport(map, withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3)))));
    expect(roomNamed(next, 'Den').origin).toMatchObject({ overridden: [] });
  });
});

describe('rule 2: a room the user reshaped keeps the user polygon', () => {
  const reshaped = (): HomeMap => {
    const map = mapOf(syntheticScene);
    const patch = {
      polygon: { outer: rectRing(4.1, 0, 7.6, 3), holes: [] },
    };
    return edit(map, [
      { op: 'update', kind: 'room', floorId: 'floor-0', id: roomNamed(map, 'Den').id, patch },
    ]);
  };

  it('offers the choice with a notice when the robot shape differs by more than 10 percent', () => {
    const map = reshaped();
    const result = reimport(map, withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3))));
    expect(ofKind(result.ops, 'room')).toEqual([]);
    const next = commit(map, result);
    expect(roomNamed(next, 'Den').polygon).toEqual(roomNamed(map, 'Den').polygon);
    expect(next.notices).toHaveLength(1);
    expect(next.notices[0]).toMatchObject({
      kind: 'source_changed',
      elementId: roomNamed(map, 'Den').id,
    });
    expect(next.notices[0]?.detail).toContain("Use the robot's shape");
    expect(next.notices[0]?.detail).toContain('keep yours');
    expect(
      homeMapPolygonArea(next.sources[0]?.base.rooms[1]?.polygon ?? { outer: [], holes: [] }),
    ).toBeCloseTo(15, 1);
  });

  it('raises the notice once per room and does not repeat it on the next identical scene', () => {
    const map = reshaped();
    const scene = withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3)));
    const next = commit(map, reimport(map, scene));
    const again = reimport(next, scene);
    expect(again.ops).toEqual([]);
    expect(again.baseChanged).toBe(false);
  });

  it('raises the notice for a thin spike that changes the area by less than 1 percent', () => {
    const map = reshaped();
    const spiked: SceneRing = [
      { x: 4.1, y: 0 },
      { x: 8.1, y: 0 },
      { x: 8.1, y: 3 },
      { x: 6.2, y: 3 },
      { x: 6.1, y: 3.5 },
      { x: 6.0, y: 3 },
      { x: 4.1, y: 3 },
    ];
    const result = reimport(map, withRooms(hall(), den(spiked)));
    expect(ofKind(result.ops, 'notice')).toHaveLength(1);
  });

  it('stays silent when the robot shape is within 10 percent and 0.3 m, and leaves the base alone', () => {
    const map = reshaped();
    const result = reimport(map, withRooms(hall(), den(rectRing(4.1, 0, 8.3, 3))));
    expect(result.ops).toEqual([]);
    expect(result.baseChanged).toBe(false);
  });
});

describe('rule 3: a room missing from the new scene is never deleted', () => {
  it('stays with a source_missing notice, once, and the notice goes when the room returns', () => {
    const map = mapOf(syntheticScene);
    const gone = withRooms(hall());
    const first = commit(map, reimport(map, gone));
    expect(roomsOf(first)).toHaveLength(2);
    expect(first.notices).toHaveLength(1);
    expect(first.notices[0]).toMatchObject({
      kind: 'source_missing',
      elementId: roomNamed(map, 'Den').id,
    });
    const second = reimport(first, gone);
    expect(second.ops).toEqual([]);
    expect(second.baseChanged).toBe(false);
    const back = commit(first, reimport(first, withRooms(hall(), den())));
    expect(back.notices).toEqual([]);
    expect(roomsOf(back)).toHaveLength(2);
  });
});

describe('rule 4: a new robot room is added with its source origin', () => {
  const study = robotRoom(DEN, 3, 'Study', rectRing(8.2, 0, 10.2, 3));

  it('adds it with a source origin and no hand room link', () => {
    const map = mapOf(syntheticScene);
    const next = commit(map, reimport(map, withRooms(hall(), den(), study)));
    const added = roomNamed(next, 'Study');
    expect(added.origin).toEqual({ kind: 'source', sourceId: 'src-1', ref: '3', overridden: [] });
    expect(added.homeRoomId).toBeNull();
    expect(added.colourSlot).toBe(3);
    expect(next.sources[0]?.base.rooms.map((room) => room.ref)).toEqual(['1', '2', '3']);
  });

  it('does not bring a room back that the user deleted while the robot still has it', () => {
    const map = mapOf(syntheticScene);
    const scene = withRooms(hall(), den(), study);
    let next = commit(map, reimport(map, scene));
    next = edit(next, [
      { op: 'remove', kind: 'room', floorId: 'floor-0', id: roomNamed(next, 'Study').id },
    ]);
    expect(reimport(next, scene).ops).toEqual([]);
  });
});

describe('rule 5: changed ids are matched by overlap', () => {
  it('rebinds renumbered rooms with IoU of at least 0.5 and adds or flags nothing', () => {
    const map = mapOf(syntheticScene);
    const renumbered = withRooms(
      robotRoom(HALL, 11, 'Hall', rectRing(0, 0, 4, 3.2)),
      robotRoom(DEN, 12, 'Den', rectRing(4.1, 0, 8.4, 3)),
    );
    const result = reimport(map, renumbered);
    expect(result.ops.filter((op) => op.op === 'add')).toEqual([]);
    expect(ofKind(result.ops, 'notice')).toEqual([]);
    const next = commit(map, result);
    expect(roomsOf(next).map((room) => room.origin)).toMatchObject([{ ref: '11' }, { ref: '12' }]);
    expect(roomsOf(next)).toHaveLength(2);
    expect(next.sources[0]?.base.rooms.map((room) => room.ref)).toEqual(['11', '12']);
  });

  it('keeps the user polygon of a renumbered room and only rebinds the ref', () => {
    let map = mapOf(syntheticScene);
    const hallId = roomNamed(map, 'Hall').id;
    const polygon = { outer: rectRing(0, 0, 3.9, 3), holes: [] };
    map = edit(map, [
      { op: 'update', kind: 'room', floorId: 'floor-0', id: hallId, patch: { polygon } },
    ]);
    const renumbered = withRooms(robotRoom(HALL, 11, 'Hall', rectRing(0, 0, 4, 3)), den());
    const next = commit(map, reimport(map, renumbered));
    expect(roomNamed(next, 'Hall').polygon).toEqual(polygon);
    expect(roomNamed(next, 'Hall').origin).toMatchObject({ ref: '11', overridden: ['polygon'] });
  });

  it('keeps the old room and adds a split notice when one room became several', () => {
    const map = mapOf(syntheticScene);
    const quarters = [
      robotRoom(HALL, 21, 'Hall A', rectRing(0, 0, 2, 1.5)),
      robotRoom(HALL, 22, 'Hall B', rectRing(2, 0, 4, 1.5)),
      robotRoom(HALL, 23, 'Hall C', rectRing(0, 1.5, 2, 3)),
      robotRoom(HALL, 24, 'Hall D', rectRing(2, 1.5, 4, 3)),
    ];
    const next = commit(map, reimport(map, withRooms(...quarters, den())));
    expect(roomsOf(next)).toHaveLength(2);
    expect(roomNamed(next, 'Hall').polygon).toEqual(roomNamed(map, 'Hall').polygon);
    expect(next.notices).toHaveLength(1);
    expect(next.notices[0]).toMatchObject({
      kind: 'source_changed',
      elementId: roomNamed(map, 'Hall').id,
    });
    expect(next.notices[0]?.detail).toContain('Split like the robot');
    expect(next.sources[0]?.base.rooms.map((room) => room.ref)).toEqual([
      '21',
      '22',
      '23',
      '24',
      '2',
      '1',
    ]);
  });

  it('lets the larger part carry a room split in two and adds the other part as a new room', () => {
    const map = mapOf(syntheticScene);
    const split = withRooms(
      robotRoom(HALL, 31, 'Hall', rectRing(0, 0, 2.8, 3)),
      robotRoom(HALL, 32, 'Pantry', rectRing(2.8, 0, 4, 3)),
      den(),
    );
    const next = commit(map, reimport(map, split));
    expect(roomsOf(next)).toHaveLength(3);
    expect(roomNamed(next, 'Hall').origin).toMatchObject({ ref: '31' });
    expect(roomNamed(next, 'Pantry').origin).toMatchObject({ ref: '32' });
    expect(next.notices).toEqual([]);
  });

  it('flags the room that a merge leaves without a counterpart as missing', () => {
    const map = mapOf(syntheticScene);
    const merged = withRooms(robotRoom(HALL, 41, 'Great room', rectRing(0, 0, 5.5, 3)));
    const next = commit(map, reimport(map, merged));
    expect(roomNamed(next, 'Hall').origin).toMatchObject({ ref: '41' });
    expect(homeMapPolygonArea(roomNamed(next, 'Hall').polygon)).toBeCloseTo(16.5, 1);
    expect(next.notices).toMatchObject([
      { kind: 'source_missing', elementId: roomNamed(map, 'Den').id },
    ]);
  });
});

describe('the robot floor code', () => {
  it('moves the base only, without a room change, when just the code differs', () => {
    const map = mapOf(syntheticScene);
    const result = reimport(
      map,
      withRooms({ ...robotRoom(HALL, 1, 'Hall', rectRing(0, 0, 4, 3)), floor: 9999 }, den()),
    );
    expect(result.ops).toEqual([]);
    expect(result.baseChanged).toBe(true);
    expect(result.baseRooms[0]?.floorCode).toBe(9999);
  });
});
