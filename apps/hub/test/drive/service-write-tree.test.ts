import { lstat, mkdir, readdir, readFile, readlink, stat, writeFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeEnv } from '../../src/drive/changes';
import { hostQuotaSource } from '../../src/drive/quotas';
import { abandonIntent, manifestPath, TRASH_DIRECTORY } from '../../src/drive/intents';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { DriveReadService } from '../../src/drive/service-read';
import { linkDraft, NO_IDENTITY, specialDraft } from '../../src/drive/posix/drafts';
import { DriveTreeWriter } from '../../src/drive/service-write-tree';
import type { DriveCaller } from '../../src/drive/service-write-support';
import { nodeFiles } from '../../src/drive/versions';
import { testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const SHARED = '0d000000-0000-4000-8000-000000000001';
const OWNER_DRIVE = '0d000000-0000-4000-8000-000000000002';
const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000003';
const SHARED_NOTE = '0f000000-0000-4000-8000-000000000001';
const ROBIN_TRIP = '0f000000-0000-4000-8000-000000000002';
const ROBIN_NOTE = '0f000000-0000-4000-8000-000000000003';

let opened: TestStore;
let writer: DriveTreeWriter;
let ownerId = '';
let robinId = '';
let idaId = '';

function noAlbums(): never {
  throw new Error('no albums in this test');
}

function callerOf(profileId: string, isOwner = false): DriveCaller {
  return { profileId, owner: isOwner, via: 'app', deviceId: null };
}

beforeEach(async () => {
  opened = await driveTestStore();
  const { store } = opened;
  ownerId = store.profiles.first().id;
  robinId = store.profiles.create({ name: 'Robin' }).id;
  idaId = store.profiles.create({ name: 'Ida' }).id;
  store.driveRoots.insert(sharedDriveRoot(SHARED));
  store.driveRoots.insert(personalDriveRoot(OWNER_DRIVE, ownerId));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robinId));
  await mkdir(join(opened.layout.person(robinId).drive, 'Trip'), { recursive: true });
  await mkdir(opened.layout.home.drive, { recursive: true });
  putItem(store, { rootId: SHARED, id: SHARED_NOTE, relPath: 'note.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_TRIP, relPath: 'Trip', kind: 'folder' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_NOTE, relPath: 'Trip/a.txt', kind: 'document' });
  const env: ChangeEnv = {
    files: nodeFiles,
    store,
    log: testLogger('drive'),
    now: () => NOW,
    purge: { rearm: (): void => undefined },
  };
  writer = new DriveTreeWriter({ ...writerDeps(), env });
});

function writerDeps(): Omit<ConstructorParameters<typeof DriveTreeWriter>[0], 'env'> {
  const { store } = opened;
  return {
    store,
    lanes: new DriveRootLanes(),
    read: new DriveReadService(store),
    albums: {
      create: noAlbums,
      update: noAlbums,
      remove: noAlbums,
      addItems: noAlbums,
      removeItems: noAlbums,
    },
    guard: {
      status: hostQuotaSource(opened.store),
      space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    scan: (): void => undefined,
  };
}

afterEach(async () => {
  await opened.close();
});

describe('stars', () => {
  it('stars an item for the person who starred it and for nobody else', async () => {
    const result = await writer.apply(callerOf(robinId), {
      action: 'star',
      itemIds: [SHARED_NOTE],
    });
    expect(result.done).toHaveLength(1);
    const { store } = opened;
    expect(store.driveItems.byId(SHARED_NOTE, robinId).starred).toBe(true);
    expect(store.driveItems.byId(SHARED_NOTE, idaId).starred).toBe(false);
    expect(store.driveItems.byId(SHARED_NOTE, ownerId).starred).toBe(false);
    await writer.apply(callerOf(robinId), { action: 'unstar', itemIds: [SHARED_NOTE] });
    expect(store.driveItems.byId(SHARED_NOTE, robinId).starred).toBe(false);
  });

  it('refuses to star an item the person cannot open', async () => {
    const result = await writer.apply(callerOf(ownerId, true), {
      action: 'star',
      itemIds: [ROBIN_NOTE],
    });
    expect(result.done).toEqual([]);
    expect(result.failed).toHaveLength(1);
  });
});

describe('grants on a personal drive', () => {
  it('refuses writes under a view grant and allows them under an edit grant', async () => {
    const { store } = opened;
    store.driveGrants.set(
      { itemId: ROBIN_TRIP, profileId: idaId, role: 'view', expiresAt: null },
      robinId,
    );
    const refused = await writer.apply(callerOf(idaId), {
      action: 'new_folder',
      parent: { kind: 'folder', folderId: ROBIN_TRIP },
      name: 'Day one',
    });
    expect(refused.done).toEqual([]);
    expect(refused.failed[0]?.reason).toMatch(/only view/);
    store.driveGrants.set(
      { itemId: ROBIN_TRIP, profileId: idaId, role: 'edit', expiresAt: null },
      robinId,
    );
    const allowed = await writer.apply(callerOf(idaId), {
      action: 'new_folder',
      parent: { kind: 'folder', folderId: ROBIN_TRIP },
      name: 'Day one',
    });
    expect(allowed.done).toHaveLength(1);
    expect(
      (await stat(join(opened.layout.person(robinId).drive, 'Trip/Day one'))).isDirectory(),
    ).toBe(true);
  });

  it('never lets the owner write into or trash a member item without a grant', async () => {
    const trashed = await writer.apply(callerOf(ownerId, true), {
      action: 'trash',
      itemIds: [ROBIN_NOTE],
    });
    expect(trashed.done).toEqual([]);
    const made = await writer.apply(callerOf(ownerId, true), {
      action: 'new_folder',
      parent: { kind: 'folder', folderId: ROBIN_TRIP },
      name: 'Nope',
    });
    expect(made.done).toEqual([]);
    expect(await readdir(join(opened.layout.person(robinId).drive, 'Trip'))).toEqual([]);
  });

  it('makes a folder at the top of your own drive but never at the top of another person’s', async () => {
    const own = await writer.apply(callerOf(robinId), {
      action: 'new_folder',
      parent: { kind: 'drive', rootId: ROBIN_DRIVE },
      name: 'Plans',
    });
    expect(own.done).toHaveLength(1);
    expect((await stat(join(opened.layout.person(robinId).drive, 'Plans'))).isDirectory()).toBe(
      true,
    );
    const other = await writer.apply(callerOf(ownerId, true), {
      action: 'new_folder',
      parent: { kind: 'drive', rootId: ROBIN_DRIVE },
      name: 'Nope',
    });
    expect(other.done).toEqual([]);
    expect(other.failed).toHaveLength(1);
  });
});

describe('copying links and special files', () => {
  const LINK_ID = '0f000000-0000-4000-8000-0000000000a1';
  const SPECIAL_ID = '0f000000-0000-4000-8000-0000000000a2';
  const DEST = '0f000000-0000-4000-8000-0000000000a3';

  function placed(relPath: string): {
    readonly rootId: string;
    readonly parentId: string | null;
    readonly relPath: string;
    readonly modifiedAt: string;
    readonly addedAt: string;
    readonly outside: boolean;
    readonly addedByProfileId: null;
    readonly id: string;
  } {
    const trip = opened.store.driveItems.byPath(ROBIN_DRIVE, 'Trip', null);
    return {
      rootId: ROBIN_DRIVE,
      parentId: trip?.id ?? null,
      relPath,
      modifiedAt: '2026-11-07T00:00:00.000Z',
      addedAt: '2026-11-07T00:00:00.000Z',
      outside: false,
      addedByProfileId: null,
      id: relPath === 'Trip/l' ? LINK_ID : SPECIAL_ID,
    };
  }

  it('copies a link as a link and a special file as a special file', async () => {
    const { store } = opened;
    await mkdir(join(opened.layout.person(robinId).drive, 'Dest'), { recursive: true });
    putItem(store, { rootId: ROBIN_DRIVE, id: DEST, relPath: 'Dest', kind: 'folder' });
    store.driveItems.write({
      item: linkDraft(placed('Trip/l'), 'some/target'),
      identity: { dev: '1', ino: '9001' },
    });
    store.driveItems.write({
      item: specialDraft(placed('Trip/p')),
      identity: NO_IDENTITY,
      inode: { specialType: 'fifo', mode: 0o600, uid: 1000, gid: 1000 },
    });
    const result = await writer.apply(callerOf(robinId), {
      action: 'copy',
      itemIds: [LINK_ID, SPECIAL_ID],
      toFolderId: DEST,
    });
    expect(result.failed).toEqual([]);
    expect(result.done).toHaveLength(2);
    const dest = join(opened.layout.person(robinId).drive, 'Dest');
    expect((await lstat(join(dest, 'l'))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(dest, 'l'))).toBe('some/target');
    expect(await readdir(dest)).toEqual(['l']);
    const copiedLink = store.driveItems.byPath(ROBIN_DRIVE, 'Dest/l', null);
    expect(copiedLink).toMatchObject({ kind: 'link', linkTarget: 'some/target' });
    const copiedSpecial = store.driveItems.byPath(ROBIN_DRIVE, 'Dest/p', null);
    expect(copiedSpecial?.kind).toBe('special');
    const inode =
      copiedSpecial === undefined ? undefined : store.driveInodes.ofItem(copiedSpecial.id);
    expect(inode).toMatchObject({ type: 'fifo', mode: 0o600, uid: 1000, gid: 1000 });
    expect(copiedSpecial?.id).not.toBe(SPECIAL_ID);
  });
});

describe('trashing a batch', () => {
  it('moves fifty items behind one durability barrier and keeps a missing item as a failure', async () => {
    const { store } = opened;
    const drive = opened.layout.person(robinId).drive;
    const ids: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const id = `0f100000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      await writeFile(join(drive, `batch-${String(index)}.txt`), 'x');
      putItem(store, {
        rootId: ROBIN_DRIVE,
        id,
        relPath: `batch-${String(index)}.txt`,
        kind: 'document',
      });
      ids.push(id);
    }
    const ghost = '0f200000-0000-4000-8000-000000000001';
    putItem(store, { rootId: ROBIN_DRIVE, id: ghost, relPath: 'ghost.txt', kind: 'document' });
    const syncs = { barriers: new Array<readonly string[]>(), directories: 0, durable: 0 };
    const counting = {
      ...nodeFiles,
      syncPaths: (paths: readonly string[]): Promise<void> => {
        syncs.barriers.push(paths);
        return nodeFiles.syncPaths(paths);
      },
      syncDirectory: (path: string): Promise<void> => {
        syncs.directories += 1;
        return nodeFiles.syncDirectory(path);
      },
      writeDurable: (path: string, temporary: string, text: string): Promise<void> => {
        syncs.durable += 1;
        return nodeFiles.writeDurable(path, temporary, text);
      },
    };
    const env: ChangeEnv = {
      files: counting,
      store,
      log: testLogger('drive'),
      now: () => NOW,
      purge: { rearm: (): void => undefined },
    };
    const batch = new DriveTreeWriter({ ...writerDeps(), env });
    const result = await batch.apply(callerOf(robinId), {
      action: 'trash',
      itemIds: [...ids, ghost],
    });
    expect(result.done).toHaveLength(50);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.itemId).toBe(ghost);
    expect(syncs.durable).toBe(0);
    expect(syncs.barriers).toHaveLength(1);
    const synced = new Set(syncs.barriers[0]);
    for (const id of ids) {
      expect([...synced].some((path) => path.endsWith(`${id}.json`))).toBe(true);
    }
    expect(synced.has(drive)).toBe(true);
    expect(syncs.directories).toBe(0);
    expect(store.driveTrash.find(ids[0] ?? '')).toBeDefined();
    expect(store.driveIntents.all()).toEqual([]);
    expect((await readdir(drive)).filter((name) => name.startsWith('batch-'))).toEqual([]);
  });

  it('trashes once when three identical batches arrive together and changes nothing twice', async () => {
    const { store } = opened;
    const drive = opened.layout.person(robinId).drive;
    const ids: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const id = `0f300000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      await writeFile(join(drive, `same-${String(index)}.jpg`), `photo ${String(index)}`);
      putItem(store, {
        rootId: ROBIN_DRIVE,
        id,
        relPath: `same-${String(index)}.jpg`,
        kind: 'document',
      });
      ids.push(id);
    }
    const yielding = {
      ...nodeFiles,
      rename: async (from: string, to: string): Promise<void> => {
        await setImmediate();
        await nodeFiles.rename(from, to);
      },
      stamp: async (path: string): ReturnType<typeof nodeFiles.stamp> => {
        await setImmediate();
        return nodeFiles.stamp(path);
      },
    };
    const env: ChangeEnv = {
      files: yielding,
      store,
      log: testLogger('drive'),
      now: () => NOW,
      purge: { rearm: (): void => undefined },
    };
    const lanes = new DriveRootLanes();
    const batch = new DriveTreeWriter({ ...writerDeps(), lanes, env });
    const seen: { live: number; trashed: number }[] = [];
    const scan = lanes.run([ROBIN_DRIVE], () => setImmediate());
    const first = batch.apply(callerOf(robinId), { action: 'trash', itemIds: ids });
    const second = batch.apply(callerOf(robinId), { action: 'trash', itemIds: ids });
    const third = batch.apply(callerOf(robinId), { action: 'trash', itemIds: ids });
    const answers = await Promise.all([first, second, third]);
    await lanes.run([ROBIN_DRIVE], () => {
      const live = ids.filter((id) => store.driveItems.find(id, null) !== undefined).length;
      const trashed = ids.filter((id) => store.driveTrash.find(id) !== undefined).length;
      seen.push({ live, trashed });
      return Promise.resolve();
    });
    await scan;
    expect(answers.map((result) => result.done.length).sort((left, right) => left - right)).toEqual(
      [0, 0, 20],
    );
    for (const repeat of answers.filter((result) => result.done.length === 0)) {
      expect(repeat.failed).toEqual(
        ids.map((itemId) => ({ itemId, reason: 'It is already in the trash.' })),
      );
    }
    expect(seen).toEqual([{ live: 0, trashed: 20 }]);
    expect(store.driveIntents.all()).toEqual([]);
    expect((await readdir(drive)).filter((name) => name.startsWith('same-'))).toEqual([]);
    for (const [index, id] of ids.entries()) {
      expect(store.driveTrash.find(id)).toBeDefined();
      expect(
        store.driveItems.byPath(ROBIN_DRIVE, `same-${String(index)}.jpg`, null),
      ).toBeUndefined();
      expect(await readFile(join(drive, TRASH_DIRECTORY, id), 'utf8')).toBe(
        `photo ${String(index)}`,
      );
    }
  });

  it('leaves a trashed file in the trash when a stale trash intent for it is rolled back', async () => {
    const { store } = opened;
    const drive = opened.layout.person(robinId).drive;
    const id = '0f400000-0000-4000-8000-000000000001';
    await writeFile(join(drive, 'kept.jpg'), 'kept');
    putItem(store, { rootId: ROBIN_DRIVE, id, relPath: 'kept.jpg', kind: 'document' });
    await writer.apply(callerOf(robinId), { action: 'trash', itemIds: [id] });
    const root = { id: ROBIN_DRIVE, path: drive, versions: false };
    const stale = store.driveIntents.open({
      rootId: ROBIN_DRIVE,
      op: 'trash',
      fromPath: 'kept.jpg',
      toPath: `${TRASH_DIRECTORY}/${id}`,
      versionPath: null,
    });
    const env = { files: nodeFiles, store, log: testLogger('drive'), now: (): Date => NOW };
    await abandonIntent(env, root, stale);
    expect(await readFile(join(drive, TRASH_DIRECTORY, id), 'utf8')).toBe('kept');
    expect(await readFile(join(drive, manifestPath(`${TRASH_DIRECTORY}/${id}`)), 'utf8')).toContain(
      id,
    );
    await expect(stat(join(drive, 'kept.jpg'))).rejects.toThrow();
    expect(store.driveIntents.all()).toEqual([]);
  });
});
