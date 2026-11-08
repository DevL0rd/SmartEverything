import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import {
  hashClientToken,
  type ClientRow,
  type ComputerNodeRow,
  type DriveItem,
  type DriveRoot,
  type DriveTrashEntry,
  type DriveUpload,
  type EndpointName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commitContent } from '../../src/drive/changes';
import { TMP_DIRECTORY } from '../../src/drive/intents';
import { ensureManagedRoots } from '../../src/drive/managed-roots';
import { nodeCaller } from '../../src/drive/node-caller';
import { stageBytes } from '../../src/drive/versions';
import { systemProbe } from '../../src/drive/volumes';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import type { Caller } from '../../src/server/auth';
import { driveRoutes } from '../../src/server/handlers/drive';
import { startDrive } from '../../src/server/handlers/drive-start';
import {
  createDrive,
  type DriveDeps,
  type DriveRuntime,
} from '../../src/server/handlers/drive-wiring';
import { MediaLinks } from '../../src/server/media-links';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { bundleWorker } from './drive-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const log = testLogger('drive-scope');

interface Seeded {
  readonly root: DriveRoot;
  readonly file: DriveItem;
}

let opened: TestStore;
let scripts = '';
let scannerScript = '';
let hasherScript = '';
let second: DatabaseSync;
let runtime: DriveRuntime;
let routes: ReturnType<typeof driveRoutes>;
let ownerId = '';
let samId = '';
let alexId = '';
let owner: Caller;
let sam: Caller;
let alex: Caller;
let shared: Seeded;
let samRoot: Seeded;
let alexRoot: Seeded;
let nodeCount = 0;

beforeAll(async () => {
  scripts = await mkdtemp(join(tmpdir(), 'drive-scope-workers-'));
  scannerScript = join(scripts, 'scanner-worker.mjs');
  hasherScript = join(scripts, 'hasher-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
  await bundleWorker('hasher-worker.ts', hasherScript);
});

afterAll(async () => {
  await rm(scripts, { recursive: true, force: true });
});

function callerOf(profileId: string, role: ClientRow['role']): Caller {
  const client = opened.store.clients.create(
    {
      name: `Phone ${profileId.slice(0, 4)}`,
      platform: 'android',
      role,
      tokenHash: hashClientToken(`set_${randomBytes(32).toString('hex')}`),
      profileId,
    },
    false,
  );
  return { kind: 'client', client, profileId };
}

type RouteName = EndpointName & keyof typeof routes;

async function call(name: RouteName, caller: Caller, input: Input = {}): Promise<unknown> {
  return routes[name].run(
    caller,
    {
      params: input.params ?? {},
      query: input.query ?? {},
      body: input.body,
      remote: 'test',
      headers: {},
    },
    log,
  );
}

interface Input {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
}

async function read<S extends z.ZodType>(
  schema: S,
  name: RouteName,
  caller: Caller,
  input: Input = {},
): Promise<z.output<S>> {
  return schema.parse(await call(name, caller, input));
}

async function seed(root: DriveRoot, name: string, by: string): Promise<Seeded> {
  if (root.path === null) throw new Error('the root has no folder');
  const writable = { id: root.id, path: root.path, readOnly: false, versions: true };
  const staged = await stageBytes(runtime.env, writable, Readable.from([Buffer.from(name)]));
  const written = await commitContent(runtime.env, {
    root: writable,
    staged,
    relPath: name,
    actor: { actorProfileId: by, via: 'app', deviceId: null },
  });
  return { root, file: written.item };
}

function rootOf(roots: readonly DriveRoot[], ownerProfileId: string | null): DriveRoot {
  const found = roots.find((root) => root.ownerProfileId === ownerProfileId);
  if (found === undefined) throw new Error('the managed root is missing');
  return found;
}

function driveDeps(context: StoreContext): DriveDeps {
  return {
    store: opened.store,
    parts: {
      context,
      database: second,
      conflicts: {
        insert: (): void => undefined,
        find: (): undefined => undefined,
        resolve: (): never => {
          throw new Error('no conflicts in this rig');
        },
      },
      listings: {
        shares: () => ({ items: [], next: null }),
        duplicates: () => ({ items: [], next: null }),
        conflicts: () => ({ items: [], next: null }),
      },
      removeLocationOutside: () => true,
      notifyOwner: (): void => undefined,
    },
    layout: opened.layout,
    installDirectory: join(opened.directory, 'install'),
    localUrl: () => 'http://hub.local:8080',
    links: new MediaLinks(() => NOW),
    nodes: new ComputerNodeAccess(opened.store, () => NOW),
    probe: systemProbe,
    now: () => NOW,
    log,
    watchSettleMs: 10,
    scannerScript,
    hasherScript,
  };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => NOW);
  second = new DatabaseSync(join(opened.directory, 'test.db'));
  const context = new StoreContext(new Sql(second), new ChangeFeed(log), () => NOW);
  const { store } = opened;
  ownerId = store.profiles.first().id;
  samId = store.profiles.create({ name: 'Sam' }).id;
  alexId = store.profiles.create({ name: 'Alex' }).id;
  owner = callerOf(ownerId, 'owner');
  sam = callerOf(samId, 'member');
  alex = callerOf(alexId, 'member');
  runtime = createDrive(driveDeps(context));
  routes = driveRoutes(store, runtime.services);
  const roots = await ensureManagedRoots(store, opened.layout, store.profiles.list());
  shared = await seed(rootOf(roots, null), 'shared.txt', ownerId);
  samRoot = await seed(rootOf(roots, samId), 'sam.txt', samId);
  alexRoot = await seed(rootOf(roots, alexId), 'alex.txt', alexId);
});

afterEach(async () => {
  await runtime.queue.stop();
  second.close();
  await opened.close();
});

function pairedNode(profileId: string | null): ComputerNodeRow {
  nodeCount += 1;
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:scope:${String(nodeCount)}`,
      parentId: null,
      kind: 'computer',
      name: `Desk ${String(nodeCount)}`,
      model: 'model',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) throw new Error('the device was not stored');
  const tokenHash = hashClientToken(`set_${nodeCount.toString(16).padStart(64, '0')}`);
  opened.store.computerNodes.bind({
    deviceId: device.id,
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash,
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId,
  });
  const row = opened.store.computerNodes.byToken(tokenHash);
  if (row === undefined) throw new Error('the node was not stored');
  return row;
}

function trashEntry(root: DriveRoot, profileId: string): DriveTrashEntry {
  const itemId = randomUUID();
  return {
    itemId,
    rootId: root.id,
    name: 'old.txt',
    originalRelPath: 'old.txt',
    trashRelPath: `.smarteverything/trash/${itemId}`,
    isFolder: false,
    bytes: 1,
    deletedAt: NOW.toISOString(),
    purgeAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    deletedBy: profileId,
    addedByProfileId: profileId,
  };
}

const WITH_ID = z.array(z.object({ id: z.string() }));
const ITEM_PAGE = z.object({ items: WITH_ID });
const CHANGE_RESULT = z.object({ done: z.array(z.unknown()), failed: z.array(z.unknown()) });
const TRASH_PAGE = z.object({ items: z.array(z.object({ itemId: z.string() })) });
const USAGE = z.array(z.object({ profileId: z.string().nullable() }));
const HEALTH = z.object({ rootsTotal: z.number() });

async function idsOf(name: RouteName, caller: Caller, input: Input = {}): Promise<string[]> {
  return (await read(WITH_ID, name, caller, input)).map((entry) => entry.id);
}

const QUERY_ALL = {
  text: null,
  rootId: null,
  folderId: null,
  kinds: null,
  starred: null,
  duration: null,
  taken: null,
  sort: { field: 'name', direction: 'asc' },
  cursor: null,
};

describe('what each person reaches', () => {
  it('lists the home root and only the caller’s own person root', async () => {
    expect(await idsOf('listRoots', owner)).toHaveLength(4);
    expect((await idsOf('listRoots', sam)).sort()).toEqual(
      [shared.root.id, samRoot.root.id].sort(),
    );
    expect(await idsOf('listRoots', alex)).not.toContain(samRoot.root.id);
  });

  it('refuses another member’s root, folder listing and item', async () => {
    await expect(
      call('browseFolder', sam, { query: { rootId: alexRoot.root.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call('readItem', sam, { params: { itemId: alexRoot.file.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call('readItem', sam, { params: { itemId: samRoot.file.id } }),
    ).resolves.toMatchObject({ id: samRoot.file.id });
  });

  it('searches only the rows the caller reaches', async () => {
    const own = await read(ITEM_PAGE, 'searchDrive', sam, { body: QUERY_ALL });
    expect(own.items.map((item) => item.id).sort()).toEqual(
      [shared.file.id, samRoot.file.id].sort(),
    );
    const all = await read(ITEM_PAGE, 'searchDrive', owner, { body: QUERY_ALL });
    expect(all.items.map((item) => item.id)).toContain(alexRoot.file.id);
  });

  it('reports a change aimed at another member’s file as failed and leaves it alone', async () => {
    const result = await read(CHANGE_RESULT, 'changeDrive', sam, {
      body: { action: 'trash', itemIds: [alexRoot.file.id] },
    });
    expect(result.done).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(opened.store.driveTrash.find(alexRoot.file.id)).toBeUndefined();
  });

  it('keeps trash, versions and albums with the person who owns them', async () => {
    const entry = trashEntry(alexRoot.root, alexId);
    opened.store.driveTrash.insert(entry);
    const trashed = await read(TRASH_PAGE, 'listTrash', alex);
    expect(trashed.items.map((one) => one.itemId)).toEqual([entry.itemId]);
    expect((await read(TRASH_PAGE, 'listTrash', sam)).items).toEqual([]);
    await expect(
      call('listVersions', sam, { params: { itemId: alexRoot.file.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call('listItemActivity', sam, { params: { itemId: alexRoot.file.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const album = await read(z.object({ id: z.string() }), 'createAlbum', alex, {
      body: { kind: 'manual', title: 'Private', surface: 'drive', scope: 'person', itemIds: [] },
    });
    const surface = { query: { surface: 'drive' } };
    expect(await idsOf('listAlbums', sam, surface)).not.toContain(album.id);
    expect(await idsOf('listAlbums', owner, surface)).toContain(album.id);
    await expect(
      call('updateAlbum', sam, { params: { albumId: album.id }, body: { title: 'Mine now' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets a member share only when the owner allowed it', async () => {
    const body = { itemId: samRoot.file.id, permission: 'view', expiresAt: null, password: null };
    await expect(call('createShare', sam, { body })).rejects.toMatchObject({ code: 'forbidden' });
    await call('updateDriveSettings', owner, { body: { membersMayShare: true } });
    await expect(call('createShare', sam, { body })).resolves.toMatchObject({ public: false });
    await expect(
      call('createShare', sam, { body: { ...body, itemId: alexRoot.file.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('counts usage and health per what the caller reaches', async () => {
    const mine = await read(USAGE, 'readUsage', sam);
    expect(mine.map((usage) => usage.profileId)).toEqual([samId]);
    const everyone = await read(USAGE, 'readUsage', owner);
    expect(everyone.map((usage) => usage.profileId).sort()).toEqual(
      [ownerId, samId, alexId].sort(),
    );
    expect((await read(HEALTH, 'readHealth', sam)).rootsTotal).toBe(2);
    expect((await read(HEALTH, 'readHealth', owner)).rootsTotal).toBe(4);
  });
});

describe('owner-only endpoints', () => {
  const OWNER_ONLY: readonly [RouteName, Input][] = [
    ['addRoot', { body: {} }],
    ['updateRoot', { params: { rootId: randomUUID() }, body: { label: 'x' } }],
    ['removeRoot', { params: { rootId: randomUUID() } }],
    ['scanRoot', { params: { rootId: randomUUID() } }],
    ['listVolumes', {}],
    ['listHostFolders', {}],
    ['listQuotas', {}],
    ['setQuota', { body: { profileId: randomUUID(), bytes: 1 } }],
    ['startScrub', {}],
    ['reportBackup', { body: {} }],
    ['readBackupStatus', {}],
    ['updateDriveSettings', { body: { indexingPaused: true } }],
  ];

  it.each(OWNER_ONLY)('refuses a member on %s', async (name, input) => {
    await expect(call(name, sam, input)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('lets the owner list quotas, volumes and the backup status', async () => {
    await expect(call('listQuotas', owner)).resolves.toEqual([]);
    await expect(call('listVolumes', owner)).resolves.toBeInstanceOf(Array);
    await expect(call('readBackupStatus', owner)).resolves.toMatchObject({ last: null });
  });
});

describe('a paired computer', () => {
  it('reads as the owner person with the owner role', async () => {
    const caller = nodeCaller(opened.store, pairedNode(ownerId));
    expect(await idsOf('listRoots', caller)).toHaveLength(4);
    await expect(call('listQuotas', caller)).resolves.toEqual([]);
  });

  it('reads as a member person and reaches only that person’s rows', async () => {
    const caller = nodeCaller(opened.store, pairedNode(samId));
    expect((await idsOf('listRoots', caller)).sort()).toEqual(
      [shared.root.id, samRoot.root.id].sort(),
    );
    await expect(
      call('browseFolder', caller, { query: { rootId: alexRoot.root.id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(call('listQuotas', caller)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('is refused when paired for nobody or revoked', () => {
    expect(() => nodeCaller(opened.store, pairedNode(null))).toThrow(
      expect.objectContaining({ reason: 'computer_not_bound_to_person' }),
    );
    const revoked = pairedNode(ownerId);
    opened.store.computerNodes.revoke(revoked.device_id);
    expect(() => nodeCaller(opened.store, revoked)).toThrow(
      expect.objectContaining({ reason: 'computer_not_bound_to_person' }),
    );
  });
});

describe('hub start-up', () => {
  function startContext(): StoreContext {
    return new StoreContext(new Sql(second), new ChangeFeed(log), () => NOW);
  }

  it('reads the files on disk into the index and watches every root', async () => {
    await writeFile(join(shared.root.path ?? '', 'disk-only.txt'), 'only on disk');
    const running = await startDrive(driveDeps(startContext()));
    try {
      await running.runtime.queue.idle();
      expect(opened.store.driveItems.byPath(shared.root.id, 'disk-only.txt')).toBeDefined();
      for (const root of opened.store.driveRoots.list()) {
        expect(running.runtime.watchers.status(root.id).watching).toBe(true);
      }
    } finally {
      await running.stop();
    }
  });

  it('removes tmp leftovers of an interrupted write', async () => {
    const leftover = join(samRoot.root.path ?? '', TMP_DIRECTORY, 'half-written');
    await mkdir(join(samRoot.root.path ?? '', TMP_DIRECTORY), { recursive: true });
    await writeFile(leftover, 'partial');
    const running = await startDrive(driveDeps(startContext()));
    try {
      await expect(access(leftover)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await running.stop();
    }
  });

  it('purges what was already due while the hub was down', async () => {
    const root = alexRoot.root;
    const entry: DriveTrashEntry = {
      ...trashEntry(root, alexId),
      deletedAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
      purgeAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    };
    const stored = join(root.path ?? '', entry.trashRelPath);
    await mkdir(join(root.path ?? '', '.smarteverything', 'trash'), { recursive: true });
    await writeFile(stored, 'due');
    opened.store.driveTrash.insert(entry);
    const gone = new Promise<void>((resolve) => {
      const stop = opened.store.feed.subscribeNotices(() => {
        if (opened.store.driveTrash.find(entry.itemId) === undefined) {
          stop();
          resolve();
        }
      });
    });
    const running = await startDrive(driveDeps(startContext()));
    try {
      await gone;
      await running.runtime.purge.settled();
      await expect(access(stored)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await running.stop();
    }
  });

  it('expires an upload session that ran out while the hub was down', async () => {
    const upload: DriveUpload = {
      id: randomUUID(),
      rootId: samRoot.root.id,
      target: { kind: 'folder', folderId: samRoot.root.id },
      name: 'half.bin',
      length: 10,
      offset: 4,
      state: 'open',
      failureReason: null,
      profileId: samId,
      clientId: sam.kind === 'client' ? sam.client.id : null,
      nodeId: null,
      createdAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
      expiresAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
    };
    opened.store.driveUploads.insert(upload);
    const running = await startDrive(driveDeps(startContext()));
    try {
      expect(opened.store.driveUploads.find(upload.id)?.state).toBe('expired');
    } finally {
      await running.stop();
    }
  });

  it('makes a person root, once, for every profile and for one added later', async () => {
    const before = opened.store.driveRoots.list().length;
    const running = await startDrive(driveDeps(startContext()));
    try {
      expect(opened.store.driveRoots.list()).toHaveLength(before);
      const inserted = new Promise<void>((resolve) => {
        const stop = opened.store.feed.subscribe((change) => {
          if (change.table === 'drive_roots' && change.operation === 'INSERT') {
            stop();
            resolve();
          }
        });
      });
      const kimId = opened.store.profiles.create({ name: 'Kim' }).id;
      await inserted;
      const root = opened.store.driveRoots.byPath(opened.layout.person(kimId).drive);
      expect(root).toMatchObject({ kind: 'managed', scope: 'person', ownerProfileId: kimId });
      await running.runtime.queue.idle();
    } finally {
      await running.stop();
    }
  });
});
