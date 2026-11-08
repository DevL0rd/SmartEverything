import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
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
  type DriveRoot,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileDraft, folderDraft, recordItem, type ChangeEnv } from '../../src/drive/changes';
import { commitTrash } from '../../src/drive/trash-purge';
import { removeTrashEntry } from '../../src/drive/trash';
import { physicalRoot } from '../../src/drive/intents';
import { nodeFiles } from '../../src/drive/versions';
import {
  BackupService,
  CAMERA_ROLL,
  UPLOADS,
  type BackupEnv,
  type BackupStore,
} from '../../src/photos/backup';
import { TimelineReader } from '../../src/photos/timeline';
import { photoBackupRoutes } from '../../src/photos/backup-routes';
import type { Caller } from '../../src/server/auth';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { driveRepositories } from '../../src/store/repositories/areas/drive';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

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
let linkedRoot = '';
let nextIno = 1;

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

interface RootSpec {
  readonly id: string;
  readonly path: string;
  readonly scope: 'person' | 'home';
  readonly owner: string | null;
  readonly kind: 'managed' | 'folder';
}

function rootRow({ id, path, scope, owner, kind }: RootSpec): DriveRoot {
  const common = {
    id,
    label: 'Managed',
    scope,
    ownerProfileId: owner,
    path,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: `index-${id}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: { hashedShare: 0, verifiedShare: 0, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  } as const;
  return kind === 'managed' ? { ...common, kind: 'managed' } : { ...common, kind: 'folder' };
}

async function addRoot(
  name: string,
  scope: 'person' | 'home',
  owner: string | null,
  kind: 'managed' | 'folder' = 'managed',
): Promise<string> {
  const id = randomUUID();
  const path = join(base, name);
  await mkdir(path, { recursive: true });
  store.driveRoots.insert(rootRow({ id, path, scope, owner, kind }));
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
    ...driveRepositories(context),
    feed,
    write: <T>(work: () => T): T => context.write(work),
    driveBackup: new DriveBackupRepository(context),
    devices: new DevicesRepository(context),
    profiles,
  };
  alice = profiles.create({ name: 'Alice' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  alicePhone = phone('alice-phone');
  bobPhone = phone('bob-phone');
  aliceRoot = await addRoot('alice', 'person', alice);
  bobRoot = await addRoot('bob', 'person', bob);
  sharedRoot = await addRoot('shared', 'home', null);
  linkedRoot = await addRoot('linked', 'home', null, 'folder');
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

  it('does not trust a copy the hub does not hold itself or has not verified', () => {
    addItem(linkedRoot, 'linked.jpg', sha('linked'), alice);
    addItem(aliceRoot, 'unhashed.jpg', null, alice);
    const result = service.checkHashes(alice, {
      deviceId: alicePhone,
      assets: [
        { localId: 'a', sha256: sha('linked') },
        { localId: 'b', sha256: sha('unhashed') },
      ],
    });
    expect(result.have).toEqual([]);
    expect(result.missing).toEqual(['a', 'b']);
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
    const target = await service.backupTarget(alice, alicePhone, '2026-11-03T10:00:00+07:00');
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
    const [state, ...others] = service.state(alice);
    expect(others).toEqual([]);
    expect(state).toMatchObject({
      backedUp: 1,
      pending: 0,
      uploading: 2,
      failed: 1,
      bytesLeft: 1100,
      lastBackupAt: NOW,
      targetFolder: `${CAMERA_ROLL}/Alice`,
    });
    expect(state?.device.name).toBe('Alice Pixel');
  });

  it('shows a member only their own phones, owner included', () => {
    service.registerDevice(alice, register(alicePhone));
    service.registerDevice(bob, register(bobPhone));
    expect(service.state(alice).map((entry) => entry.device.deviceId)).toEqual([alicePhone]);
    expect(service.state(bob).map((entry) => entry.device.deviceId)).toEqual([bobPhone]);
  });

  it('reports no backup yet as an empty phone, not as a made-up time', () => {
    service.registerDevice(alice, register(alicePhone));
    expect(service.state(alice)[0]).toMatchObject({
      backedUp: 0,
      uploading: 0,
      bytesLeft: 0,
      lastBackupAt: null,
    });
  });
});

describe('target folders', () => {
  beforeEach(() => {
    service.registerDevice(alice, register(alicePhone));
  });

  it('makes Camera roll/<person>/<yyyy>/<yyyy-mm> on disk and in the index, parents first', async () => {
    const target = await service.backupTarget(alice, alicePhone, '2026-11-03T10:00:00+07:00');
    expect(target.path).toBe('Camera roll/Alice/2026/2026-11');
    const chain = ['Camera roll', 'Camera roll/Alice', 'Camera roll/Alice/2026', target.path];
    const items = chain.map((path) => store.driveItems.byPath(aliceRoot, path));
    expect(items.map((item) => item?.kind)).toEqual(['folder', 'folder', 'folder', 'folder']);
    expect(items.map((item) => item?.parentId)).toEqual([
      null,
      items[0]?.id,
      items[1]?.id,
      items[2]?.id,
    ]);
    expect(items[3]?.id).toBe(target.folderId);
    expect(await readdir(join(base, 'alice', 'Camera roll', 'Alice', '2026'))).toEqual(['2026-11']);
  });

  it('takes the month from the time on the phone, not from the hub clock', async () => {
    const late = await service.backupTarget(alice, alicePhone, '2025-12-31T23:30:00-08:00');
    expect(late.path).toBe('Camera roll/Alice/2025/2025-12');
  });

  it('gives the same folder to repeated and simultaneous requests', async () => {
    const results = await Promise.all([
      service.backupTarget(alice, alicePhone, '2026-01-05T09:00:00+00:00'),
      service.backupTarget(alice, alicePhone, '2026-01-20T09:00:00+00:00'),
      service.backupTarget(alice, alicePhone, '2026-02-01T09:00:00+00:00'),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[2].path).toBe('Camera roll/Alice/2026/2026-02');
    const roll = store.driveItems.children(aliceRoot, null, null, 50);
    expect(roll.entries.filter((entry) => entry.item.name === CAMERA_ROLL)).toHaveLength(1);
    expect(await readdir(join(base, 'alice', 'Camera roll', 'Alice', '2026'))).toEqual([
      '2026-01',
      '2026-02',
    ]);
  });

  it('adopts a folder that exists on disk but is not indexed yet', async () => {
    await mkdir(join(base, 'alice', 'Camera roll', 'Alice'), { recursive: true });
    const target = await service.backupTarget(alice, alicePhone, '2026-03-01T00:00:00+00:00');
    expect(target.path).toBe('Camera roll/Alice/2026/2026-03');
    expect(store.driveItems.byPath(aliceRoot, 'Camera roll/Alice')?.kind).toBe('folder');
  });

  it('refuses when a file sits where a folder must go', async () => {
    addItem(aliceRoot, CAMERA_ROLL, sha('x'), alice);
    await writeFile(join(base, 'alice', CAMERA_ROLL), 'x');
    await expect(
      service.backupTarget(alice, alicePhone, '2026-03-01T00:00:00+00:00'),
    ).rejects.toThrow(/in the way/);
  });

  it('keeps a person name with slashes inside one folder', async () => {
    const slashed = new ProfilesRepository(context).create({ name: 'A/B' }).id;
    await addRoot('slashed', 'person', slashed);
    const target = await service.manualTarget(slashed);
    expect(target.path).toBe(`${UPLOADS}/A-B`);
  });

  it('makes Uploads/<person> for manual uploads and never the camera roll', async () => {
    const target = await service.manualTarget(alice);
    expect(target.path).toBe('Uploads/Alice');
    expect(store.driveItems.byPath(aliceRoot, CAMERA_ROLL)).toBeUndefined();
    expect(await service.manualTarget(alice)).toEqual(target);
  });

  it('puts each person in their own root and refuses a phone that is not theirs', async () => {
    service.registerDevice(bob, register(bobPhone));
    const mine = await service.backupTarget(bob, bobPhone, '2026-03-01T00:00:00+00:00');
    expect(store.driveItems.byPath(bobRoot, mine.path)?.id).toBe(mine.folderId);
    expect(store.driveItems.byPath(aliceRoot, mine.path)).toBeUndefined();
    await expect(
      service.backupTarget(alice, bobPhone, '2026-03-01T00:00:00+00:00'),
    ).rejects.toThrow(/not registered/);
  });

  it('says so when the person has no library folder yet', async () => {
    const lone = new ProfilesRepository(context).create({ name: 'Lone' }).id;
    await expect(service.manualTarget(lone)).rejects.toThrow(/no library folder/);
  });
});

describe('routes', () => {
  let opened: TestStore;

  beforeEach(async () => {
    opened = await testStore();
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
    expect(own).toHaveLength(1);
    expect(await bound.readBackupState.run(caller(bob), raw(undefined), log)).toEqual([]);
  });

  it('resolves backup and manual upload targets through one endpoint', async () => {
    service.registerDevice(alice, register(alicePhone));
    const bound = routes();
    const backup = await bound.resolvePhotoUploadTarget.run(
      caller(alice),
      raw({ kind: 'backup', deviceId: alicePhone, takenAt: '2026-05-02T10:00:00+00:00' }),
      log,
    );
    expect(PHOTO_UPLOAD_TARGET.parse(backup).path).toBe('Camera roll/Alice/2026/2026-05');
    const manual = await bound.resolvePhotoUploadTarget.run(
      caller(alice),
      raw({ kind: 'manual' }),
      log,
    );
    expect(PHOTO_UPLOAD_TARGET.parse(manual).path).toBe('Uploads/Alice');
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
    return store.driveItems.byId(item.id);
  }

  it('removes retained Photos membership only when the trashed backup is permanently purged', async () => {
    service.registerDevice(alice, register(alicePhone));
    const item = datedItem('purge.jpg', sha('purge'));
    const root = physicalRoot(store.driveRoots.byId(aliceRoot));
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
    const reader = new TimelineReader(context);
    const actor = { profileId: alice, owner: false };
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
      new TimelineReader(context).page({ profileId: alice, owner: true }, '2026-02', {
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
