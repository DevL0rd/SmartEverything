import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeEnv } from '../../src/drive/changes';
import { DriveReadService } from '../../src/drive/service-read';
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
  writer = new DriveTreeWriter({
    env,
    store,
    read: new DriveReadService(store),
    albums: {
      create: noAlbums,
      get: noAlbums,
      rename: noAlbums,
      setRule: noAlbums,
      setCover: noAlbums,
      remove: noAlbums,
      addItems: noAlbums,
      removeItems: noAlbums,
    },
    guard: {
      status: (profileId): ReturnType<TestStore['store']['driveQuotas']['status']> =>
        opened.store.driveQuotas.status(profileId),
      space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    scan: (): void => undefined,
  });
});

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
    store.driveGrants.set({ itemId: ROBIN_TRIP, profileId: idaId, role: 'view' }, robinId);
    const refused = await writer.apply(callerOf(idaId), {
      action: 'new_folder',
      parent: { kind: 'folder', folderId: ROBIN_TRIP },
      name: 'Day one',
    });
    expect(refused.done).toEqual([]);
    expect(refused.failed[0]?.reason).toMatch(/only view/);
    store.driveGrants.set({ itemId: ROBIN_TRIP, profileId: idaId, role: 'edit' }, robinId);
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
