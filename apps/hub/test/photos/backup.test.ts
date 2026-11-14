import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  CLIENT_ROW,
  PHOTOS_ENDPOINTS,
  PHOTO_UPLOAD_TARGET,
  PHOTO_UPLOAD_TARGET_REQUEST,
  type BackupRegister,
  type CommittedNotice,
  type BackupSettings,
  type DriveItem,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fileDraft, folderDraft, recordItem, type ChangeEnv } from '../../src/drive/changes';
import { commitRestore, commitTrash } from '../../src/drive/trash-purge';
import { removeTrashEntry } from '../../src/drive/trash';
import { identityOf, isoOf } from '../../src/drive/changes';
import { migratePhotosFolder } from '../../src/photos/folder-migration';
import { PHOTO_FOLDER_RECEIPT, PHOTO_FOLDER_RECEIPTS } from '../../src/photos/folder-receipts';
import { PHOTOS_FOLDER_MIGRATION } from '../../src/store/migrations/photos-folder';
import { recoverIntents, TMP_DIRECTORY } from '../../src/drive/intents';
import { nodeFiles } from '../../src/drive/versions';
import { BackupService, type BackupEnv, type BackupStore } from '../../src/photos/backup';
import { PHOTOS_FOLDER } from '../../src/photos/membership';
import { LibraryReader } from '../../src/photos/library';
import { photoBackupRoutes } from '../../src/photos/backup-routes';
import type { Caller } from '../../src/server/auth';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { driveRepositories } from '../../src/store/repositories/areas/drive';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from '../drive/spaces-fixture';

const NOW = '2026-11-07T08:00:00.000Z';
const SETTINGS: BackupSettings = {
  enabled: true,
  folders: ['Camera'],
  wifiOnly: true,
  chargingOnly: false,
  includeVideos: true,
};

let database: DatabaseSync;
let context: StoreContext;
let store: BackupStore;
let sql: Sql;
let base = '';
let service: BackupService;
let env: BackupEnv;
let alice = '';
let bob = '';
let alicePhone = '';
let bobPhone = '';
let aliceRoot = '';
let bobRoot = '';
let sharedRoot = '';
let nextIno = 1;

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

const drivePaths = new Map<string, string>();

function drivePathOf(scope: 'person' | 'home', owner: string | null): string {
  const path = drivePaths.get(`${scope}:${String(owner)}`);
  if (path === undefined)
    throw new Error(`The test drive ${scope}:${String(owner)} has no folder.`);
  return path;
}

async function addRoot(
  name: string,
  scope: 'person' | 'home',
  owner: string | null,
): Promise<string> {
  const id = randomUUID();
  const path = join(base, name);
  await mkdir(path, { recursive: true });
  drivePaths.set(`${scope}:${String(owner)}`, path);
  store.driveRoots.insert(owner === null ? sharedDriveRoot(id) : personalDriveRoot(id, owner));
  return id;
}

function phone(externalId: string): string {
  const [row] = new DevicesRepository(context).upsert([
    {
      provider: 'local',
      externalId,
      parentId: null,
      kind: 'phone',
      name: externalId,
      model: 'Pixel',
      manufacturer: 'Google',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('the phone was not stored');
  return row.id;
}

function register(deviceId: string, name = 'Pixel'): BackupRegister {
  return { deviceId, name, platform: 'android', settings: SETTINGS };
}

function addItem(rootId: string, name: string, hash: string | null, addedBy: string): DriveItem {
  return store.driveItems.write({
    item: fileDraft(
      {
        rootId,
        parentId: null,
        relPath: name,
        modifiedAt: NOW,
        addedAt: NOW,
        outside: false,
        addedByProfileId: addedBy,
      },
      { bytes: 10, sha256: hash },
    ),
    identity: { dev: '1', ino: String(nextIno++) },
  }).item;
}

interface UploadSpec {
  readonly profileId: string;
  readonly folderId: string;
  readonly rootId: string;
  readonly length: number;
  readonly offset: number;
}

function insertUpload({ profileId, folderId, rootId, length, offset }: UploadSpec): void {
  database
    .prepare(
      `insert into drive_uploads (id, root_id, target_kind, target_id, base_rev, name, length, offset, state,
         failure_reason, profile_id, client_id, node_id, created_at, expires_at)
       values (?, ?, 'folder', ?, null, 'a.jpg', ?, ?, 'open', null, ?, ?, null, ?, ?)`,
    )
    .run(
      randomUUID(),
      rootId,
      folderId,
      length,
      offset,
      profileId,
      clientFor(profileId),
      NOW,
      '2026-11-14T08:00:00.000Z',
    );
}

function clientFor(profileId: string): string {
  const id = randomUUID();
  database
    .prepare(
      `insert into clients (id, name, platform, role, token_hash, profile_id, created_at)
       values (?, 'Phone', 'android', 'member', ?, ?, ?)`,
    )
    .run(id, id.replace(/-/g, '').repeat(2), profileId, NOW);
  return id;
}

beforeEach(async () => {
  captureLogs();
  base = await realpath(await mkdtemp(join(tmpdir(), 'photos-backup-')));
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  sql = new Sql(database);
  const feed = new ChangeFeed(log);
  context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  store = {
    ...driveRepositories(context, drivePathOf),
    feed,
    write: <T>(work: () => T): T => context.write(work),
    driveBackup: new DriveBackupRepository(context),
    devices: new DevicesRepository(context),
  };
  alice = profiles.create({ name: 'Alice' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  alicePhone = phone('alice-phone');
  bobPhone = phone('bob-phone');
  aliceRoot = await addRoot('alice', 'person', alice);
  bobRoot = await addRoot('bob', 'person', bob);
  sharedRoot = await addRoot('shared', 'home', null);
  const changeEnv: ChangeEnv = {
    files: nodeFiles,
    store,
    log,
    now: () => new Date(NOW),
    purge: { rearm: (): void => undefined },
  };
  env = { ...changeEnv, store, sql };
  service = new BackupService(env);
});

afterEach(async () => {
  database.close();
  await rm(base, { recursive: true, force: true });
});

describe('device registry', () => {
  it('registers a phone for its person and changes its settings in place', () => {
    const first = service.registerDevice(alice, register(alicePhone));
    expect(first).toMatchObject({ profileId: alice, deviceId: alicePhone, lastSeenAt: NOW });
    const changed = service.registerDevice(alice, {
      ...register(alicePhone),
      settings: { ...SETTINGS, wifiOnly: false },
    });
    expect(changed.id).toBe(first.id);
    expect(changed.settings.wifiOnly).toBe(false);
    expect(store.driveBackup.devicesOf(alice)).toHaveLength(1);
  });

  it('refuses a phone the hub does not know and a phone that belongs to someone else', () => {
    expect(() => service.registerDevice(alice, register(randomUUID()))).toThrow(
      /does not know this phone/,
    );
    service.registerDevice(alice, register(alicePhone));
    expect(() => service.registerDevice(bob, register(alicePhone))).toThrow(/another person/);
  });
});

describe('have-hash answers', () => {
  beforeEach(() => {
    service.registerDevice(alice, register(alicePhone));
  });

  it('answers already have it by content hash and records the asset as verified', () => {
    const held = addItem(aliceRoot, 'held.jpg', sha('held'), alice);
    const result = service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [
        { localId: 'content://1', sha256: sha('held') },
        { localId: 'content://2', sha256: sha('new') },
      ],
    });
    expect(result).toEqual({
      have: [{ localId: 'content://1', itemId: held.id }],
      missing: ['content://2'],
    });
    const device = store.driveBackup.findDeviceByHubDevice(alicePhone);
    const rows = store.driveBackup.assetsOf(device?.id ?? '');
    expect(rows.map((row) => [row.local_id, row.state, row.item_id])).toEqual([
      ['content://1', 'verified', held.id],
      ['content://2', 'uploading', null],
    ]);
  });

  it('counts a copy in the home root but never one in another person root', () => {
    addItem(bobRoot, 'bob.jpg', sha('bob'), bob);
    const shared = addItem(sharedRoot, 'shared.jpg', sha('shared'), bob);
    const result = service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [
        { localId: 'a', sha256: sha('bob') },
        { localId: 'b', sha256: sha('shared') },
      ],
    });
    expect(result.have).toEqual([{ localId: 'b', itemId: shared.id }]);
    expect(result.missing).toEqual(['a']);
  });

  it('does not trust a copy the hub has not hashed', () => {
    addItem(aliceRoot, 'unhashed.jpg', null, alice);
    const result = service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'a', sha256: sha('unhashed') }],
    });
    expect(result.have).toEqual([]);
    expect(result.missing).toEqual(['a']);
  });

  it('forgets the verified state when the copy has left the library', () => {
    const held = addItem(aliceRoot, 'held.jpg', sha('held'), alice);
    const ask = (): ReturnType<BackupService['checkHashes']> =>
      service.checkHashes(alice, {
        deviceId: alicePhone,
        assets: [{ localId: 'x', sha256: sha('held') }],
      });
    expect(ask().have).toHaveLength(1);
    store.driveItems.remove(held.id);
    expect(ask()).toEqual({ have: [], missing: ['x'] });
    const device = store.driveBackup.findDeviceByHubDevice(alicePhone);
    expect(store.driveBackup.findAsset(device?.id ?? '', 'x')?.state).toBe('uploading');
  });

  it('keeps a member from asking with someone else phone', () => {
    service.registerDevice(bob, register(bobPhone));
    expect(() =>
      service.checkHashes(alice, {
        deviceId: bobPhone,
        assets: [{ localId: 'a', sha256: sha('a') }],
      }),
    ).toThrow(/not registered/);
  });
});

describe('verified on the hub after the upload lands', () => {
  beforeEach(() => {
    service.registerDevice(alice, register(alicePhone));
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'content://9', sha256: sha('late') }],
    });
  });

  it('marks the waiting asset verified when the matching file commits into the person root', () => {
    const item = addItem(aliceRoot, 'late.jpg', sha('late'), alice);
    expect(service.settleItem(item)).toBe(1);
    const device = store.driveBackup.findDeviceByHubDevice(alicePhone);
    expect(store.driveBackup.findAsset(device?.id ?? '', 'content://9')).toMatchObject({
      state: 'verified',
      item_id: item.id,
    });
    expect(service.settleItem(item)).toBe(0);
  });

  it('ignores a matching file in another person root, a folder and an unhashed file', () => {
    expect(service.settleItem(addItem(bobRoot, 'late.jpg', sha('late'), bob))).toBe(0);
    expect(service.settleItem(addItem(aliceRoot, 'plain.jpg', null, alice))).toBe(0);
    const folder = recordItem(env, {
      draft: folderDraft(
        {
          rootId: aliceRoot,
          parentId: null,
          relPath: 'dir',
          modifiedAt: NOW,
          addedAt: NOW,
          outside: false,
          addedByProfileId: alice,
        },
        0,
      ),
      identity: { dev: '1', ino: String(nextIno++) },
      op: 'create',
      actor: { actorProfileId: alice, via: 'app', deviceId: null },
    });
    expect(service.settleItem(folder)).toBe(0);
  });
});

describe('coverage per phone', () => {
  it('counts every state of each phone, the bytes still to send and the last backup time', async () => {
    service.registerDevice(alice, register(alicePhone, 'Alice Pixel'));
    service.registerDevice(bob, register(bobPhone, 'Bob Pixel'));
    addItem(aliceRoot, 'one.jpg', sha('one'), alice);
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [
        { localId: '1', sha256: sha('one') },
        { localId: '2', sha256: sha('two') },
        { localId: '3', sha256: sha('three') },
      ],
    });
    const device = store.driveBackup.findDeviceByHubDevice(alicePhone);
    store.driveBackup.saveAsset({
      backup_device_id: device?.id ?? '',
      local_id: '4',
      item_id: null,
      sha256: sha('four'),
      state: 'failed',
      at: NOW,
    });
    const target = await service.backupTarget(alice, alicePhone);
    insertUpload({
      profileId: alice,
      folderId: target.folderId,
      rootId: aliceRoot,
      length: 1000,
      offset: 400,
    });
    insertUpload({
      profileId: alice,
      folderId: target.folderId,
      rootId: aliceRoot,
      length: 500,
      offset: 0,
    });
    const { devices, bytesLeft, targetFolder } = service.state(alice);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      backedUp: 1,
      pending: 0,
      uploading: 2,
      failed: 1,
      lastBackupAt: NOW,
    });
    expect(devices[0]?.device.name).toBe('Alice Pixel');
    expect(bytesLeft).toBe(1100);
    expect(targetFolder).toBe(PHOTOS_FOLDER);
  });

  it('shows a person only their own phones', () => {
    service.registerDevice(alice, register(alicePhone));
    service.registerDevice(bob, register(bobPhone));
    expect(service.state(alice).devices.map((entry) => entry.device.deviceId)).toEqual([
      alicePhone,
    ]);
    expect(service.state(bob).devices.map((entry) => entry.device.deviceId)).toEqual([bobPhone]);
  });

  it('reports no backup yet as an empty phone, not as a made-up time', () => {
    service.registerDevice(alice, register(alicePhone));
    const state = service.state(alice);
    expect(state.devices[0]).toMatchObject({ backedUp: 0, uploading: 0, lastBackupAt: null });
    expect(state.bytesLeft).toBe(0);
  });
});

describe('target folders', () => {
  beforeEach(() => {
    service.registerDevice(alice, register(alicePhone));
  });

  it('uses one Photos folder for every backup date and manual photo or video upload', async () => {
    const target = await service.backupTarget(alice, alicePhone);
    expect(target.path).toBe('Photos');
    expect(store.driveItems.byPath(aliceRoot, 'Photos', null)).toMatchObject({
      id: target.folderId,
      kind: 'folder',
      parentId: null,
    });
    expect(await service.manualTarget(alice)).toEqual(target);
    expect(await readdir(join(base, 'alice'))).toEqual(['Photos']);
  });

  it('gives the same folder to repeated and simultaneous requests', async () => {
    const results = await Promise.all([
      service.backupTarget(alice, alicePhone),
      service.backupTarget(alice, alicePhone),
      service.manualTarget(alice),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual(results[2]);
    expect(
      store.driveItems.children({
        rootId: aliceRoot,
        parentId: null,
        after: null,
        limit: 50,
        viewer: null,
      }).entries,
    ).toHaveLength(1);
  });

  it('adopts a Photos folder that exists on disk but is not indexed yet', async () => {
    await mkdir(join(base, 'alice', 'Photos'));
    expect((await service.backupTarget(alice, alicePhone)).path).toBe('Photos');
  });

  it('refuses when a file sits where Photos must go', async () => {
    addItem(aliceRoot, PHOTOS_FOLDER, sha('x'), alice);
    await writeFile(join(base, 'alice', PHOTOS_FOLDER), 'x');
    await expect(service.backupTarget(alice, alicePhone)).rejects.toThrow(/in the way/);
  });

  it('does not insert the person name into their own Drive folder', async () => {
    const slashed = new ProfilesRepository(context).create({ name: 'A/B' }).id;
    await addRoot('slashed', 'person', slashed);
    expect((await service.manualTarget(slashed)).path).toBe('Photos');
  });

  it('puts each person in their own root and refuses a phone that is not theirs', async () => {
    service.registerDevice(bob, register(bobPhone));
    const mine = await service.backupTarget(bob, bobPhone);
    expect(store.driveItems.byPath(bobRoot, mine.path, null)?.id).toBe(mine.folderId);
    expect(store.driveItems.byPath(aliceRoot, mine.path, null)).toBeUndefined();
    await expect(service.backupTarget(alice, bobPhone)).rejects.toThrow(/not registered/);
  });

  it('says so when the person has no drive yet', async () => {
    const lone = new ProfilesRepository(context).create({ name: 'Lone' }).id;
    await expect(service.manualTarget(lone)).rejects.toThrow(/has no drive yet/);
  });
});

describe('routes', () => {
  let opened: TestStore;

  beforeEach(async () => {
    opened = await driveTestStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  function caller(profileId: string): Extract<Caller, { readonly kind: 'client' }> {
    const client = CLIENT_ROW.parse({
      id: randomUUID(),
      name: 'Phone',
      platform: 'android',
      role: 'member',
      built_in: false,
      profile_id: profileId,
      created_at: NOW,
      last_seen_at: null,
    });
    const phoneId = profileId === alice ? alicePhone : bobPhone;
    sql.run('bind fake phone', 'update devices set details = $details where id = $id', {
      id: phoneId,
      details: JSON.stringify({ clientId: client.id, profileId }),
    });
    return { kind: 'client', client, profileId };
  }

  function routes(): ReturnType<typeof photoBackupRoutes> {
    return photoBackupRoutes({ ...opened.store, devices: new DevicesRepository(context) }, service);
  }

  const log = testLogger('photos-backup');

  const raw = (
    body: unknown,
  ): {
    params: object;
    query: object;
    body: unknown;
    remote: string;
    headers: Record<string, string>;
  } => ({
    params: {},
    query: {},
    body,
    remote: '127.0.0.1',
    headers: {},
  });

  it('registers, answers have-hashes and reads state for the calling person only', async () => {
    const bound = routes();
    const device = await bound.registerBackupDevice.run(
      caller(alice),
      raw({ deviceId: alicePhone, name: 'Pixel', platform: 'android', settings: SETTINGS }),
      log,
    );
    expect(device).toMatchObject({ profileId: alice });
    addItem(aliceRoot, 'held.jpg', sha('held'), alice);
    const have = await bound.checkBackupHashes.run(
      caller(alice),
      raw({ deviceId: alicePhone, assets: [{ localId: 'a', sha256: sha('held') }] }),
      log,
    );
    expect(have).toMatchObject({ missing: [] });
    const own = await bound.readBackupState.run(caller(alice), raw(undefined), log);
    expect(own).toMatchObject({ devices: [{ device: { deviceId: alicePhone } }] });
    expect(own).toHaveProperty('devices.length', 1);
    expect(await bound.readBackupState.run(caller(bob), raw(undefined), log)).toEqual({
      devices: [],
      bytesLeft: 0,
      targetFolder: PHOTOS_FOLDER,
    });
  });

  it('resolves backup and manual upload targets through one endpoint', async () => {
    service.registerDevice(alice, register(alicePhone));
    const bound = routes();
    const backup = await bound.resolvePhotoUploadTarget.run(
      caller(alice),
      raw({ kind: 'backup', deviceId: alicePhone, takenAt: '2026-05-02T10:00:00+00:00' }),
      log,
    );
    expect(PHOTO_UPLOAD_TARGET.parse(backup).path).toBe('Photos');
    const manual = await bound.resolvePhotoUploadTarget.run(
      caller(alice),
      raw({ kind: 'manual' }),
      log,
    );
    expect(PHOTO_UPLOAD_TARGET.parse(manual).path).toBe('Photos');
  });

  it('rejects another phone credential and a reassigned profile without transferring the backup owner', async () => {
    const original = caller(alice);
    const bound = routes();
    service.registerDevice(alice, register(alicePhone));
    const otherPhone = { ...original, client: { ...original.client, id: randomUUID() } };
    await expect(
      bound.checkBackupHashes.run(
        otherPhone,
        raw({ deviceId: alicePhone, assets: [{ localId: 'x', sha256: sha('x') }] }),
        log,
      ),
    ).rejects.toThrow(/paired phone/);
    const reassigned = { ...original, profileId: bob };
    await expect(
      bound.resolvePhotoUploadTarget.run(
        reassigned,
        raw({ kind: 'backup', deviceId: alicePhone, takenAt: NOW }),
        log,
      ),
    ).rejects.toThrow(/paired phone/);
    expect(store.driveBackup.findDeviceByHubDevice(alicePhone)?.profile_id).toBe(alice);
  });

  it('rejects a target request that mixes the two kinds and any unknown field', () => {
    expect(PHOTO_UPLOAD_TARGET_REQUEST.safeParse({ kind: 'manual', deviceId: 'x' }).success).toBe(
      false,
    );
    expect(PHOTO_UPLOAD_TARGET_REQUEST.safeParse({ kind: 'backup' }).success).toBe(false);
    expect(PHOTOS_ENDPOINTS.resolvePhotoUploadTarget.access).toBe('member');
  });
});

describe('backup publication into Photos', () => {
  function datedItem(name: string, hash: string): DriveItem {
    const item = addItem(aliceRoot, name, hash, alice);
    database
      .prepare("update drive_items set taken_at = '2026-03-01T00:30:00.000Z' where id = ?")
      .run(item.id);
    database
      .prepare(
        "insert into drive_media (item_id, time_source, tz_offset_min, preview_state, poster_state, playable_state) values (?, 'metadata', -60, 'ready', 'none', 'none')",
      )
      .run(item.id);
    return store.driveItems.byId(item.id, null);
  }

  it('removes retained Photos membership only when the trashed backup is permanently purged', async () => {
    service.registerDevice(alice, register(alicePhone));
    const item = datedItem('purge.jpg', sha('purge'));
    const root = store.driveRoots.byId(aliceRoot);
    await writeFile(join(root.path, 'purge.jpg'), 'purge');
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'purge', sha256: sha('purge') }],
    });
    const membership = (): unknown =>
      database.prepare('select item_id from drive_photo_library where item_id = ?').get(item.id);
    expect(membership()).toBeDefined();
    await commitTrash(env, root, item.id, { actorProfileId: alice, via: 'app', deviceId: null });
    expect(membership()).toBeDefined();
    const entry = store.driveTrash.byId(item.id);
    await removeTrashEntry(env, entry);
    expect(store.driveTrash.find(item.id)).toBeUndefined();
    expect(membership()).toBeUndefined();
  });

  it('publishes an already-held hash into its capture-local month for every client', () => {
    service.registerDevice(alice, register(alicePhone));
    const held = datedItem('held.jpg', sha('held'));
    const reader = new LibraryReader(context, () => 'UTC');
    const actor = { profileId: alice };
    expect(reader.buckets(actor, { filter: 'all' })).toEqual([]);
    const notices: CommittedNotice[] = [];
    const unsubscribe = store.feed.subscribeNotices((notice) => notices.push(notice));
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'held', sha256: sha('held') }],
    });
    expect(reader.page(actor, '2026-02', { filter: 'all' }).ids).toEqual([held.id]);
    expect(notices).toContainEqual(
      expect.objectContaining({ type: 'drive_changed', months: ['2026-02'] }),
    );
    unsubscribe();
  });

  it('publishes a newly verified upload into its capture-local month', () => {
    service.registerDevice(alice, register(alicePhone));
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'new', sha256: sha('new') }],
    });
    const item = datedItem('new.jpg', sha('new'));
    const notices: CommittedNotice[] = [];
    const unsubscribe = store.feed.subscribeNotices((notice) => notices.push(notice));
    expect(service.settleItem(item)).toBe(1);
    expect(
      new LibraryReader(context, () => 'UTC').page({ profileId: alice }, '2026-02', {
        filter: 'all',
      }).ids,
    ).toEqual([item.id]);
    expect(notices).toContainEqual(
      expect.objectContaining({ type: 'drive_changed', months: ['2026-02'] }),
    );
    unsubscribe();
  });
});

describe('committed backup invalidation', () => {
  it('notifies registration, settings and an all-already-held backup on only the person root', () => {
    const notices: CommittedNotice[] = [];
    const unsubscribe = store.feed.subscribeNotices((notice) => {
      notices.push(notice);
    });
    service.registerDevice(alice, register(alicePhone));
    service.registerDevice(alice, {
      ...register(alicePhone),
      settings: { ...SETTINGS, wifiOnly: false },
    });
    addItem(aliceRoot, 'held.jpg', sha('held'), alice);
    expect(
      service.checkHashes(alice, {
        deviceId: alicePhone,
        assets: [{ localId: 'held', sha256: sha('held') }],
      }).missing,
    ).toEqual([]);
    expect(notices).toHaveLength(3);
    for (const notice of notices) {
      expect(notice).toMatchObject({
        type: 'drive_changed',
        rootIds: [aliceRoot],
        folderIds: [],
        albumIds: [],
      });
    }
    unsubscribe();
  });

  it('notifies verified settlement with the backup owner root even for a shared held copy', () => {
    service.registerDevice(alice, register(alicePhone));
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'late', sha256: sha('late') }],
    });
    const notices: CommittedNotice[] = [];
    const unsubscribe = store.feed.subscribeNotices((notice) => {
      notices.push(notice);
    });
    const item = addItem(sharedRoot, 'late.jpg', sha('late'), bob);
    expect(service.settleItem(item)).toBe(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ type: 'drive_changed', rootIds: [aliceRoot, sharedRoot] });
    expect(service.settleItem(item)).toBe(0);
    expect(notices).toHaveLength(1);
    unsubscribe();
  });

  it('discards registration and hash-only notices when the surrounding transaction aborts', () => {
    const notices: CommittedNotice[] = [];
    const unsubscribe = store.feed.subscribeNotices((notice) => {
      notices.push(notice);
    });
    expect(() =>
      store.write(() => {
        service.registerDevice(alice, register(alicePhone));
        throw new Error('isolated aborted registration');
      }),
    ).toThrow(/aborted registration/);
    expect(store.driveBackup.findDeviceByHubDevice(alicePhone)).toBeUndefined();
    expect(notices).toEqual([]);
    const device = service.registerDevice(alice, register(alicePhone));
    notices.length = 0;
    expect(() =>
      store.write(() => {
        service.checkHashes(alice, {
          deviceId: alicePhone,
          assets: [{ localId: 'missing', sha256: sha('missing') }],
        });
        throw new Error('isolated aborted hash check');
      }),
    ).toThrow(/aborted hash check/);
    expect(store.driveBackup.assetsOf(device.id)).toEqual([]);
    expect(notices).toEqual([]);
    unsubscribe();
  });
});

describe('existing photo and video folder migration', () => {
  async function legacy(rootId: string, path: string, content: string): Promise<DriveItem> {
    const root = store.driveRoots.byId(rootId);
    const absolute = join(root.path, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
    const stamp = await nodeFiles.stamp(absolute);
    if (stamp === null) throw new Error('fixture missing');
    return recordItem(env, {
      draft: fileDraft(
        {
          rootId,
          parentId: null,
          relPath: path,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: NOW,
          outside: false,
          addedByProfileId: store.driveRoots.byId(rootId).ownerProfileId,
        },
        { bytes: Buffer.byteLength(content), sha256: sha(content) },
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor: { actorProfileId: alice, via: 'app', deviceId: null },
    });
  }

  function enqueue(): void {
    for (const statement of PHOTOS_FOLDER_MIGRATION.statements.filter((statement) =>
      statement.startsWith('insert'),
    ))
      database.exec(statement.replaceAll("r.kind = 'managed' and ", ''));
  }

  async function oldFolder(path: string): Promise<DriveItem> {
    const absolute = join(base, 'alice', path);
    await mkdir(absolute, { recursive: true });
    const stamp = await nodeFiles.stamp(absolute);
    if (stamp === null) throw new Error('fixture missing');
    return recordItem(env, {
      draft: folderDraft(
        {
          rootId: aliceRoot,
          parentId: null,
          relPath: path,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: NOW,
          outside: false,
          addedByProfileId: alice,
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor: { actorProfileId: alice, via: 'app', deviceId: null },
    });
  }

  it('keeps active upload staged bytes through offline and normal Drive recovery', async () => {
    const folder = await oldFolder('Camera roll/Alice/2026/2026-01');
    insertUpload({
      profileId: alice,
      folderId: folder.id,
      rootId: aliceRoot,
      length: 1000,
      offset: 400,
    });
    const upload = database.prepare('select id from drive_uploads').get();
    const parsed = z.strictObject({ id: z.string() }).parse(upload);
    const temporary = join(base, 'alice', TMP_DIRECTORY);
    await mkdir(temporary, { recursive: true });
    await writeFile(join(temporary, parsed.id), 'original uploaded prefix');
    await writeFile(join(temporary, 'orphan'), 'discard this orphan');
    const root = store.driveRoots.byId(aliceRoot);
    const report = await recoverIntents({ ...env, finishCommit: (): void => undefined }, [root]);
    expect(report.tmpRemoved).toBe(1);
    expect(await readFile(join(temporary, parsed.id), 'utf8')).toBe('original uploaded prefix');
    enqueue();
    await migratePhotosFolder(env);
    await recoverIntents({ ...env, finishCommit: (): void => undefined }, [root]);
    expect(await readFile(join(temporary, parsed.id), 'utf8')).toBe('original uploaded prefix');
    expect(store.driveUploads.byId(parsed.id).offset).toBe(400);
  });

  it('retargets pending media uploads without changing uploaded offsets or non-media destinations', async () => {
    const folder = await oldFolder('Camera roll/Alice/2026/2026-01');
    insertUpload({
      profileId: alice,
      folderId: folder.id,
      rootId: aliceRoot,
      length: 1000,
      offset: 400,
    });
    insertUpload({
      profileId: alice,
      folderId: folder.id,
      rootId: aliceRoot,
      length: 500,
      offset: 200,
    });
    database.exec("update drive_uploads set name = 'notes.txt' where length = 500");
    enqueue();
    await migratePhotosFolder(env);
    const target = await service.manualTarget(alice);
    expect(
      database.prepare('select name, target_id, offset from drive_uploads order by length').all(),
    ).toEqual([
      { name: 'notes.txt', target_id: folder.id, offset: 200 },
      { name: 'a.jpg', target_id: target.folderId, offset: 400 },
    ]);
    expect(store.driveItems.find(folder.id, null)).toBeDefined();
  });

  it('removes only empty former folders and preserves nonempty unindexed content', async () => {
    const empty = await oldFolder('Camera roll');
    const retained = await oldFolder('Uploads');
    await writeFile(join(base, 'alice', 'Uploads', 'notes.txt'), 'keep');
    enqueue();
    await migratePhotosFolder(env);
    expect(store.driveItems.find(empty.id, null)).toBeUndefined();
    expect(await nodeFiles.stamp(join(base, 'alice', 'Camera roll'))).toBeNull();
    expect(store.driveItems.find(retained.id, null)).toBeDefined();
    expect(await readdir(join(base, 'alice', 'Uploads'))).toEqual(['notes.txt']);
  });

  it('keeps deleted media deleted while changing its eventual restore destination to Photos', async () => {
    const item = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.mp4', 'video');
    const root = store.driveRoots.byId(aliceRoot);
    await commitTrash(env, root, item.id, { actorProfileId: alice, via: 'app', deviceId: null });
    enqueue();
    await migratePhotosFolder(env);
    expect(store.driveItems.find(item.id, null)).toBeUndefined();
    expect(store.driveTrash.byId(item.id).originalRelPath).toBe('Photos/a.mp4');
    const restored = await commitRestore(env, root, item.id, {
      actorProfileId: alice,
      via: 'app',
      deviceId: null,
    });
    expect(restored.item.id).toBe(item.id);
    expect(restored.item.relPath).toBe('Photos/a.mp4');
  });

  it('moves existing photos and videos with IDs, receipts, metadata and separate personal roots intact', async () => {
    service.registerDevice(alice, register(alicePhone));
    const image = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.jpg', 'image');
    const video = await legacy(aliceRoot, 'Uploads/Alice/a.mp4', 'video');
    const other = await legacy(bobRoot, 'Camera roll/Bob/2025/2025-01/a.jpg', 'other');
    service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [{ localId: 'original', sha256: sha('image') }],
    });
    enqueue();
    await migratePhotosFolder(env);
    for (const item of [image, video, other]) {
      const moved = store.driveItems.byId(item.id, null);
      expect(moved).toMatchObject({
        ...item,
        relPath: `Photos/${item.name}`,
        parentId: store.driveItems.byPath(item.rootId, 'Photos', null)?.id,
        rev: item.rev + 1,
        etag: moved.etag,
      });
      expect(moved.etag).not.toBe(item.etag);
      expect(
        await nodeFiles.stamp(join(store.driveRoots.byId(item.rootId).path, item.relPath)),
      ).toBeNull();
      expect(
        await nodeFiles.stamp(join(store.driveRoots.byId(item.rootId).path, moved.relPath)),
      ).not.toBeNull();
    }
    expect(
      service.checkHashes(alice, {
        deviceId: alicePhone,
        assets: [{ localId: 'original', sha256: sha('image') }],
      }).have,
    ).toEqual([{ localId: 'original', itemId: image.id }]);
    await migratePhotosFolder(env);
    expect(store.driveItems.byId(image.id, null).rev).toBe(image.rev + 1);
    const receipt: unknown = JSON.parse(
      await readFile(join(base, 'alice', PHOTO_FOLDER_RECEIPTS, `${image.id}.json`), 'utf8'),
    );
    expect(PHOTO_FOLDER_RECEIPT.parse(receipt)).toMatchObject({
      kind: 'file',
      itemId: image.id,
      rootId: aliceRoot,
      fromPath: image.relPath,
      toPath: 'Photos/a.jpg',
      sha256: sha('image'),
    });
    expect(database.prepare('select * from drive_photo_relocations').all()).toEqual([]);
  });

  it('keeps same-name files from different devices and an existing Photos file without overwriting', async () => {
    const held = await legacy(aliceRoot, 'Photos/a.jpg', 'held');
    const first = await legacy(aliceRoot, 'Camera roll/Alice/2025/2025-01/a.jpg', 'one');
    const second = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.jpg', 'two');
    enqueue();
    await migratePhotosFolder(env);
    const paths = [held, first, second].map((item) => store.driveItems.byId(item.id, null).relPath);
    expect(new Set(paths).size).toBe(3);
    expect(paths[0]).toBe('Photos/a.jpg');
    expect(paths.every((path) => path.startsWith('Photos/'))).toBe(true);
  });

  it('resumes a crash after the filesystem move using its persisted destination and original file identity', async () => {
    const item = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.mp4', 'video');
    enqueue();
    let crashed = false;
    const crashing: BackupEnv = {
      ...env,
      files: {
        ...nodeFiles,
        syncDirectory: async (path) => {
          if (!crashed && path === join(base, 'alice', 'Camera roll/Alice/2026/2026-01')) {
            crashed = true;
            throw new Error('simulated power loss');
          }
          await nodeFiles.syncDirectory(path);
        },
      },
    };
    await expect(migratePhotosFolder(crashing)).rejects.toThrow('simulated power loss');
    await migratePhotosFolder(env);
    expect(store.driveItems.byId(item.id, null).relPath).toBe('Photos/a.mp4');
    expect(database.prepare('select * from drive_photo_relocations').all()).toEqual([]);
  });

  it('persists receipt ancestors and the new file link before unlinking the original', async () => {
    const item = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.jpg', 'image');
    enqueue();
    const events: string[] = [];
    const observed: BackupEnv = {
      ...env,
      files: {
        ...nodeFiles,
        syncDirectory: async (path) => {
          await nodeFiles.syncDirectory(path);
          events.push(`sync:${path}`);
        },
        writeDurable: async (path, temporary, text) => {
          await nodeFiles.writeDurable(path, temporary, text);
          events.push('receipt');
        },
        link: async (from, to) => {
          await nodeFiles.link(from, to);
          events.push('link');
        },
        unlink: async (path) => {
          events.push('unlink');
          await nodeFiles.unlink(path);
        },
      },
    };
    await migratePhotosFolder(observed);
    const receipt = events.indexOf('receipt');
    const link = events.indexOf('link');
    const targetSync = events.indexOf(`sync:${join(base, 'alice', 'Photos')}`, link);
    const targetRootSync = events.indexOf(`sync:${join(base, 'alice')}`, targetSync);
    expect(events.slice(0, receipt)).toEqual([
      `sync:${join(base, 'alice', PHOTO_FOLDER_RECEIPTS)}`,
      `sync:${join(base, 'alice', '.smarteverything/migrations')}`,
      `sync:${join(base, 'alice', '.smarteverything')}`,
      `sync:${join(base, 'alice')}`,
    ]);
    expect(receipt).toBeLessThan(link);
    expect(link).toBeLessThan(targetSync);
    expect(targetSync).toBeLessThan(targetRootSync);
    expect(targetRootSync).toBeLessThan(events.indexOf('unlink'));
    expect(store.driveItems.byId(item.id, null).relPath).toBe('Photos/a.jpg');
  });

  it.each(['receipt-parent', 'target-parent'])(
    'keeps the original on a %s durability failure and resumes without duplication',
    async (phase) => {
      const item = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.jpg', 'image');
      enqueue();
      const source = join(base, 'alice', item.relPath);
      const target = join(base, 'alice', 'Photos/a.jpg');
      const failing: BackupEnv = {
        ...env,
        files: {
          ...nodeFiles,
          syncDirectory: async (path) => {
            const receiptFailure =
              phase === 'receipt-parent' && path === join(base, 'alice', '.smarteverything');
            const targetFailure =
              phase === 'target-parent' && path === join(base, 'alice', 'Photos');
            if (receiptFailure || targetFailure) throw new Error('simulated fsync failure');
            await nodeFiles.syncDirectory(path);
          },
        },
      };
      await expect(migratePhotosFolder(failing)).rejects.toThrow('simulated fsync failure');
      expect(await nodeFiles.stamp(source)).not.toBeNull();
      if (phase === 'receipt-parent') expect(await nodeFiles.stamp(target)).toBeNull();
      else expect(await nodeFiles.stamp(target)).not.toBeNull();
      await migratePhotosFolder(env);
      expect(await nodeFiles.stamp(source)).toBeNull();
      expect(store.driveItems.byId(item.id, null).relPath).toBe('Photos/a.jpg');
      expect(await readdir(join(base, 'alice', 'Photos'))).toEqual(['a.jpg']);
    },
  );

  it('refuses damaged bytes and leaves their original file and pending migration intact', async () => {
    const item = await legacy(aliceRoot, 'Camera roll/Alice/2026/2026-01/a.jpg', 'image');
    enqueue();
    await writeFile(join(base, 'alice', item.relPath), 'wrong');
    await utimes(
      join(base, 'alice', item.relPath),
      new Date(NOW),
      new Date('2026-11-09T00:00:00Z'),
    );
    await expect(migratePhotosFolder(env)).rejects.toThrow(/does not match/);
    expect(store.driveItems.byId(item.id, null).relPath).toBe(item.relPath);
    expect(database.prepare('select * from drive_photo_relocations').all()).toHaveLength(1);
  });
});
