import { DatabaseSync } from 'node:sqlite';
import { ApiError, type HomeMapOp } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HomeMapService } from '../../src/home-map/service';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { directService } from './store-fixtures';

const NOW = '2026-10-25T10:00:00.000Z';
const ALICE = 'profile:alice';
const BOB = 'profile:bob';
const ALICE_AI = 'ai:alice';
const GROUND = 'ground';

let logs: CapturedLogs;
let repository: HomeMapsRepository;
let context: StoreContext;
let service: HomeMapService;
let known: Set<string>;

const floor = (id: string): Record<string, unknown> => ({
  id,
  name: id,
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const sofa = (id: string, modelId = 'cat.seating.sofa'): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId: GROUND,
  element: {
    id,
    modelId,
    finish: null,
    params: {},
    at: { x: 1, y: 1 },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  },
});

const drop = (id: string): HomeMapOp => ({ op: 'remove', kind: 'object', floorId: GROUND, id });

const rename = (id: string, label: string): HomeMapOp => ({
  op: 'update',
  kind: 'object',
  floorId: GROUND,
  id,
  patch: { label },
});

const objects = (): string[] =>
  service.get().floors.flatMap((entry) => entry.objects.map((object) => object.id));

const labelOf = (id: string): string | null =>
  service
    .get()
    .floors.flatMap((entry) => entry.objects)
    .find((object) => object.id === id)?.label ?? null;

function serviceOn(maps: HomeMapsRepository): Promise<HomeMapService> {
  return directService(maps, context, (modelId: string): boolean => known.has(modelId));
}

async function build(): Promise<void> {
  logs = captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  repository = new HomeMapsRepository(context, () => undefined);
  service = await serviceOn(repository);
}

beforeEach(async () => {
  known = new Set(['cat.seating.sofa', 'cat.lighting.lamp']);
  await build();
  await service.apply([{ op: 'addFloor', floor: floor(GROUND) }], 'profile:setup');
});

describe('editing the map with a base revision', () => {
  it('reads the stored map and answers the new revision with no conflicts', async () => {
    expect(service.get().floors.map((entry) => entry.id)).toEqual([GROUND]);
    const result = await service.edit({ baseRevision: 1, ops: [sofa('s1')] }, BOB);
    expect(result).toEqual({ revision: 2, conflicts: [] });
    expect(objects()).toEqual(['s1']);
    expect(service.revision()).toBe(2);
  });

  it('applies the rest of a stale batch and reports the dropped op on an element that went away', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('s1'), sofa('s2')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [drop('s1')] }, BOB);
    const result = await service.edit(
      { baseRevision: 2, ops: [rename('s1', 'Old'), rename('s2', 'New')] },
      ALICE,
    );
    expect(result.revision).toBe(4);
    expect(result.conflicts).toEqual([
      { index: 0, op: 'update', kind: 'object', id: 's1', reason: 'missing_element' },
    ]);
    expect(labelOf('s2')).toBe('New');
  });

  it('lets the newest write win per field and keeps the other fields', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('s1')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [rename('s1', 'Alice')] }, ALICE);
    await service.edit(
      {
        baseRevision: 2,
        ops: [
          rename('s1', 'Bob'),
          { op: 'update', kind: 'object', floorId: GROUND, id: 's1', patch: { rotation: 90 } },
        ],
      },
      BOB,
    );
    const stored = service.get().floors[0]?.objects[0];
    expect(stored?.label).toBe('Bob');
    expect(stored?.rotation).toBe(90);
  });

  it('makes no revision when every op conflicts and refuses a base revision from the future', async () => {
    const result = await service.edit({ baseRevision: 1, ops: [drop('nothing')] }, ALICE);
    expect(result.revision).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    await expect(service.edit({ baseRevision: 9, ops: [sofa('s1')] }, ALICE)).rejects.toThrow(
      ApiError,
    );
    expect(service.revision()).toBe(1);
  });
});

describe('undo and redo per actor', () => {
  it('undoes only the callers own change and never another persons or their AIs', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [sofa('b')] }, BOB);
    await service.edit({ baseRevision: 3, ops: [sofa('c')] }, ALICE_AI);
    const result = await service.undo(ALICE);
    expect(result).toEqual({ revision: 5, conflicts: [] });
    expect(objects()).toEqual(['b', 'c']);
    expect((await service.undo(BOB)).revision).toBe(6);
    expect(objects()).toEqual(['c']);
    expect((await service.undo(ALICE_AI)).revision).toBe(7);
    expect(objects()).toEqual([]);
    const log = await service.revisions({ after: 4 });
    expect(log.map((entry) => entry.actor)).toEqual([ALICE, BOB, ALICE_AI]);
  });

  it('walks back one batch at a time and redo walks forward until a new change', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a'), sofa('b')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [rename('a', 'Mine')] }, ALICE);
    await service.undo(ALICE);
    expect(labelOf('a')).toBeNull();
    expect(objects()).toEqual(['a', 'b']);
    await service.redo(ALICE);
    expect(labelOf('a')).toBe('Mine');
    await service.undo(ALICE);
    await service.undo(ALICE);
    expect(objects()).toEqual([]);
    await service.redo(ALICE);
    expect(objects()).toEqual(['a', 'b']);
    await service.edit({ baseRevision: service.revision(), ops: [sofa('c')] }, ALICE);
    const none = await service.redo(ALICE);
    expect(none.conflicts).toEqual([]);
    expect(none.revision).toBe(service.revision());
    expect(objects()).toEqual(['a', 'b', 'c']);
  });

  it('keeps a person and their AI as separate histories even for the same profile', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('mine')] }, 'profile:p1');
    await service.edit({ baseRevision: 2, ops: [sofa('ais')] }, 'ai:p1');
    await service.undo('profile:p1');
    expect(objects()).toEqual(['ais']);
    await service.redo('ai:p1');
    expect(objects()).toEqual(['ais']);
    await service.undo('ai:p1');
    expect(objects()).toEqual([]);
  });

  it('reports what no longer applies and skips a step whose element someone else removed', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('s1')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [sofa('s2')] }, ALICE);
    await service.edit({ baseRevision: 3, ops: [drop('s2')] }, BOB);
    const result = await service.undo(ALICE);
    expect(objects()).toEqual([]);
    expect(result.revision).toBe(5);
    expect(result.conflicts).toEqual([]);
    expect((await service.undo(ALICE)).revision).toBe(5);
    await service.redo(ALICE);
    expect(objects()).toEqual(['s1']);
  });

  it('answers the conflicts and no new revision when nothing at all can be undone', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('s1')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [drop('s1')] }, BOB);
    await service.undo(BOB);
    await service.edit({ baseRevision: 4, ops: [drop('s1')] }, BOB);
    const before = service.revision();
    const result = await service.undo(ALICE);
    expect(result.revision).toBe(before);
    expect(result.conflicts).toEqual([
      { index: 0, op: 'remove', kind: 'object', id: 's1', reason: 'missing_element' },
    ]);
    expect(await service.undo(ALICE)).toEqual({ revision: before, conflicts: [] });
  });

  it('answers the current revision when the caller never changed anything', async () => {
    expect(await service.undo('profile:nobody')).toEqual({ revision: 1, conflicts: [] });
    expect(await service.redo('profile:nobody')).toEqual({ revision: 1, conflicts: [] });
  });

  it('rebuilds a callers history from the log after a hub restart', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [sofa('b')] }, ALICE);
    const restarted = await serviceOn(repository);
    service = restarted;
    await restarted.undo(ALICE);
    expect(objects()).toEqual(['a']);
    await restarted.redo(ALICE);
    expect(objects()).toEqual(['a', 'b']);
  });

  it('keeps undo and redo working after a hub restart that follows an undo', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [sofa('b')] }, ALICE);
    await service.undo(ALICE);
    expect(objects()).toEqual(['a']);
    const restarted = await serviceOn(repository);
    service = restarted;
    await restarted.undo(ALICE);
    expect(objects()).toEqual([]);
    await restarted.redo(ALICE);
    expect(objects()).toEqual(['a']);
    await restarted.redo(ALICE);
    expect(objects()).toEqual(['a', 'b']);
    expect((await restarted.redo(ALICE)).revision).toBe(restarted.revision());
  });

  it('keeps the redo history across a restart after a redo and drops it after a new edit', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.undo(ALICE);
    await service.redo(ALICE);
    const afterRedo = await serviceOn(repository);
    service = afterRedo;
    await afterRedo.undo(ALICE);
    expect(objects()).toEqual([]);
    await afterRedo.edit({ baseRevision: afterRedo.revision(), ops: [sofa('c')] }, ALICE);
    const afterEdit = await serviceOn(repository);
    service = afterEdit;
    expect((await afterEdit.redo(ALICE)).revision).toBe(afterEdit.revision());
    expect(objects()).toEqual(['c']);
  });

  it('marks undo and redo entries in the log', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.undo(ALICE);
    await service.redo(ALICE);
    const marks = (await service.revisions({ actor: ALICE })).map((entry) => [
      entry.undoes,
      entry.redoes,
    ]);
    expect(marks).toEqual([
      [undefined, undefined],
      [2, undefined],
      [undefined, 3],
    ]);
  });

  it('lists the revisions with their inverse and filters by actor', async () => {
    await service.edit({ baseRevision: 1, ops: [sofa('a')] }, ALICE);
    await service.edit({ baseRevision: 2, ops: [sofa('b')] }, BOB);
    await service.undo(ALICE);
    expect((await service.revisions({ actor: BOB })).map((entry) => entry.revision)).toEqual([3]);
    const alice = await service.revisions({ actor: ALICE });
    expect(alice.map((entry) => entry.revision)).toEqual([2, 4]);
    expect(alice[0]?.inverse).toEqual([drop('a')]);
    expect(alice[1]?.ops).toEqual([drop('a')]);
  });
});

describe('model ids the hub does not know', () => {
  const unknownLogs = (): readonly unknown[] =>
    logs.records.filter((record) => record.event === 'home_map.unknown_model');

  it('keeps the object and logs each unknown id once, however often the map is read or changed', async () => {
    await service.edit(
      { baseRevision: 1, ops: [sofa('x', 'plugin.fancy.chair'), sofa('y', 'plugin.fancy.chair')] },
      ALICE,
    );
    service.get();
    await service.edit({ baseRevision: 2, ops: [rename('x', 'Chair')] }, ALICE);
    await service.undo(ALICE);
    await service.redo(ALICE);
    await service.edit({ baseRevision: service.revision(), ops: [sofa('z', 'plugin.other')] }, BOB);
    expect(service.get().floors[0]?.objects.map((object) => object.modelId)).toEqual([
      'plugin.fancy.chair',
      'plugin.fancy.chair',
      'plugin.other',
    ]);
    expect(unknownLogs()).toHaveLength(2);
    expect(JSON.stringify(unknownLogs())).toContain('plugin.fancy.chair');
  });

  it('logs nothing for known ids and never puts the map document in the log', async () => {
    await service.edit(
      { baseRevision: 1, ops: [sofa('a'), sofa('b', 'cat.lighting.lamp')] },
      ALICE,
    );
    service.get();
    expect(unknownLogs()).toEqual([]);
    known.clear();
    (await serviceOn(repository)).get();
    const text = JSON.stringify(unknownLogs());
    expect(unknownLogs()).toHaveLength(2);
    expect(text).not.toContain('rotation');
    expect(text).not.toContain('polygon');
  });
});
