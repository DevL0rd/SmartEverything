import { API_ENDPOINTS, DRIVE_FEED_OPS, type DriveRoot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRIVE_PAGE_SIZE, DriveReadService, type DriveActor } from '../../src/drive/service-read';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const OWNER_ROOT = '0d000000-0000-4000-8000-000000000002';
const MEMBER_ROOT = '0d000000-0000-4000-8000-000000000003';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000004';
const FOLDER = '0d000000-0000-4000-8000-0000000000f1';
const FILE = '0d000000-0000-4000-8000-0000000000f2';
const OTHER_FILE = '0d000000-0000-4000-8000-0000000000f3';
const NESTED = '0d000000-0000-4000-8000-0000000000f4';

let opened: TestStore;
let service: DriveReadService;
let ownerProfile: string;
let memberProfile: string;
let otherProfile: string;

const health = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

function managed(id: string, label: string, owner: string | null): DriveRoot {
  return {
    id,
    kind: 'managed',
    label,
    scope: owner === null ? 'home' : 'person',
    ownerProfileId: owner,
    path: `/srv/${label}`,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: `index-${label}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health,
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

const COMMON = {
  modifiedAt: NOW,
  addedAt: NOW,
  starred: false,
  outside: false,
  remoteId: null,
  remoteRev: null,
} as const;

function folder(id: string, rootId: string, name: string, parentId: string | null): void {
  opened.store.driveItems.write({
    item: {
      ...COMMON,
      id,
      rootId,
      parentId,
      relPath: name,
      name,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
      addedByProfileId: null,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

function document(id: string, rootId: string, name: string, parentId: string | null): void {
  opened.store.driveItems.write({
    item: {
      ...COMMON,
      id,
      rootId,
      parentId,
      relPath: name,
      name,
      kind: 'document',
      mime: 'text/plain',
      bytes: 10,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      addedByProfileId: ownerProfile,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

const asOwner = (): DriveActor => ({ profileId: ownerProfile, owner: true });
const asMember = (): DriveActor => ({ profileId: memberProfile, owner: false });

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  otherProfile = store.profiles.create({ name: 'Ida' }).id;
  store.driveRoots.insert(managed(HOME_ROOT, 'Shared', null));
  store.driveRoots.insert(managed(OWNER_ROOT, 'Owner', ownerProfile));
  store.driveRoots.insert(managed(MEMBER_ROOT, 'Robin', memberProfile));
  store.driveRoots.insert(managed(OTHER_ROOT, 'Ida', otherProfile));
  folder(FOLDER, HOME_ROOT, 'Saved', null);
  document(FILE, HOME_ROOT, 'readme.txt', null);
  document(NESTED, HOME_ROOT, 'inside.txt', FOLDER);
  document(OTHER_FILE, OTHER_ROOT, 'private.txt', null);
  service = new DriveReadService(store);
});

afterEach(async () => {
  await opened.close();
});

describe('global Drive activity', () => {
  function append(itemId: string, rootId: string, rev: number): void {
    opened.store.driveFeed.append({
      rootId,
      itemId,
      rev,
      op: 'update',
      actorProfileId: ownerProfile,
      via: 'app',
      deviceId: null,
    });
  }

  it('returns all operation kinds with file metadata through the strict endpoint contract', () => {
    for (const [index, op] of DRIVE_FEED_OPS.entries()) {
      opened.store.driveFeed.append({
        rootId: HOME_ROOT,
        itemId: FILE,
        rev: index + 1,
        op,
        actorProfileId: ownerProfile,
        via: 'app',
        deviceId: null,
      });
    }
    const page = service.readActivity(asMember(), { from: '2026-10-01T00:00:00Z' });
    expect(API_ENDPOINTS.listDriveActivity.response.parse(page)).toEqual(page);
    expect(page.items.map((entry) => entry.row.op)).toEqual([...DRIVE_FEED_OPS].reverse());
    expect(page.items[0]?.item).toEqual({
      kind: 'document',
      name: 'readme.txt',
      parentId: null,
      relPath: 'readme.txt',
    });
    expect(API_ENDPOINTS.listDriveActivity.query.safeParse({ from: 'yesterday' }).success).toBe(
      false,
    );
    expect(
      API_ENDPOINTS.listDriveActivity.query.safeParse({ from: '2026-10-01T00:00:00Z', extra: true })
        .success,
    ).toBe(false);
  });

  it('filters visibility before pagination and pages without repeating or losing rows', () => {
    for (let rev = 1; rev <= DRIVE_PAGE_SIZE + 2; rev += 1) {
      append(FILE, HOME_ROOT, rev);
      append(OTHER_FILE, OTHER_ROOT, rev);
    }
    const first = service.readActivity(asMember(), { from: '2026-10-01T00:00:00Z' });
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    expect(first.items.every((entry) => entry.row.rootId === HOME_ROOT)).toBe(true);
    if (first.next === null) throw new Error('The first activity page must have a cursor.');
    const second = service.readActivity(asMember(), {
      from: '2026-10-01T00:00:00Z',
      cursor: first.next,
    });
    expect(second.items).toHaveLength(2);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map((entry) => entry.row.seq)).size).toBe(
      DRIVE_PAGE_SIZE + 2,
    );
    expect(
      service
        .readActivity(asOwner(), { from: '2026-10-01T00:00:00Z' })
        .items.some((entry) => entry.row.rootId === OTHER_ROOT),
    ).toBe(true);
  });

  it('preserves records after their file metadata is removed', () => {
    append(FILE, HOME_ROOT, 1);
    opened.store.driveItems.remove(FILE);
    const page = service.readActivity(asMember(), { from: '2026-10-01T00:00:00Z' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.row.itemId).toBe(FILE);
    expect(page.items[0]?.item).toBeNull();
    expect(API_ENDPOINTS.listDriveActivity.response.parse(page)).toEqual(page);
  });

  it('filters the requested date and rejects a malformed cursor', () => {
    append(FILE, HOME_ROOT, 1);
    expect(service.readActivity(asMember(), { from: '2026-10-09T00:00:00Z' }).items).toEqual([]);
    expect(
      service.readActivity(asMember(), { from: '2026-10-08T12:00:00+02:00' }).items,
    ).toHaveLength(1);
    expect(() =>
      service.readActivity(asMember(), { from: '2026-10-01T00:00:00Z', cursor: 'abc' }),
    ).toThrow(/cursor/);
  });
});
