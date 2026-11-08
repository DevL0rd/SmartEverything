import {
  ApiError,
  HOME_MAP,
  type HomeMap,
  type HomeMapEditBatch,
  type HomeMapEditResultAnswer,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ useRouter: (): object => ({}) }));
vi.mock('../../../api/transport', () => ({
  api: (): object => ({ call: (): Promise<never> => Promise.reject(new Error('not used')) }),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));

const { createMapContent, createProblemOf, createdEditorHref, editorLaunchOf, emptyFloorOp } =
  await import('./create-map');

type Ports = Parameters<typeof createMapContent>[0];

const AT = '2026-10-25T11:00:00.000Z';
const FLOOR_ID = 'floor-new';

function floorOf(id: string, level: number): unknown {
  return {
    id,
    name: id,
    level,
    elevation: 0,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    annotations: [],
  };
}

function mapOf(id: string, revision: number, floors: readonly unknown[] = []): HomeMap {
  return HOME_MAP.parse({
    id,
    schemaVersion: 1,
    revision,
    name: id,
    north: 0,
    updatedAt: AT,
    sources: [],
    notices: [],
    floors,
  });
}

interface FakeHub {
  readonly ports: Ports;
  readonly reads: (string | undefined)[];
  readonly edits: { readonly mapId: string; readonly batch: HomeMapEditBatch }[];
  readonly landed: { readonly mapId: string; readonly revision: number }[];
}

interface FakeSetup {
  readonly maps: readonly HomeMap[];
  readonly edit?: () => Promise<HomeMapEditResultAnswer>;
  readonly conflicts?: number;
}

function fakeHub(setup: FakeSetup): FakeHub {
  const reads: (string | undefined)[] = [];
  const edits: { mapId: string; batch: HomeMapEditBatch }[] = [];
  const landed: { mapId: string; revision: number }[] = [];
  const queue = [...setup.maps];
  const ports: Ports = {
    read: (mapId) => {
      reads.push(mapId);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return next === undefined ? Promise.reject(new Error('down')) : Promise.resolve(next);
    },
    edit: (mapId, batch) => {
      edits.push({ mapId, batch });
      if (setup.edit !== undefined) return setup.edit();
      const conflicts = Array.from({ length: setup.conflicts ?? 0 }, (_, index) => ({
        index,
        op: 'addFloor',
        kind: 'floor',
        id: FLOOR_ID,
        reason: 'missing_floor' as const,
      }));
      return Promise.resolve({ revision: batch.baseRevision + 1, conflicts });
    },
    landed: (mapId, revision) => {
      landed.push({ mapId, revision });
      return Promise.resolve();
    },
    newId: () => FLOOR_ID,
  };
  return { ports, reads, edits, landed };
}

describe('create a map', () => {
  it('adds one empty floor to the default home map when no map exists and opens it', async () => {
    const hub = fakeHub({ maps: [mapOf('home', 0)] });
    const outcome = await createMapContent(hub.ports, undefined, true);
    expect(outcome).toEqual({ kind: 'ready', mapId: 'home', floorId: FLOOR_ID });
    expect(hub.reads).toEqual([undefined]);
    expect(hub.edits).toHaveLength(1);
    expect(hub.edits[0]).toMatchObject({ mapId: 'home', batch: { baseRevision: 0 } });
    expect(hub.edits[0]?.batch.ops).toEqual([emptyFloorOp(mapOf('home', 0), FLOOR_ID)]);
    expect(hub.landed).toEqual([{ mapId: 'home', revision: 1 }]);
  });

  it('creates content on the named map it was asked for', async () => {
    const hub = fakeHub({ maps: [mapOf('cabin', 4)] });
    const outcome = await createMapContent(hub.ports, mapOf('cabin', 4).id, true);
    expect(outcome).toMatchObject({ kind: 'ready', mapId: 'cabin' });
    expect(hub.reads).toEqual(['cabin']);
    expect(hub.edits[0]?.batch.baseRevision).toBe(4);
  });

  it('opens the lowest existing floor without writing when the map already has one', async () => {
    const hub = fakeHub({ maps: [mapOf('home', 3, [floorOf('up', 1), floorOf('ground', 0)])] });
    expect(await createMapContent(hub.ports, undefined, true)).toEqual({
      kind: 'ready',
      mapId: 'home',
      floorId: 'ground',
    });
    expect(hub.edits).toEqual([]);
  });

  it('sends nothing while offline', async () => {
    const hub = fakeHub({ maps: [mapOf('home', 0)] });
    expect(await createMapContent(hub.ports, undefined, false)).toEqual({ kind: 'offline' });
    expect(hub.reads).toEqual([]);
    expect(hub.edits).toEqual([]);
  });

  it('never resends a lost answer and opens the floor that landed', async () => {
    const landedMap = mapOf('home', 1, [floorOf(FLOOR_ID, 0)]);
    const hub = fakeHub({
      maps: [mapOf('home', 0), landedMap],
      edit: () => Promise.reject(new Error('socket closed')),
    });
    expect(await createMapContent(hub.ports, undefined, true)).toEqual({
      kind: 'ready',
      mapId: 'home',
      floorId: FLOOR_ID,
    });
    expect(hub.edits).toHaveLength(1);
  });

  it('says it could not confirm when a lost answer left nothing on the map', async () => {
    const hub = fakeHub({
      maps: [mapOf('home', 0), mapOf('home', 0)],
      edit: () => Promise.reject(new Error('socket closed')),
    });
    const outcome = await createMapContent(hub.ports, undefined, true);
    expect(outcome).toEqual({ kind: 'unconfirmed' });
    expect(hub.edits).toHaveLength(1);
    expect(createProblemOf(outcome)).toBe("Couldn't confirm the new map · Try again");
  });

  it('shows the refusal of the hub', async () => {
    const hub = fakeHub({
      maps: [mapOf('home', 0)],
      edit: () => Promise.reject(new ApiError('forbidden', 'Only members can edit the map')),
    });
    const outcome = await createMapContent(hub.ports, undefined, true);
    expect(createProblemOf(outcome)).toBe('Only members can edit the map');
  });

  it('opens the floor someone else added when the add conflicted', async () => {
    const hub = fakeHub({
      maps: [mapOf('home', 0), mapOf('home', 2, [floorOf('theirs', 0)])],
      conflicts: 1,
    });
    expect(await createMapContent(hub.ports, undefined, true)).toEqual({
      kind: 'ready',
      mapId: 'home',
      floorId: 'theirs',
    });
  });

  it('reports a failed first read without writing', async () => {
    const hub = fakeHub({ maps: [] });
    const outcome = await createMapContent(hub.ports, undefined, true);
    expect(outcome).toEqual({ kind: 'unread' });
    expect(hub.edits).toEqual([]);
  });
});

describe('editor launch', () => {
  it('opens the editor on the Rooms tool with the new floor of that map', () => {
    const target = createdEditorHref(mapOf('cabin', 0).id, FLOOR_ID);
    expect(target).toEqual({
      pathname: '/home-map/edit',
      params: { mapId: 'cabin', floorId: FLOOR_ID, tool: 'rooms' },
    });
    expect(editorLaunchOf({ mapId: 'cabin', floorId: FLOOR_ID, tool: 'rooms' })).toEqual({
      mapId: 'cabin',
      floorId: FLOOR_ID,
    });
  });

  it('reads plain editor links and drops unreadable params', () => {
    expect(editorLaunchOf({})).toEqual({});
    expect(editorLaunchOf({ tool: 'walls' })).toEqual({});
    expect(editorLaunchOf({ mapId: 5, floorId: '' })).toEqual({});
  });
});
