import {
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_WALL_WRITE,
  type HomeMap,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapWall,
  type VacuumScene,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  den,
  edit,
  emptyMap,
  floorOf,
  hall,
  importScene,
  jitter,
  planFor,
  withRooms,
} from './import-fixtures';
import { rectRing, syntheticScene } from './scene-fixtures';

const first = (): HomeMap => importScene(emptyMap(), syntheticScene).map;

const widened = (): VacuumScene => withRooms(hall(), den(rectRing(4.1, 0, 8.35, 3)));

const shiftedDoor = (dy: number): VacuumScene => ({
  ...syntheticScene,
  doors: syntheticScene.doors.map((door) => ({
    ...door,
    from: { ...door.from, y: door.from.y + dy },
    to: { ...door.to, y: door.to.y + dy },
  })),
});

const wallAt = (map: HomeMap, ref: string): HomeMapWall => {
  const found = floorOf(map).walls.find(
    (wall) => wall.origin.kind === 'source' && wall.origin.ref === ref,
  );
  if (!found) throw new Error(`no wall ${ref}`);
  return found;
};

const sourceOpening = (map: HomeMap): HomeMapOpening => {
  const found = floorOf(map).openings.find((opening) => opening.origin.kind === 'source');
  if (!found) throw new Error('no source opening');
  return found;
};

const kindsOf = (ops: readonly HomeMapOp[]): readonly string[] =>
  ops.flatMap((op) => ('kind' in op ? [`${op.op}:${op.kind}`] : [op.op]));

const handWall = HOME_MAP_WALL_WRITE.parse({
  id: 'hand-wall',
  from: { x: 1, y: 1 },
  to: { x: 3, y: 1 },
  thickness: 0.1,
  height: null,
  kind: 'solid',
  origin: { kind: 'hand' },
});

const handOpening = (id: string, wallId: string): HomeMapOpening =>
  HOME_MAP_OPENING_WRITE.parse({
    id,
    wallId,
    offset: 0.5,
    width: 0.8,
    kind: 'window',
    sillHeight: 0.9,
    headHeight: 2.1,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    origin: { kind: 'hand' },
  });

const addOpening = (map: HomeMap, opening: HomeMapOpening): HomeMap =>
  edit(map, [{ op: 'add', kind: 'opening', floorId: 'floor-0', element: opening }]);

describe('rule 6: walls and openings generated from the source are regenerated', () => {
  it('moves an unchanged source wall with the robot and keeps its id and origin', () => {
    const before = first();
    const { plan, map } = importScene(before, widened());
    expect(plan.kind).toBe('merge');
    const next = wallAt(map, 'w5');
    expect(next.id).toBe(wallAt(before, 'w5').id);
    expect(next.from.x).toBeCloseTo(8.85, 6);
    expect(next.origin).toMatchObject({ kind: 'source', overridden: [] });
    expect(floorOf(map).walls).toHaveLength(7);
    expect(wallAt(map, 'w2')).toEqual(wallAt(before, 'w2'));
  });

  it('writes nothing again for the same scene or for robot noise under 2 cm', () => {
    const { map } = importScene(first(), widened());
    expect(importScene(map, widened()).plan.kind).toBe('noop');
    expect(importScene(map, jitter(widened())).plan.kind).toBe('noop');
    expect(importScene(first(), jitter(syntheticScene)).plan.kind).toBe('noop');
  });

  it('keeps every property the user changed and updates only the others', () => {
    const before = first();
    const target = wallAt(before, 'w5');
    const edited = edit(before, [
      {
        op: 'update',
        kind: 'wall',
        floorId: 'floor-0',
        id: target.id,
        patch: { thickness: 0.3, to: { x: 8.6, y: 3 } },
      },
    ]);
    const { map } = importScene(edited, widened());
    const next = wallAt(map, 'w5');
    expect(next.thickness).toBe(0.3);
    expect(next.to).toEqual({ x: 8.6, y: 3 });
    expect(next.from.x).toBeCloseTo(8.85, 6);
    expect(next.origin).toMatchObject({ overridden: ['to', 'thickness'] });
    expect(wallAt(map, 'w4').to.x).toBeCloseTo(8.85, 6);
  });

  it('never touches walls and openings the user added', () => {
    const before = first();
    const onSource = handOpening('hand-on-source', wallAt(before, 'w6').id);
    const onHand = handOpening('hand-on-hand', 'hand-wall');
    const edited = addOpening(
      addOpening(
        edit(before, [{ op: 'add', kind: 'wall', floorId: 'floor-0', element: handWall }]),
        onHand,
      ),
      onSource,
    );
    const { map } = importScene(edited, withRooms(hall()));
    expect(floorOf(map).walls.find((wall) => wall.id === 'hand-wall')).toEqual(handWall);
    expect(floorOf(map).openings.find((o) => o.id === 'hand-on-hand')).toEqual(onHand);
    expect(floorOf(map).openings.find((o) => o.id === 'hand-on-source')).toEqual(onSource);
  });
});

describe('rule 6: a source wall the robot no longer has', () => {
  const lost = (map: HomeMap): HomeMap => importScene(map, withRooms(hall())).map;
  const refsOf = (map: HomeMap): readonly string[] =>
    floorOf(map).walls.flatMap((wall) => (wall.origin.kind === 'source' ? [wall.origin.ref] : []));

  it('is removed when the user never changed it', () => {
    const map = lost(first());
    expect(refsOf(map)).toEqual(['w0', 'w1', 'w2', 'w3']);
    expect(map.sources[0]?.base.walls.map((wall) => wall.ref)).toEqual(['w0', 'w1', 'w2', 'w3']);
  });

  it('stays when the user changed it', () => {
    const before = first();
    const edited = edit(before, [
      {
        op: 'update',
        kind: 'wall',
        floorId: 'floor-0',
        id: wallAt(before, 'w5').id,
        patch: { thickness: 0.3 },
      },
    ]);
    expect(refsOf(lost(edited))).toContain('w5');
    expect(refsOf(lost(edited))).not.toContain('w4');
  });

  it('stays while an opening of the user sits on it', () => {
    const before = first();
    const withWindow = addOpening(before, handOpening('window', wallAt(before, 'w6').id));
    const map = lost(withWindow);
    expect(refsOf(map)).toContain('w6');
    expect(floorOf(map).openings.some((o) => o.id === 'window')).toBe(true);
    expect(refsOf(map)).not.toContain('w4');
  });
});

describe('rule 6: a wall the user deleted stays deleted', () => {
  const deleted = (): HomeMap => {
    const before = first();
    return edit(before, [
      { op: 'remove', kind: 'wall', floorId: 'floor-0', id: wallAt(before, 'w5').id },
    ]);
  };

  it('is stored as a tombstone and not added again', () => {
    const { plan, map } = importScene(deleted(), syntheticScene);
    expect(plan.kind).toBe('merge');
    if (plan.kind !== 'merge') return;
    expect(kindsOf(plan.ops)).toEqual(['update:source']);
    expect(map.sources[0]?.tombstones).toEqual(['wall:8.600,0.500,8.600,3.500']);
    expect(
      floorOf(map).walls.some((wall) => wall.origin.kind === 'source' && wall.origin.ref === 'w5'),
    ).toBe(false);
    expect(map.sources[0]?.base.walls.some((wall) => wall.ref === 'w5')).toBe(false);
    expect(importScene(map, syntheticScene).plan.kind).toBe('noop');
  });

  it('stays deleted after the robot moves the wall a little', () => {
    const afterFirst = importScene(deleted(), syntheticScene).map;
    const { map } = importScene(afterFirst, widened());
    expect(floorOf(map).walls).toHaveLength(6);
    expect(wallAt(map, 'w4').to.x).toBeCloseTo(8.85, 6);
    expect(importScene(map, widened()).plan.kind).toBe('noop');
  });

  it('keeps the tombstone when the same scene arrives again and never grows it', () => {
    let map = importScene(deleted(), syntheticScene).map;
    for (let round = 0; round < 3; round += 1) map = importScene(map, jitter(syntheticScene)).map;
    expect(map.sources[0]?.tombstones).toHaveLength(1);
  });
});

describe('rule 6: openings', () => {
  it('follows the robot along its wall and keeps what the user changed', () => {
    const before = first();
    const edited = edit(before, [
      {
        op: 'update',
        kind: 'opening',
        floorId: 'floor-0',
        id: sourceOpening(before).id,
        patch: { width: 0.8 },
      },
    ]);
    const { map } = importScene(edited, shiftedDoor(0.4));
    const next = sourceOpening(map);
    expect(next.id).toBe(sourceOpening(before).id);
    expect(next.offset).toBeCloseTo(1.4, 6);
    expect(next.width).toBe(0.8);
    expect(next.origin).toMatchObject({ overridden: ['width'] });
  });

  it('is removed when the robot no longer has the door, unless the user changed it', () => {
    const none: VacuumScene = { ...syntheticScene, doors: [] };
    expect(floorOf(importScene(first(), none).map).openings).toEqual([]);
    const before = first();
    const edited = edit(before, [
      {
        op: 'update',
        kind: 'opening',
        floorId: 'floor-0',
        id: sourceOpening(before).id,
        patch: { kind: 'door' },
      },
    ]);
    const { map } = importScene(edited, none);
    expect(sourceOpening(map).kind).toBe('door');
    expect(map.sources[0]?.base.openings).toEqual([]);
  });

  it('stays deleted when the user deleted it, even after the door moves', () => {
    const before = first();
    const deleted = edit(before, [
      { op: 'remove', kind: 'opening', floorId: 'floor-0', id: sourceOpening(before).id },
    ]);
    const stored = importScene(deleted, syntheticScene).map;
    expect(stored.sources[0]?.tombstones).toEqual(['opening:opening:4.550,1.950,0.900']);
    const { map } = importScene(stored, shiftedDoor(0.3));
    expect(floorOf(map).openings).toEqual([]);
    expect(importScene(map, shiftedDoor(0.3)).plan.kind).toBe('noop');
  });
});

describe('rule 6: walls the robot adds', () => {
  const study = (): VacuumScene => {
    const extra = den(rectRing(8.2, 0, 10.2, 3));
    return withRooms(hall(), den(), { ...extra, id: 3, name: 'Study' });
  };

  it('are added with their source origin, unique ids and refs, next to the ones that moved', () => {
    const before = first();
    const { map } = importScene(before, study());
    const walls = floorOf(map).walls;
    expect(walls).toHaveLength(10);
    expect(new Set(walls.map((wall) => wall.id)).size).toBe(10);
    const refs = walls.flatMap((wall) => (wall.origin.kind === 'source' ? [wall.origin.ref] : []));
    expect(new Set(refs).size).toBe(10);
    expect(wallAt(map, 'w5').id).toBe(wallAt(before, 'w5').id);
    expect(wallAt(map, 'w5').thickness).toBe(0.1);
    expect(map.sources[0]?.base.walls).toHaveLength(10);
    expect(importScene(map, study()).plan.kind).toBe('noop');
  });

  it('are ordered so a wall exists before an opening uses it', () => {
    const plan = planFor(first(), study());
    if (plan.kind !== 'merge') throw new Error('expected a merge');
    const kinds = kindsOf(plan.ops);
    expect(kinds.lastIndexOf('add:wall')).toBeLessThan(kinds.indexOf('update:source'));
  });
});
