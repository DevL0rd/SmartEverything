import type { DriveRoot, DriveScrubState } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DriveFreeSpaceError,
  DriveQuotaExceededError,
  DriveQuotaMeter,
  checkDriveQuota,
  checkDriveWrite,
  type DriveWriteGuard,
} from '../../src/drive/quotas';
import { DriveHealthReader, watcherState, type DriveHealthSources } from '../../src/drive/health';
import { purgeForecast, readDriveUsage } from '../../src/drive/usage';
import { DriveBackupsRepository } from '../../src/store/repositories/drive-backups';
import type { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import {
  DriveQuotasRepository,
  type DriveQuotaStatus,
} from '../../src/store/repositories/drive-quotas';
import type { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveScrubRepository } from '../../src/store/repositories/drive-scrub';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_ROOT = '0d000000-0000-4000-8000-000000000002';
const SAM_ROOT = '0d000000-0000-4000-8000-000000000003';
const SHA = 'b'.repeat(64);

let fixture: DriveFixture;
let quotas: DriveQuotasRepository;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let robin: string;
let sam: string;
let counter = 0;

const IDLE: DriveScrubState = { state: 'idle', lastFinishedAt: null, corrupt: 0 };

function file(
  rootId: string,
  addedBy: string | null,
  bytes: number,
  sha256: string | null = null,
): string {
  counter += 1;
  const id = `0e000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  items.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: `f${String(counter)}`,
      name: `f${String(counter)}`,
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: addedBy,
      remoteId: null,
      remoteRev: null,
      kind: 'document',
      mime: 'text/plain',
      bytes,
      sha256,
      integrity: 'unknown',
      thumb: { state: 'none' },
    },
    identity: { dev: '1', ino: id },
  });
  return id;
}

function version(itemId: string, rootId: string, addedBy: string | null, bytes: number): void {
  fixture.database
    .prepare(
      `insert into drive_versions (id, root_id, item_id, rev, sha256, bytes, at, purge_at, via, added_by_profile_id)
        values (?, ?, ?, 1, ?, ?, ?, ?, 'app', ?)`,
    )
    .run(
      `ver-${itemId}`,
      rootId,
      itemId,
      SHA,
      bytes,
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      addedBy,
    );
}

function trash(itemId: string, rootId: string, addedBy: string | null, bytes: number): void {
  fixture.database
    .prepare(
      `insert into drive_trash (item_id, root_id, name, original_rel_path, trash_rel_path, is_folder,
        bytes, deleted_at, purge_at, added_by_profile_id) values (?, ?, 'x', 'x', 'x', 0, ?, ?, ?, ?)`,
    )
    .run(itemId, rootId, bytes, NOW, '2027-01-01T00:00:00.000Z', addedBy);
}

function addRoot(id: string, fields: Partial<DriveRoot> = {}): void {
  fixture.addDrive(driveRoot(id, { versions: true, ...fields }), `/srv/${id.slice(-4)}`);
}

beforeEach(() => {
  counter = 0;
  fixture = openDriveFixture();
  quotas = new DriveQuotasRepository(fixture.context);
  roots = fixture.roots;
  items = fixture.items;
  const profiles = new ProfilesRepository(fixture.context);
  robin = profiles.create({ name: 'Robin' }).id;
  sam = profiles.create({ name: 'Sam' }).id;
  addRoot(HOME);
  addRoot(ROBIN_ROOT, { scope: 'person', ownerProfileId: robin });
  addRoot(SAM_ROOT, { scope: 'person', ownerProfileId: sam });
});

afterEach(() => {
  fixture.database.close();
});

describe('usage per member', () => {
  it('counts rows by adder in every root, home included, across live, versions and trash', () => {
    const a = file(HOME, robin, 100);
    file(ROBIN_ROOT, robin, 10);
    file(SAM_ROOT, sam, 7);
    file(HOME, null, 3);
    version(a, HOME, robin, 40);
    trash('gone-robin', HOME, robin, 5);
    const byProfile = new Map(
      readDriveUsage(quotas, { role: 'owner' }).map((u) => [u.profileId, u]),
    );
    expect(byProfile.get(robin)).toMatchObject({ live: 110, versions: 40, trash: 5 });
    expect(byProfile.get(sam)).toMatchObject({ live: 7, versions: 0, trash: 0 });
    expect(byProfile.get(null)).toMatchObject({ live: 3 });
  });

  it('shows a member only their own usage and zeros when they have none', () => {
    file(HOME, robin, 100);
    expect(readDriveUsage(quotas, { role: 'member', profileId: robin })).toEqual([
      { profileId: robin, items: 1, folders: 0, live: 100, versions: 0, trash: 0 },
    ]);
    expect(readDriveUsage(quotas, { role: 'member', profileId: sam })).toEqual([
      { profileId: sam, items: 0, folders: 0, live: 0, versions: 0, trash: 0 },
    ]);
  });
});

describe('quota check', () => {
  const status = (profileId: string): DriveQuotaStatus => quotas.status(profileId);

  it('allows any write when no quota is set or the writer is unattributed', () => {
    file(HOME, robin, 1_000_000);
    expect(() => {
      checkDriveQuota(status, { profileId: robin, addBytes: 1e12, releasedBytes: 0 });
    }).not.toThrow();
    expect(() => {
      checkDriveQuota(status, { profileId: null, addBytes: 1e12, releasedBytes: 0 });
    }).not.toThrow();
  });

  it('refuses a write that would cross the limit and counts versions and trash as used', () => {
    const a = file(HOME, robin, 50);
    version(a, HOME, robin, 30);
    trash('gone', HOME, robin, 10);
    quotas.set(robin, 100);
    expect(() => {
      checkDriveQuota(status, { profileId: robin, addBytes: 10, releasedBytes: 0 });
    }).not.toThrow();
    const attempt = (): void => {
      checkDriveQuota(status, { profileId: robin, addBytes: 11, releasedBytes: 0 });
    };
    expect(attempt).toThrow(DriveQuotaExceededError);
    expect(attempt).toThrow(/Nothing was removed/);
  });

  it('never purges: the trash and versions stay after a refusal', () => {
    const a = file(HOME, robin, 50);
    version(a, HOME, robin, 30);
    trash('gone', HOME, robin, 10);
    quotas.set(robin, 90);
    expect(() => {
      checkDriveQuota(status, { profileId: robin, addBytes: 5, releasedBytes: 0 });
    }).toThrow(DriveQuotaExceededError);
    expect(quotas.usage(robin)).toMatchObject({ live: 50, versions: 30, trash: 10 });
  });

  it('lets a replacement that frees as much as it adds through even at the limit', () => {
    file(HOME, robin, 100);
    quotas.set(robin, 100);
    expect(() => {
      checkDriveQuota(status, { profileId: robin, addBytes: 60, releasedBytes: 60 });
    }).not.toThrow();
    expect(() => {
      checkDriveQuota(status, { profileId: robin, addBytes: 61, releasedBytes: 60 });
    }).toThrow(DriveQuotaExceededError);
  });

  it('stops a stream of unknown length at the chunk that crosses the limit', () => {
    file(HOME, robin, 40);
    quotas.set(robin, 100);
    const meter = new DriveQuotaMeter(status, robin);
    meter.admit(30);
    meter.admit(30);
    expect(() => {
      meter.admit(1);
    }).toThrow(DriveQuotaExceededError);
  });
});

describe('free space check', () => {
  const guard = (freeBytes: number): DriveWriteGuard => ({
    status: (profileId: string) => quotas.status(profileId),
    space: () => Promise.resolve({ totalBytes: 1000, freeBytes }),
  });

  it('refuses a known length larger than the free space and allows an exact fit', async () => {
    const request = { profileId: null, path: '/srv/0001', addBytes: 500, releasedBytes: 0 };
    await expect(checkDriveWrite(guard(500), request)).resolves.toBeUndefined();
    await expect(checkDriveWrite(guard(499), request)).rejects.toBeInstanceOf(DriveFreeSpaceError);
  });

  it('checks the quota before the disk', async () => {
    quotas.set(robin, 10);
    const request = { profileId: robin, path: '/srv/0001', addBytes: 20, releasedBytes: 0 };
    await expect(checkDriveWrite(guard(5), request)).rejects.toBeInstanceOf(
      DriveQuotaExceededError,
    );
  });
});

describe('purge forecast', () => {
  it('covers twelve months from the current one with zero months filled in', () => {
    const forecast = purgeForecast(
      [
        { month: '2026-11', trashBytes: 5, versionBytes: 0 },
        { month: '2027-02', trashBytes: 0, versionBytes: 9 },
        { month: '2027-12', trashBytes: 4, versionBytes: 4 },
      ],
      '2026-11',
    );
    expect(forecast).toHaveLength(12);
    expect(forecast[0]).toEqual({ month: '2026-11', trashBytes: 5, versionBytes: 0 });
    expect(forecast[2]).toEqual({ month: '2027-01', trashBytes: 0, versionBytes: 0 });
    expect(forecast[3]).toEqual({ month: '2027-02', trashBytes: 0, versionBytes: 9 });
    expect(forecast[11]).toEqual({ month: '2027-10', trashBytes: 0, versionBytes: 0 });
  });
});

describe('library health', () => {
  const watching = { watching: true, unreadable: [], problem: null };

  function sources(fields: Partial<DriveHealthSources> = {}): DriveHealthSources {
    const backups = new DriveBackupsRepository(fixture.context);
    return {
      roots: () => roots.list(),
      watcher: () => watching,
      scrub: () => IDLE,
      backup: () => backups.status(),
      space: () => Promise.resolve({ totalBytes: 1000, freeBytes: 300, fsType: 'ext4' }),
      ...fields,
    };
  }

  it('reports hashed and verified shares, corrupt files, backup and the data folder space', async () => {
    const hashed = file(HOME, robin, 10, SHA);
    const second = file(HOME, robin, 10, SHA);
    file(HOME, robin, 10);
    file(HOME, robin, 10);
    const scrub = new DriveScrubRepository(fixture.context);
    scrub.record(HOME, hashed, 'ok');
    scrub.record(HOME, second, 'corrupt');
    new DriveBackupsRepository(fixture.context).record({ reporter: 'borg', bytes: 5, ok: true });
    const health = await new DriveHealthReader(fixture.context, sources()).read({
      profileId: robin,
    });
    expect(health).toMatchObject({
      hashedShare: 0.5,
      verifiedShare: 0.5,
      corrupt: 1,
      rootsTotal: 2,
      rootsUnavailable: 0,
      watcher: 'watching',
      space: { totalBytes: 1000, freeBytes: 300, fsType: 'ext4' },
    });
    expect(health.backup.lastOkAt).toBe(NOW);
  });

  it('counts unresponsive and failed drives among the drives the person can open', async () => {
    roots.update(SAM_ROOT, { state: 'error' });
    roots.update(ROBIN_ROOT, { state: 'unresponsive' });
    roots.update(HOME, { state: 'error' });
    const health = await new DriveHealthReader(fixture.context, sources()).read({
      profileId: robin,
    });
    expect(health.rootsTotal).toBe(2);
    expect(health.rootsUnavailable).toBe(2);
  });

  it('limits health to the drives the person can open, the owner included', async () => {
    file(SAM_ROOT, sam, 10, SHA);
    new DriveScrubRepository(fixture.context).record(
      SAM_ROOT,
      file(SAM_ROOT, sam, 10, SHA),
      'corrupt',
    );
    const health = await new DriveHealthReader(fixture.context, sources()).read({
      profileId: robin,
    });
    expect(health).toMatchObject({ rootsTotal: 2, corrupt: 0, hashedShare: 0 });
  });

  it('passes the scrub state through unchanged', async () => {
    const running: DriveScrubState = {
      state: 'running',
      startedAt: NOW,
      checked: 2,
      total: 5,
      corrupt: 1,
    };
    const health = await new DriveHealthReader(
      fixture.context,
      sources({ scrub: () => running }),
    ).read({ profileId: robin });
    expect(health.scrub).toEqual(running);
  });

  it('derives the watcher state from the roots and their watches', () => {
    const all = roots.list();
    expect(watcherState(all, () => watching)).toBe('watching');
    expect(watcherState(all, () => ({ watching: false, unreadable: [], problem: 'limit' }))).toBe(
      'unavailable',
    );
    roots.update(HOME, { state: 'scanning' });
    expect(watcherState(roots.list(), () => watching)).toBe('reconciling');
  });
});
