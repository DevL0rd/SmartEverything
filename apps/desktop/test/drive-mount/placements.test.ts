import { describe, expect, it } from 'vitest';
import type { DrivePlacement } from '@smarteverything/domain';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import {
  PlacementsController,
  type ControlLine,
  type PlacementsPorts,
  type SubscribeHandlers,
} from '../../src/drive-mount/placements.js';
import {
  pathRefusal,
  type FolderState,
  type PathFacts,
  type PathFs,
} from '../../src/drive-mount/placement-paths.js';
import type { PlacementReport, RouteEndpointState } from '../../src/drive-mount/placement-state.js';

const FACTS: PathFacts = {
  platform: 'linux',
  dataDirectory: '/home/u/.config/SmartEverything',
  systemDirectories: ['/usr', '/etc'],
};

const ROOT = '11111111-1111-4111-8111-111111111111';
const FOLDER = '22222222-2222-4222-8222-222222222222';
const DEVICE = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const STATUS = {
  state: 'starting',
  tier: null,
  basicLimits: null,
  readOnly: false,
  route: null,
  cacheBytes: 0,
  pinnedBytes: 0,
  openFiles: 0,
  pendingUploads: 0,
  needBytes: 0,
  lastSyncedAt: null,
  errors: [],
  reason: null,
  reportedAt: '2026-11-07T00:00:00.000Z',
} as const;

function placement(n: number, change: Partial<DrivePlacement> = {}): DrivePlacement {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${String(n)}`,
    deviceId: DEVICE,
    rootId: ROOT,
    folderItemId: FOLDER,
    mode: 'mounted',
    localPath: `/home/u/roms${String(n)}`,
    enabled: true,
    hold: null,
    createdBy: USER,
    createdAt: `2026-11-0${String(n)}T00:00:00.000Z`,
    status: STATUS,
    ...change,
  };
}

interface Harness {
  readonly controller: PlacementsController;
  readonly lines: ControlLine[];
  readonly reports: PlacementReport[];
  readonly synced: (readonly DrivePlacement[])[];
  readonly cached: { current: readonly DrivePlacement[]; cleared: number };
  readonly pushPlacements: (placements: readonly DrivePlacement[]) => void;
  readonly helper: (raw: string) => void;
  readonly setRoute: (state: RouteEndpointState) => void;
  readonly demand: (on: boolean) => void;
  readonly channels: {
    handlers: SubscribeHandlers;
    placementId: string;
    stopped: boolean;
  }[];
  readonly folders: Map<string, FolderState>;
}

interface Options {
  readonly cache?: readonly DrivePlacement[];
  readonly demanded?: boolean;
  readonly route?: RouteEndpointState;
}

function harness(options: Options = {}): Harness {
  const lines: ControlLine[] = [];
  const reports: PlacementReport[] = [];
  const synced: (readonly DrivePlacement[])[] = [];
  const cached = { current: options.cache ?? [], cleared: 0 };
  const channels: Harness['channels'] = [];
  const folders = new Map<string, FolderState>();
  let demanded = options.demanded ?? false;
  let route: RouteEndpointState = options.route ?? { endpoint: { kind: 'lan' } };
  const placementListeners = new Set<(placements: readonly DrivePlacement[]) => void>();
  const demandListeners = new Set<(on: boolean) => void>();
  const helperListeners = new Set<(raw: string) => void>();
  const routeListeners = new Set<(state: RouteEndpointState) => void>();
  const ports: PlacementsPorts = {
    link: {
      onPlacements: (listener) => {
        placementListeners.add(listener);
        return () => placementListeners.delete(listener);
      },
      onMountsDemand: (listener) => {
        demandListeners.add(listener);
        return () => demandListeners.delete(listener);
      },
      mountsDemanded: () => demanded,
      report: (report) => reports.push(report),
    },
    cache: {
      all: () => cached.current,
      replaceAll: (placements) => {
        cached.current = placements;
      },
      clear: () => {
        cached.current = [];
        cached.cleared += 1;
      },
    },
    helper: {
      send: (line) => lines.push(line),
      onLine: (listener) => {
        helperListeners.add(listener);
        return () => helperListeners.delete(listener);
      },
    },
    route: {
      state: () => route,
      subscribe: (listener) => {
        routeListeners.add(listener);
        return () => routeListeners.delete(listener);
      },
    },
    openSubscribe: (placementId, handlers) => {
      const channel = { handlers, placementId, stopped: false };
      channels.push(channel);
      return {
        stop: (): void => {
          channel.stopped = true;
        },
      };
    },
    facts: FACTS,
    fs: {
      inspect: (folder) => Promise.resolve(folders.get(folder) ?? 'absent'),
      create: (folder) => {
        folders.set(folder, []);
        return Promise.resolve();
      },
    },
    synced: (placements) => synced.push(placements),
    now: () => new Date('2026-11-07T01:00:00.000Z'),
    log: new Logger('desktop.test'),
  };
  const controller = new PlacementsController(ports);
  controller.start();
  return {
    controller,
    lines,
    reports,
    synced,
    cached,
    channels,
    folders,
    pushPlacements: (placements: readonly DrivePlacement[]): void => {
      for (const listener of placementListeners) listener(placements);
    },
    helper: (raw: string): void => {
      for (const listener of helperListeners) listener(raw);
    },
    setRoute: (state: RouteEndpointState): void => {
      route = state;
      for (const listener of routeListeners) listener(state);
    },
    demand: (on: boolean): void => {
      demanded = on;
      for (const listener of demandListeners) listener(on);
    },
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const emptyFs = {
  inspect: (): Promise<FolderState> => Promise.resolve('absent'),
  create: (): Promise<void> => Promise.resolve(),
};

describe('path rules', () => {
  const check = (
    path: string,
    earlier: DrivePlacement[] = [],
    mode: 'mounted' | 'synced' = 'mounted',
  ): Promise<string | null> =>
    pathRefusal(
      {
        placement: placement(1, {
          localPath: path,
          mode,
          folderItemId: mode === 'synced' ? null : FOLDER,
        }),
        earlier,
        requireEmpty: true,
      },
      FACTS,
      emptyFs,
    );

  it('accepts an absent absolute folder', async () => {
    expect(await check('/home/u/roms')).toBeNull();
  });

  it('refuses relative paths, drive tops and system folders', async () => {
    expect(await check('roms')).toMatch(/absolute/);
    expect(await check('/')).toMatch(/top of a drive/);
    expect(await check('/usr/share/roms')).toMatch(/system folder/);
  });

  it('refuses the service data folder and its parents', async () => {
    expect(await check('/home/u/.config/SmartEverything/x')).toMatch(/data folder/);
    expect(await check('/home/u/.config')).toMatch(/data folder/);
  });

  it('refuses overlap with an earlier placement in both directions', async () => {
    const earlier = [placement(2, { localPath: '/home/u/roms' })];
    expect(await check('/home/u/roms/n64', earlier)).toMatch(/another folder/);
    expect(await check('/home/u/roms/../roms', earlier)).toMatch(/another folder/);
  });

  it('refuses a mount folder that is not empty or is a file', async () => {
    const fs = (state: FolderState): PathFs => ({
      inspect: (): Promise<FolderState> => Promise.resolve(state),
      create: (): Promise<void> => Promise.resolve(),
    });
    const target = placement(1, { localPath: '/home/u/roms' });
    const run = (state: FolderState): Promise<string | null> =>
      pathRefusal({ placement: target, earlier: [], requireEmpty: true }, FACTS, fs(state));
    expect(await run(['a.txt'])).toMatch(/empty/);
    expect(await run('file')).toMatch(/file/);
    expect(await run([])).toBeNull();
  });

  it('does not require an empty folder for a synced placement', async () => {
    const synced = placement(1, { mode: 'synced', folderItemId: null, localPath: '/home/u/docs' });
    const fs = {
      inspect: (): Promise<FolderState> => Promise.resolve(['a.txt']),
      create: (): Promise<void> => Promise.resolve(),
    };
    expect(
      await pathRefusal({ placement: synced, earlier: [], requireEmpty: true }, FACTS, fs),
    ).toBeNull();
  });
});

describe('PlacementsController', () => {
  it('starts cached placements without the hub', async () => {
    const h = harness({ cache: [placement(1)] });
    await settle();
    expect(h.lines).toEqual([
      { op: 'mount', mount: placement(1).id, root: ROOT, folder: FOLDER, point: '/home/u/roms1' },
    ]);
    expect(h.channels).toHaveLength(1);
    expect(h.folders.get('/home/u/roms1')).toEqual([]);
  });

  it('caches pushed placements and mounts only enabled, unheld ones', async () => {
    const h = harness();
    const list = [
      placement(1),
      placement(2, { enabled: false }),
      placement(3, { hold: 'no_access' }),
    ];
    h.pushPlacements(list);
    await settle();
    expect(h.cached.current).toEqual(list);
    expect(h.lines.map((line) => line.op === 'mount' && line.mount)).toEqual([placement(1).id]);
  });

  it('reports blocked with the reason and mounts nothing for a refused path', async () => {
    const h = harness();
    h.pushPlacements([placement(1, { localPath: '/usr/roms' })]);
    await settle();
    expect(h.lines).toEqual([]);
    expect(h.reports.at(-1)).toMatchObject({
      state: 'blocked',
      reason: 'The path is a system folder or inside one',
    });
  });

  it('blocks the later overlapping placement only', async () => {
    const h = harness();
    h.pushPlacements([
      placement(1, { localPath: '/home/u/a' }),
      placement(2, { localPath: '/home/u/a/b' }),
    ]);
    await settle();
    expect(h.lines).toHaveLength(1);
    expect(h.reports.find((report) => report.placementId === placement(2).id)?.state).toBe(
      'blocked',
    );
  });

  it('reports transitions only', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    const before = h.reports.length;
    h.pushPlacements([placement(1)]);
    await settle();
    h.helper(JSON.stringify({ type: 'status', mount: placement(1).id, state: 'mounted' }));
    const afterMounted = h.reports.length;
    expect(afterMounted).toBe(before + 1);
    expect(h.reports.at(-1)).toMatchObject({
      state: 'mounted',
      tier: 'full',
      route: 'local',
      readOnly: true,
    });
    h.helper(JSON.stringify({ type: 'status', mount: placement(1).id, state: 'mounted' }));
    expect(h.reports).toHaveLength(afterMounted);
  });

  it('sends counters only while drive_mounts is demanded', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    h.helper(JSON.stringify({ type: 'status', mount: placement(1).id, state: 'mounted' }));
    const base = h.reports.length;
    const counters = {
      type: 'counters',
      mount: placement(1).id,
      cacheBytes: 5,
      pinnedBytes: 1,
      openFiles: 2,
      pendingUploads: 0,
    };
    h.helper(JSON.stringify(counters));
    expect(h.reports).toHaveLength(base);
    h.demand(true);
    expect(h.reports).toHaveLength(base + 1);
    expect(h.reports.at(-1)).toMatchObject({ cacheBytes: 5, openFiles: 2 });
    h.helper(JSON.stringify({ ...counters, cacheBytes: 9 }));
    expect(h.reports.at(-1)?.cacheBytes).toBe(9);
    h.demand(false);
    h.helper(JSON.stringify({ ...counters, cacheBytes: 12 }));
    expect(h.reports.at(-1)?.cacheBytes).toBe(9);
  });

  it('shows offline when the route is gone and recovers when it returns', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    h.helper(JSON.stringify({ type: 'status', mount: placement(1).id, state: 'mounted' }));
    h.setRoute({ endpoint: null });
    expect(h.reports.at(-1)).toMatchObject({ state: 'offline', route: null });
    h.setRoute({ endpoint: { kind: 'remote' } });
    expect(h.reports.at(-1)).toMatchObject({ state: 'mounted', route: 'remote' });
  });

  it('records a helper failure with its reason', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    h.helper(JSON.stringify({ type: 'error', mount: placement(1).id, reason: 'fuse missing' }));
    expect(h.reports.at(-1)).toMatchObject({ state: 'failed', reason: 'fuse missing' });
  });

  it('ignores malformed helper lines', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    const before = h.reports.length;
    h.helper('not json');
    h.helper(JSON.stringify({ type: 'unknown' }));
    expect(h.reports).toHaveLength(before);
  });

  it('opens one subscription per mounted placement and forwards its relative invalidations', async () => {
    const h = harness();
    h.pushPlacements([placement(1), placement(2, { folderItemId: null })]);
    await settle();
    expect(h.channels.map((channel) => channel.placementId)).toEqual([
      placement(1).id,
      placement(2).id,
    ]);
    expect(h.channels[0]?.handlers.hello()).toEqual({ indexId: null, afterSeq: 0 });
    h.lines.length = 0;
    const entry = (relPath: string): SyncIndexEntry => ({
      itemId: '55555555-5555-4555-8555-555555555555',
      relPath,
      kind: 'folder',
      mtime: '2026-11-07T00:00:00.000Z',
      rev: 1,
      deleted: false,
    });
    h.channels[0]?.handlers.message({
      type: 'index',
      indexId: ROOT,
      seq: 4,
      entries: [entry('n64')],
      last: true,
    });
    expect(h.channels[0]?.handlers.hello()).toEqual({ indexId: ROOT, afterSeq: 4 });
    expect(h.lines).toEqual([{ op: 'invalidate', mount: placement(1).id, paths: [] }]);
    h.lines.length = 0;
    h.channels[1]?.handlers.message({
      type: 'index_update',
      seq: 2,
      entries: [entry('n64/mario')],
    });
    expect(h.lines).toEqual([{ op: 'invalidate', mount: placement(2).id, paths: ['n64/mario'] }]);
    expect(h.channels[0]?.handlers.hello()).toEqual({ indexId: ROOT, afterSeq: 4 });
  });

  it('unmounts a placement that is removed and stops its subscription when last', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    h.pushPlacements([]);
    await settle();
    expect(h.lines.at(-1)).toEqual({ op: 'unmount', mount: placement(1).id });
    expect(h.channels[0]?.stopped).toBe(true);
  });

  it('remounts a placement whose path changed', async () => {
    const h = harness();
    h.pushPlacements([placement(1)]);
    await settle();
    h.pushPlacements([placement(1, { localPath: '/home/u/other' })]);
    await settle();
    expect(h.lines.map((line) => line.op)).toEqual(['mount', 'unmount', 'mount']);
  });

  it('hands synced placements to the sync engine only when they change', async () => {
    const h = harness();
    const synced = placement(1, { mode: 'synced', folderItemId: null, localPath: '/home/u/docs' });
    h.pushPlacements([synced]);
    await settle();
    expect(h.synced).toEqual([[synced]]);
    expect(h.lines).toEqual([]);
    h.pushPlacements([synced]);
    await settle();
    expect(h.synced).toHaveLength(1);
    h.pushPlacements([placement(1, { ...synced, hold: 'sync_off' })]);
    await settle();
    expect(h.synced.at(-1)).toEqual([]);
  });

  it('revocation unmounts everything and clears the cache', async () => {
    const h = harness();
    h.pushPlacements([placement(1), placement(2, { localPath: '/home/u/b' })]);
    await settle();
    h.controller.revoke();
    expect(h.lines.filter((line) => line.op === 'unmount')).toHaveLength(2);
    expect(h.cached.current).toEqual([]);
    expect(h.cached.cleared).toBe(1);
    expect(h.channels.every((channel) => channel.stopped)).toBe(true);
    h.pushPlacements([placement(3)]);
    await settle();
    expect(h.lines.filter((line) => line.op === 'mount')).toHaveLength(2);
  });
});
