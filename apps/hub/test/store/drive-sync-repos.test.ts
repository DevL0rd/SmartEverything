import type { DrivePlacementStatus } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreContext, StoreNotFoundError } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  driveRepositories,
  type DriveRepositories,
} from '../../src/store/repositories/areas/drive';
import { blockHashAt, packBlockHashes } from '../../src/store/repositories/drive-blocks';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const DEVICE = '0c000000-0000-4000-8000-000000000001';
const SHA = 'a'.repeat(64);

let database: DatabaseSync;
let context: StoreContext;
let repositories: DriveRepositories;
let clock = NOW;
let robin: string;

function id(index: number): string {
  return `0f000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function addItem(index: number, sha256: string | null): string {
  repositories.driveItems.write({
    item: {
      id: id(index),
      rootId: ROOT,
      parentId: null,
      relPath: `f${String(index)}.txt`,
      name: `f${String(index)}.txt`,
      kind: 'document',
      mime: 'text/plain',
      bytes: 10,
      sha256,
      integrity: 'unknown',
      thumb: { state: 'none' },
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
    },
    identity: { dev: '1', ino: String(index) },
  });
  return id(index);
}

beforeEach(() => {
  clock = NOW;
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(clock));
  migrate(new Sql(database), MIGRATIONS, NOW, log);
  repositories = driveRepositories(context, drivePathOf);
  robin = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
        values (?, 'xiaomi', 'e1', 'light', 'Lamp', 'm', 'v', ?, ?)`,
    )
    .run(DEVICE, NOW, NOW);
  repositories.driveRoots.insert(sharedDriveRoot(ROOT));
});

afterEach(() => {
  database.close();
});

describe('scrub', () => {
  it('resumes from the last verified item and skips folders and unhashed files', () => {
    const first = addItem(1, SHA);
    const second = addItem(2, SHA);
    addItem(3, null);
    const fourth = addItem(4, SHA);
    const scrub = repositories.driveScrub;
    const startedAt = NOW;
    const batch = scrub.next(ROOT, startedAt, null, 2);
    expect(batch.map((candidate) => candidate.itemId)).toEqual([first, second]);
    clock = '2026-11-07T01:00:00.000Z';
    for (const candidate of batch) scrub.record(ROOT, candidate.itemId, 'ok');
    expect(scrub.next(ROOT, startedAt, second, 10).map((c) => c.itemId)).toEqual([fourth]);
    expect(scrub.next(ROOT, startedAt, null, 10).map((c) => c.itemId)).toEqual([fourth]);
    expect(scrub.progress(ROOT, startedAt)).toEqual({ total: 3, checked: 2, corrupt: 0 });
  });

  it('keeps the latest result per item and counts corrupt and verified files', () => {
    const first = addItem(1, SHA);
    const second = addItem(2, SHA);
    const scrub = repositories.driveScrub;
    scrub.record(ROOT, first, 'ok');
    scrub.record(ROOT, second, 'corrupt');
    expect(scrub.corrupt(ROOT)).toBe(1);
    expect(scrub.verified(ROOT)).toBe(1);
    clock = '2026-11-08T00:00:00.000Z';
    scrub.record(ROOT, second, 'ok');
    expect(scrub.find(second)).toMatchObject({ result: 'ok', verifiedAt: clock });
    expect(scrub.corrupt(ROOT)).toBe(0);
    expect(scrub.verified(ROOT)).toBe(2);
    expect(scrub.lastVerifiedAt(ROOT)).toBe(clock);
  });

  it('starts a new pass for files verified before it began', () => {
    const first = addItem(1, SHA);
    repositories.driveScrub.record(ROOT, first, 'ok');
    const later = '2026-11-09T00:00:00.000Z';
    expect(repositories.driveScrub.next(ROOT, later, null, 10).map((c) => c.itemId)).toEqual([
      first,
    ]);
    expect(repositories.driveScrub.progress(ROOT, later).checked).toBe(0);
  });

  it('forgets the result with the item', () => {
    const first = addItem(1, SHA);
    repositories.driveScrub.record(ROOT, first, 'ok');
    database.prepare('delete from drive_items where id = ?').run(first);
    expect(repositories.driveScrub.find(first)).toBeUndefined();
  });

  it('refuses a result for an unknown item', () => {
    expect(() => repositories.driveScrub.record(ROOT, id(9), 'ok')).toThrow(StoreConflictError);
  });
});

describe('intents', () => {
  const commit = {
    rootId: ROOT,
    op: 'commit',
    fromPath: '.smarteverything/tmp/a',
    toPath: 'a.txt',
    versionPath: '.smarteverything/versions/x',
  } as const;

  it('stores the commit intent with its tmp, live and version paths until cleared', () => {
    const intents = repositories.driveIntents;
    const opened = intents.open(commit);
    expect(intents.find(opened.id)).toEqual({ ...commit, id: opened.id, at: NOW });
    expect(intents.forRoot(ROOT)).toHaveLength(1);
    intents.clear(opened.id);
    expect(intents.all()).toEqual([]);
  });

  it('clears inside the caller transaction and rolls back with it', () => {
    const intents = repositories.driveIntents;
    const opened = intents.open(commit);
    expect(() =>
      context.write(() => {
        intents.clear(opened.id);
        throw new Error('commit failed');
      }),
    ).toThrow('commit failed');
    expect(intents.find(opened.id)).toBeDefined();
  });

  it('lists open intents oldest first', () => {
    const intents = repositories.driveIntents;
    const first = intents.open({ ...commit, op: 'trash', versionPath: null });
    clock = '2026-11-07T00:00:01.000Z';
    const second = intents.open({ ...commit, op: 'restore', versionPath: null });
    expect(intents.all().map((intent) => intent.id)).toEqual([first.id, second.id]);
  });

  it('refuses a version path on a trash intent and clearing an unknown one', () => {
    expect(() => repositories.driveIntents.open({ ...commit, op: 'trash' })).toThrow(
      StoreConflictError,
    );
    expect(() => {
      repositories.driveIntents.clear(id(1));
    }).toThrow(StoreNotFoundError);
  });
});

describe('blocks', () => {
  const digest = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);

  it('stores packed hashes per item and revision and reads one block', () => {
    const item = addItem(1, SHA);
    const hashes = packBlockHashes([digest(1), digest(2), digest(3)]);
    repositories.driveBlocks.put({ itemId: item, rev: 1, blockSize: 4096, hashes });
    const stored = repositories.driveBlocks.find(item, 1);
    expect(stored?.blockSize).toBe(4096);
    expect(stored?.hashes).toEqual(hashes);
    expect(stored === undefined ? undefined : blockHashAt(stored, 1)).toEqual(digest(2));
    expect(stored === undefined ? undefined : blockHashAt(stored, 3)).toBeUndefined();
    expect(repositories.driveBlocks.find(item, 2)).toBeUndefined();
  });

  it('replaces a revision and drops the older ones', () => {
    const item = addItem(1, SHA);
    const blocks = repositories.driveBlocks;
    blocks.put({ itemId: item, rev: 1, blockSize: 4096, hashes: packBlockHashes([digest(1)]) });
    blocks.put({ itemId: item, rev: 2, blockSize: 4096, hashes: packBlockHashes([digest(2)]) });
    blocks.put({ itemId: item, rev: 2, blockSize: 8192, hashes: packBlockHashes([digest(3)]) });
    expect(blocks.find(item, 2)?.blockSize).toBe(8192);
    expect(blocks.removeBefore(item, 2)).toBe(1);
    expect(blocks.find(item, 1)).toBeUndefined();
    expect(blocks.find(item, 2)).toBeDefined();
  });

  it('refuses hashes that are not whole digests', () => {
    const item = addItem(1, SHA);
    expect(() =>
      repositories.driveBlocks.put({
        itemId: item,
        rev: 1,
        blockSize: 4096,
        hashes: new Uint8Array(33),
      }),
    ).toThrow();
    expect(() => packBlockHashes([new Uint8Array(31)])).toThrow(RangeError);
  });

  it('goes with the item', () => {
    const item = addItem(1, SHA);
    repositories.driveBlocks.put({
      itemId: item,
      rev: 1,
      blockSize: 4096,
      hashes: packBlockHashes([digest(1)]),
    });
    database.prepare('delete from drive_items where id = ?').run(item);
    expect(repositories.driveBlocks.find(item, 1)).toBeUndefined();
  });
});

const PLACEMENT = '0c000000-0000-4000-8000-0000000000a1';
const OTHER_PLACEMENT = '0c000000-0000-4000-8000-0000000000a2';

function status(fields: Partial<DrivePlacementStatus> = {}): DrivePlacementStatus {
  return {
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
    reportedAt: NOW,
    ...fields,
  };
}

describe('placements', () => {
  const synced = {
    id: PLACEMENT,
    deviceId: DEVICE,
    rootId: ROOT,
    folderItemId: null,
    mode: 'synced',
    localPath: '/home/robin/Drive',
    enabled: true,
    createdBy: '',
    excluded: ['Videos'],
    ignorePatterns: ['*.tmp'],
    conflictCopies: true,
    status: status(),
  } as const;

  it('stores sync settings on a synced placement and none on a mounted one', () => {
    const placements = repositories.drivePlacements;
    const created = placements.insert({ ...synced, createdBy: robin });
    expect(created).toMatchObject({
      mode: 'synced',
      folderItemId: null,
      excluded: ['Videos'],
      ignorePatterns: ['*.tmp'],
      conflictCopies: true,
    });
    const folder = addItem(1, null);
    const mounted = placements.insert({
      id: OTHER_PLACEMENT,
      deviceId: DEVICE,
      rootId: ROOT,
      folderItemId: folder,
      mode: 'mounted',
      localPath: '/mnt/folder',
      enabled: true,
      createdBy: robin,
      status: status(),
    });
    expect(mounted).not.toHaveProperty('excluded');
    expect(mounted).not.toHaveProperty('conflictCopies');
  });

  it('lets a synced placement point at one folder of the drive', () => {
    const folder = addItem(1, null);
    const created = repositories.drivePlacements.insert({
      ...synced,
      createdBy: robin,
      folderItemId: folder,
    });
    expect(created.folderItemId).toBe(folder);
    expect(repositories.drivePlacements.forFolder(folder)).toHaveLength(1);
  });

  it('refuses sync settings on a mounted placement and none on a synced one', () => {
    const placements = repositories.drivePlacements;
    expect(() => placements.insert({ ...synced, createdBy: robin, mode: 'mounted' })).toThrow(
      StoreConflictError,
    );
    expect(() =>
      placements.insert({
        id: PLACEMENT,
        deviceId: DEVICE,
        rootId: ROOT,
        folderItemId: null,
        mode: 'synced',
        localPath: '/home/robin/Drive',
        enabled: true,
        createdBy: robin,
        status: status(),
      }),
    ).toThrow(StoreConflictError);
  });

  it('keeps one whole-drive placement per computer and drive', () => {
    const placements = repositories.drivePlacements;
    placements.insert({ ...synced, createdBy: robin });
    expect(() =>
      placements.insert({ ...synced, id: OTHER_PLACEMENT, createdBy: robin, localPath: '/other' }),
    ).toThrow(StoreConflictError);
  });

  it('retargets between modes and replaces the sync settings', () => {
    const placements = repositories.drivePlacements;
    placements.insert({ ...synced, createdBy: robin });
    const mounted = placements.retarget(PLACEMENT, {
      mode: 'mounted',
      localPath: '/mnt/drive',
      enabled: true,
      readOnly: true,
    });
    expect(mounted).not.toHaveProperty('excluded');
    expect(mounted.status.readOnly).toBe(true);
    const back = placements.retarget(PLACEMENT, {
      mode: 'synced',
      localPath: '/home/robin/Drive',
      enabled: false,
      readOnly: false,
      excluded: [],
      ignorePatterns: ['*.bak'],
      conflictCopies: false,
    });
    expect(back).toMatchObject({
      enabled: false,
      excluded: [],
      ignorePatterns: ['*.bak'],
      conflictCopies: false,
    });
  });

  it('records the sync numbers the computer reports', () => {
    const placements = repositories.drivePlacements;
    placements.insert({ ...synced, createdBy: robin });
    const error = { relPath: 'a.txt', message: 'disk full', at: NOW };
    const reported = placements.writeStatus(
      PLACEMENT,
      status({
        state: 'syncing',
        needBytes: 99,
        lastSyncedAt: '2026-11-07T02:00:00.000Z',
        errors: [error],
      }),
    );
    expect(reported.status).toMatchObject({
      state: 'syncing',
      needBytes: 99,
      lastSyncedAt: '2026-11-07T02:00:00.000Z',
      errors: [error],
    });
    expect(() =>
      placements.writeStatus(
        PLACEMENT,
        status({ errors: [{ relPath: null, message: '', at: NOW }] }),
      ),
    ).toThrow();
  });

  it('goes with its drive and takes its sync operations along', () => {
    repositories.drivePlacements.insert({ ...synced, createdBy: robin });
    repositories.driveSyncOps.remember(PLACEMENT, 'op-1', { status: 'accepted' });
    database.prepare('delete from drive_roots where id = ?').run(ROOT);
    expect(repositories.drivePlacements.find(PLACEMENT)).toBeUndefined();
    expect(repositories.driveSyncOps.recall(PLACEMENT, 'op-1')).toBeUndefined();
  });
});

describe('sync operations', () => {
  beforeEach(() => {
    repositories.drivePlacements.insert({
      id: PLACEMENT,
      deviceId: DEVICE,
      rootId: ROOT,
      folderItemId: null,
      mode: 'synced',
      localPath: '/home/robin/Drive',
      enabled: true,
      createdBy: robin,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
      status: status(),
    });
    repositories.drivePlacements.insert({
      id: OTHER_PLACEMENT,
      deviceId: DEVICE,
      rootId: ROOT,
      folderItemId: addItem(1, null),
      mode: 'synced',
      localPath: '/home/robin/Folder',
      enabled: true,
      createdBy: robin,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
      status: status(),
    });
  });

  it('recalls a remembered result so a retry never applies twice', () => {
    const ops = repositories.driveSyncOps;
    expect(ops.recall(PLACEMENT, 'op-1')).toBeUndefined();
    ops.remember(PLACEMENT, 'op-1', { status: 'accepted', rev: 4 });
    expect(ops.recall(PLACEMENT, 'op-1')).toEqual({ status: 'accepted', rev: 4 });
    expect(ops.recall(OTHER_PLACEMENT, 'op-1')).toBeUndefined();
    expect(() => {
      ops.remember(PLACEMENT, 'op-1', { status: 'accepted', rev: 5 });
    }).toThrow(StoreConflictError);
    expect(ops.recall(PLACEMENT, 'op-1')).toEqual({ status: 'accepted', rev: 4 });
  });

  it('forgets only operations older than the cutoff', () => {
    const ops = repositories.driveSyncOps;
    ops.remember(PLACEMENT, 'old', { status: 'accepted' });
    clock = '2026-11-20T00:00:00.000Z';
    ops.remember(PLACEMENT, 'new', { status: 'accepted' });
    expect(ops.forgetBefore('2026-11-10T00:00:00.000Z')).toBe(1);
    expect(ops.recall(PLACEMENT, 'old')).toBeUndefined();
    expect(ops.recall(PLACEMENT, 'new')).toBeDefined();
  });
});
