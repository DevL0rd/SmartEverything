import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChangeEnv } from '../../src/drive/changes';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveTreeWriter } from '../../src/drive/service-write-tree';
import type { DriveCaller } from '../../src/drive/service-write-support';
import { nodeFiles } from '../../src/drive/versions';
import { testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const DRIVE = '0d000000-0000-4000-8000-000000000003';
const TRIP = '0f000000-0000-4000-8000-000000000002';
const NOTE = '0f000000-0000-4000-8000-000000000003';

let opened: TestStore;
let writer: DriveTreeWriter;
let caller: DriveCaller;
let drive = '';

function noAlbums(): never {
  throw new Error('no albums in this test');
}

beforeEach(async () => {
  opened = await driveTestStore();
  const { store } = opened;
  const robinId = store.profiles.create({ name: 'Robin' }).id;
  caller = { profileId: robinId, owner: false, via: 'app', deviceId: null };
  store.driveRoots.insert(personalDriveRoot(DRIVE, robinId));
  drive = opened.layout.person(robinId).drive;
  await mkdir(join(drive, 'Trip'), { recursive: true });
  await writeFile(join(drive, 'Trip/a.txt'), 'hello');
  putItem(store, { rootId: DRIVE, id: TRIP, relPath: 'Trip', kind: 'folder' });
  putItem(store, { rootId: DRIVE, id: NOTE, relPath: 'Trip/a.txt', kind: 'document' });
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
      status: (profileId): ReturnType<TestStore['store']['driveQuotas']['status']> =>
        store.driveQuotas.status(profileId),
      space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
        Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    },
    scan: (): void => undefined,
  });
});

afterEach(async () => {
  await opened.close();
});

describe('drive creates with an id the client generated', () => {
  it('keeps the client id of a new folder and makes nothing more when the create is repeated', async () => {
    const id = randomUUID();
    const change = {
      action: 'new_folder',
      parent: { kind: 'drive', rootId: DRIVE },
      name: 'Plans',
      id,
    } as const;
    const first = await writer.apply(caller, change);
    const again = await writer.apply(caller, change);

    expect(first.done).toEqual([{ itemId: DRIVE, resultItemId: id }]);
    expect(again).toEqual(first);
    expect(opened.store.driveItems.byId(id, caller.profileId).relPath).toBe('Plans');
  });

  it('refuses a folder id already used for something else', async () => {
    const result = await writer.apply(caller, {
      action: 'new_folder',
      parent: { kind: 'drive', rootId: DRIVE },
      name: 'Plans',
      id: TRIP,
    });

    expect(result.done).toEqual([]);
    expect(await readdir(drive)).toEqual(['Trip']);
  });

  it('keeps the client ids of copies and copies nothing more when the copy is repeated', async () => {
    const copyId = randomUUID();
    const change = {
      action: 'copy',
      itemIds: [NOTE],
      toFolderId: TRIP,
      copyIds: [copyId],
    } as const;
    await writer.apply(caller, {
      action: 'new_folder',
      parent: { kind: 'folder', folderId: TRIP },
      name: 'Copies',
    });
    const into = opened.store.driveItems.byPath(DRIVE, 'Trip/Copies', caller.profileId);
    const copy = { ...change, toFolderId: into?.id ?? '' };
    const first = await writer.apply(caller, copy);
    const again = await writer.apply(caller, copy);

    expect(first.done).toEqual([{ itemId: NOTE, resultItemId: copyId }]);
    expect(again).toEqual(first);
    expect(await readdir(join(drive, 'Trip/Copies'))).toEqual(['a.txt']);
  });
});
