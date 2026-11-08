import type { DriveRoot, DriveUpload, DriveVersion } from '@smarteverything/domain';
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
import { ClientsRepository } from '../../src/store/repositories/clients';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import type { DriveUploadOwner } from '../../src/store/repositories/drive-uploads';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const LATER = '2027-11-07T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000002';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

let database: DatabaseSync;
let context: StoreContext;
let repositories: DriveRepositories;
let robin: string;
let sam: string;
let phone: string;
let laptop: string;

function id(group: string, index: number): string {
  return `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function root(rootId: string): DriveRoot {
  return {
    id: rootId,
    kind: 'folder',
    label: rootId,
    scope: 'home',
    ownerProfileId: null,
    path: `/srv/${rootId}`,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: `index-${rootId}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: {
      hashedShare: 0,
      verifiedShare: 0,
      corrupt: 0,
      lastScrubAt: null,
      lastBackupAt: null,
    },
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

function version(index: number, fields: Partial<DriveVersion> = {}): DriveVersion {
  return {
    id: id('0e', index),
    itemId: id('0f', 1),
    rev: index,
    sha256: SHA_A,
    bytes: 100,
    at: NOW,
    purgeAt: LATER,
    actorProfileId: robin,
    via: 'app',
    deviceId: null,
    addedByProfileId: robin,
    ...fields,
  };
}

function upload(index: number, fields: Partial<DriveUpload> = {}): DriveUpload {
  return {
    id: id('1a', index),
    rootId: ROOT,
    target: { kind: 'folder', folderId: id('0f', 9) },
    name: `file${String(index)}.bin`,
    length: 1000,
    offset: 0,
    state: 'open',
    failureReason: null,
    profileId: robin,
    clientId: phone,
    nodeId: null,
    createdAt: `2026-11-0${String(index)}T00:00:00.000Z`,
    expiresAt: `2026-11-1${String(index)}T00:00:00.000Z`,
    ...fields,
  };
}

function addItem(index: number, bytes: number, adder: string | null): void {
  repositories.driveItems.write({
    item: {
      id: id('0f', index),
      rootId: ROOT,
      parentId: null,
      relPath: `f${String(index)}.txt`,
      name: `f${String(index)}.txt`,
      kind: 'document',
      mime: 'text/plain',
      bytes,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      outside: false,
      addedByProfileId: adder,
      remoteId: null,
      remoteRev: null,
    },
    identity: { dev: '1', ino: String(index) },
  });
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(new Sql(database), MIGRATIONS, NOW, log);
  repositories = driveRepositories(context);
  const profiles = new ProfilesRepository(context);
  robin = profiles.create({ name: 'Robin' }).id;
  sam = profiles.create({ name: 'Sam' }).id;
  const clients = new ClientsRepository(context);
  phone = clients.create({ name: 'Phone', platform: 'android', role: 'member', tokenHash: 'p' }).id;
  laptop = clients.create({
    name: 'Laptop',
    platform: 'desktop',
    role: 'member',
    tokenHash: 'l',
  }).id;
  repositories.driveRoots.insert(root(ROOT));
  repositories.driveRoots.insert(root(OTHER_ROOT));
});

afterEach(() => {
  database.close();
});

describe('versions', () => {
  it('lists an item newest first and pages by revision', () => {
    for (const rev of [1, 2, 3, 4, 5]) {
      repositories.driveVersions.insert(ROOT, version(rev));
    }
    const first = repositories.driveVersions.forItem(id('0f', 1), null, 2);
    const second = repositories.driveVersions.forItem(id('0f', 1), first.next, 2);
    const last = repositories.driveVersions.forItem(id('0f', 1), second.next, 2);
    expect([first, second, last].flatMap((page) => page.versions.map((v) => v.rev))).toEqual([
      5, 4, 3, 2, 1,
    ]);
    expect(last.next).toBeNull();
  });

  it('unlinks the stored bytes only when the last row holding them goes', () => {
    const versions = repositories.driveVersions;
    versions.insert(ROOT, version(1));
    versions.insert(ROOT, version(2, { itemId: id('0f', 2) }));
    versions.insert(ROOT, version(3, { sha256: SHA_B }));
    expect(versions.purge([id('0e', 1)])).toMatchObject({ unlink: [] });
    expect(versions.references(ROOT, SHA_A)).toBe(1);
    const final = versions.purge([id('0e', 2), id('0e', 3)]);
    expect(final.removed).toHaveLength(2);
    expect(final.unlink).toEqual([
      { rootId: ROOT, sha256: SHA_A },
      { rootId: ROOT, sha256: SHA_B },
    ]);
  });

  it('keeps identical bytes in another root separate', () => {
    repositories.driveVersions.insert(ROOT, version(1));
    repositories.driveVersions.insert(OTHER_ROOT, version(2, { itemId: id('0f', 2) }));
    expect(repositories.driveVersions.purge([id('0e', 1)]).unlink).toEqual([
      { rootId: ROOT, sha256: SHA_A },
    ]);
    expect(repositories.driveVersions.references(OTHER_ROOT, SHA_A)).toBe(1);
  });

  it('purges every version of an item together with its trash entry', () => {
    const versions = repositories.driveVersions;
    versions.insert(ROOT, version(1));
    versions.insert(ROOT, version(2, { sha256: SHA_B }));
    versions.insert(ROOT, version(3, { itemId: id('0f', 2) }));
    const purged = versions.purgeItem(id('0f', 1));
    expect(purged.removed.map((entry) => entry.version.rev)).toEqual([1, 2]);
    expect(purged.unlink).toEqual([{ rootId: ROOT, sha256: SHA_B }]);
    expect(versions.forItem(id('0f', 1), null, 10).versions).toEqual([]);
  });

  it('finds due versions and the soonest deadline', () => {
    const versions = repositories.driveVersions;
    expect(versions.soonestPurge()).toBeNull();
    versions.insert(ROOT, version(1, { purgeAt: '2027-02-01T00:00:00.000Z' }));
    versions.insert(ROOT, version(2, { purgeAt: '2027-01-01T00:00:00.000Z' }));
    expect(versions.soonestPurge()).toBe('2027-01-01T00:00:00.000Z');
    expect(versions.due('2027-01-15T00:00:00.000Z', 10).map((e) => e.version.rev)).toEqual([2]);
  });

  it('carries the adder and sums bytes by adder', () => {
    repositories.driveVersions.insert(ROOT, version(1, { bytes: 10 }));
    repositories.driveVersions.insert(ROOT, version(2, { bytes: 20, addedByProfileId: sam }));
    repositories.driveVersions.insert(ROOT, version(3, { bytes: 5, addedByProfileId: sam }));
    expect(repositories.driveVersions.byId(id('0e', 2)).version.addedByProfileId).toBe(sam);
    expect(
      repositories.driveVersions
        .bytesByAdder()
        .toSorted((a, b) => a.bytes - b.bytes)
        .map((row) => row.bytes),
    ).toEqual([10, 25]);
  });

  it('refuses a second version of the same revision', () => {
    repositories.driveVersions.insert(ROOT, version(1));
    expect(() => repositories.driveVersions.insert(ROOT, version(2, { rev: 1 }))).toThrow(
      StoreConflictError,
    );
  });
});

describe('shares', () => {
  let insert: ReturnType<typeof draft>;
  beforeEach(() => {
    insert = draft();
  });

  const draft = () =>
    ({
      id: id('5a', 1),
      itemId: id('0f', 1),
      tokenHash: 'c'.repeat(64),
      permission: 'download',
      expiresAt: null,
      passwordHash: null,
      createdBy: robin,
      createdAt: NOW,
    }) as const;

  it('finds a share by token hash with its password hash and flags a password', () => {
    repositories.driveShares.insert({ ...insert, passwordHash: 'scrypt$x' });
    const record = repositories.driveShares.byTokenHash(insert.tokenHash);
    expect(record?.passwordHash).toBe('scrypt$x');
    expect(record?.share).toMatchObject({ hasPassword: true, permission: 'download', opens: 0 });
    expect(repositories.driveShares.byTokenHash('d'.repeat(64))).toBeUndefined();
    expect(JSON.stringify(repositories.driveShares.byId(insert.id))).not.toContain('scrypt');
  });

  it('counts opens and downloads and keeps the first revocation time', () => {
    const shares = repositories.driveShares;
    shares.insert(insert);
    shares.recordEvent(insert.id, 'open', '2026-11-08T00:00:00.000Z');
    shares.recordEvent(insert.id, 'open', '2026-11-09T00:00:00.000Z');
    const counted = shares.recordEvent(insert.id, 'download', '2026-11-10T00:00:00.000Z');
    expect(counted).toMatchObject({
      opens: 2,
      downloads: 1,
      lastOpenedAt: '2026-11-10T00:00:00.000Z',
    });
    expect(shares.revoke(insert.id, '2026-11-11T00:00:00.000Z').revokedAt).toBe(
      '2026-11-11T00:00:00.000Z',
    );
    expect(shares.revoke(insert.id, '2026-11-12T00:00:00.000Z').revokedAt).toBe(
      '2026-11-11T00:00:00.000Z',
    );
    expect(() => shares.recordEvent(id('5a', 9), 'open', NOW)).toThrow(StoreNotFoundError);
  });

  it('lists the shares of an item newest first and refuses a repeated token', () => {
    const shares = repositories.driveShares;
    shares.insert(insert);
    shares.insert({
      ...insert,
      id: id('5a', 2),
      tokenHash: 'e'.repeat(64),
      createdAt: '2026-11-08T00:00:00.000Z',
    });
    expect(shares.forItem(insert.itemId).map((share) => share.id)).toEqual([
      id('5a', 2),
      id('5a', 1),
    ]);
    expect(() => shares.insert({ ...insert, id: id('5a', 3) })).toThrow(StoreConflictError);
  });

  it('removes the shares of permanently removed items with their events', () => {
    const shares = repositories.driveShares;
    shares.insert(insert);
    shares.recordEvent(insert.id, 'open', NOW);
    expect(shares.removeForItems([insert.itemId])).toBe(1);
    expect(shares.find(insert.id)).toBeUndefined();
    expect(database.prepare('select count(*) as n from drive_share_events').get()).toEqual({
      n: 0,
    });
  });
});

describe('uploads', () => {
  const owner = (
    profileId: string,
    clientId: string | null,
    nodeId: string | null,
  ): DriveUploadOwner => ({
    profileId,
    clientId,
    nodeId,
  });

  it('stores the creating profile and client and matches only that credential', () => {
    repositories.driveUploads.insert(upload(1));
    const uploads = repositories.driveUploads;
    expect(uploads.findOwned(id('1a', 1), owner(robin, phone, null))?.id).toBe(id('1a', 1));
    expect(uploads.findOwned(id('1a', 1), owner(sam, phone, null))).toBeUndefined();
    expect(uploads.findOwned(id('1a', 1), owner(robin, laptop, null))).toBeUndefined();
    expect(uploads.findOwned(id('1a', 1), owner(robin, null, id('2a', 1)))).toBeUndefined();
  });

  it('keeps an item target with its base revision', () => {
    const target = { kind: 'item', itemId: id('0f', 1), baseRev: 4 } as const;
    repositories.driveUploads.insert(upload(1, { target }));
    expect(repositories.driveUploads.byId(id('1a', 1)).target).toEqual(target);
  });

  it('refuses an upload with both or neither of client and node', () => {
    expect(() =>
      repositories.driveUploads.insert(upload(1, { clientId: null, nodeId: null })),
    ).toThrow();
  });

  it('advances the offset only while open and never past the length', () => {
    const uploads = repositories.driveUploads;
    uploads.insert(upload(1));
    expect(uploads.setOffset(id('1a', 1), 400).offset).toBe(400);
    expect(() => uploads.setOffset(id('1a', 1), 1001)).toThrow(StoreConflictError);
    uploads.transition(id('1a', 1), 'open', 'committing', null);
    expect(() => uploads.setOffset(id('1a', 1), 500)).toThrow(StoreConflictError);
  });

  it('moves between states only from the expected one', () => {
    const uploads = repositories.driveUploads;
    uploads.insert(upload(1));
    expect(() => uploads.transition(id('1a', 1), 'committing', 'complete', null)).toThrow(
      StoreConflictError,
    );
    uploads.transition(id('1a', 1), 'open', 'committing', null);
    expect(uploads.transition(id('1a', 1), 'committing', 'failed', 'disk full')).toMatchObject({
      state: 'failed',
      failureReason: 'disk full',
    });
    expect(() => uploads.transition(id('1a', 9), 'open', 'failed', 'x')).toThrow(
      StoreNotFoundError,
    );
  });

  it('expires open sessions at their deadline and reports the soonest one', () => {
    const uploads = repositories.driveUploads;
    expect(uploads.soonestExpiry()).toBeNull();
    uploads.insert(upload(1));
    uploads.insert(upload(2));
    uploads.insert(upload(3, { state: 'complete' }));
    expect(uploads.soonestExpiry()).toBe('2026-11-11T00:00:00.000Z');
    expect(uploads.expire('2026-11-11T12:00:00.000Z').map((entry) => entry.state)).toEqual([
      'expired',
    ]);
    expect(uploads.soonestExpiry()).toBe('2026-11-12T00:00:00.000Z');
    expect(uploads.remove(id('1a', 1)).id).toBe(id('1a', 1));
    expect(uploads.find(id('1a', 1))).toBeUndefined();
  });

  it('pages the uploads of a profile newest first', () => {
    for (const index of [1, 2, 3]) {
      repositories.driveUploads.insert(upload(index));
    }
    repositories.driveUploads.insert(upload(4, { profileId: sam }));
    const first = repositories.driveUploads.forProfile(robin, null, 2);
    const second = repositories.driveUploads.forProfile(robin, first.next, 2);
    expect([...first.uploads, ...second.uploads].map((entry) => entry.id)).toEqual([
      id('1a', 3),
      id('1a', 2),
      id('1a', 1),
    ]);
    expect(second.next).toBeNull();
  });
});

describe('quotas', () => {
  it('sets, replaces and clears a quota', () => {
    const quotas = repositories.driveQuotas;
    expect(quotas.find(robin)).toBeUndefined();
    expect(quotas.set(robin, 1000)).toEqual({ profileId: robin, bytes: 1000 });
    expect(quotas.set(robin, 2000)?.bytes).toBe(2000);
    quotas.set(sam, 5);
    expect(
      quotas
        .all()
        .map((quota) => quota.bytes)
        .toSorted((a, b) => a - b),
    ).toEqual([5, 2000]);
    expect(quotas.set(robin, null)).toBeNull();
    expect(quotas.find(robin)).toBeUndefined();
  });

  it('sums live, versions and trash by the member who added them across roots', () => {
    addItem(1, 10, robin);
    addItem(2, 20, robin);
    addItem(3, 40, sam);
    addItem(4, 80, null);
    repositories.driveVersions.insert(ROOT, version(1, { bytes: 100 }));
    repositories.driveVersions.insert(
      OTHER_ROOT,
      version(2, { bytes: 200, addedByProfileId: sam }),
    );
    repositories.driveTrash.insert({
      itemId: id('0f', 7),
      rootId: OTHER_ROOT,
      name: 'gone.txt',
      originalRelPath: 'gone.txt',
      trashRelPath: '.smarteverything/trash/7',
      isFolder: false,
      bytes: 1000,
      deletedAt: NOW,
      purgeAt: LATER,
      deletedBy: robin,
      addedByProfileId: robin,
    });
    const quotas = repositories.driveQuotas;
    expect(quotas.usage(robin)).toEqual({ profileId: robin, live: 30, versions: 100, trash: 1000 });
    expect(quotas.usage(sam)).toEqual({ profileId: sam, live: 40, versions: 200, trash: 0 });
    expect(quotas.usage(null)).toEqual({ profileId: null, live: 80, versions: 0, trash: 0 });
    expect(quotas.usageByProfile()).toHaveLength(3);
    expect(quotas.usageByProfile()).toContainEqual(quotas.usage(robin));
  });

  it('reports zero usage for a member with nothing and the quota beside it', () => {
    repositories.driveQuotas.set(sam, 500);
    expect(repositories.driveQuotas.status(sam)).toEqual({
      quota: 500,
      usage: { profileId: sam, live: 0, versions: 0, trash: 0 },
    });
    expect(repositories.driveQuotas.status(robin).quota).toBeNull();
  });
});

describe('backups', () => {
  it('has no status before a report', () => {
    expect(repositories.driveBackups.status()).toEqual({ last: null, lastOkAt: null });
  });

  it('keeps the last report and the last good one apart', () => {
    const backups = repositories.driveBackups;
    backups.record({ reporter: 'restic', bytes: 5000, ok: true });
    const failed = backups.record({ reporter: 'restic', bytes: 0, ok: false });
    expect(backups.status()).toEqual({ last: failed, lastOkAt: NOW });
    expect(backups.last()?.ok).toBe(false);
  });
});
