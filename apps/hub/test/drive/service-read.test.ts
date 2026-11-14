import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { DRIVE_PAGE_SIZE, DriveReadService } from '../../src/drive/service-read';
import { readDriveSettings, updateDriveSettings } from '../../src/drive/settings';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

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

const COMMON = {
  modifiedAt: NOW,
  addedAt: NOW,
  starred: false,
  shared: false,
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

const asOwner = (): DriveActor => ({ profileId: ownerProfile });
const asMember = (): DriveActor => ({ profileId: memberProfile });

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  otherProfile = store.profiles.create({ name: 'Ida' }).id;
  store.driveRoots.insert(sharedDriveRoot(HOME_ROOT));
  store.driveRoots.insert(personalDriveRoot(OWNER_ROOT, ownerProfile));
  store.driveRoots.insert(personalDriveRoot(MEMBER_ROOT, memberProfile));
  store.driveRoots.insert(personalDriveRoot(OTHER_ROOT, otherProfile));
  folder(FOLDER, HOME_ROOT, 'Saved', null);
  document(FILE, HOME_ROOT, 'readme.txt', null);
  document(NESTED, HOME_ROOT, 'inside.txt', FOLDER);
  document(OTHER_FILE, OTHER_ROOT, 'private.txt', null);
  service = new DriveReadService(store);
});

afterEach(async () => {
  await opened.close();
});

describe('roots and items by scope', () => {
  it('shows the hub owner their own drive and the Shared Drive only, without any path', () => {
    const roots = service.listRoots(asOwner());
    expect(roots.map((root) => root.id).sort()).toEqual([HOME_ROOT, OWNER_ROOT].sort());
    for (const root of roots) expect(root).not.toHaveProperty('path');
  });

  it('shows a member their own drive and the Shared Drive only', () => {
    expect(
      service
        .listRoots(asMember())
        .map((root) => root.id)
        .sort(),
    ).toEqual([HOME_ROOT, MEMBER_ROOT].sort());
  });

  it('refuses anyone, the hub owner included, another person’s drive, folder and item', () => {
    for (const actor of [asMember(), asOwner()]) {
      expect(() => service.browseFolder(actor, { rootId: OTHER_ROOT })).toThrow(/no such/);
      expect(() => service.readItem(actor, OTHER_FILE)).toThrow(/no such/);
      expect(() => service.rootFor(actor, OTHER_ROOT)).toThrow(/no such/);
    }
    expect(service.readItem(asMember(), FILE).id).toBe(FILE);
    expect(service.rootFor(asOwner(), OWNER_ROOT).path).toContain(ownerProfile);
  });

  it('refuses an unknown item', () => {
    expect(() => service.readItem(asOwner(), '0d000000-0000-4000-8000-0000000000aa')).toThrow(
      /no such/,
    );
  });
});

describe('browsing a folder', () => {
  it('lists the top of a root and then a folder inside it', () => {
    const top = service.browseFolder(asMember(), { rootId: HOME_ROOT });
    expect(top.folder).toBeNull();
    expect(top.items.map((item) => item.name)).toEqual(['Saved', 'readme.txt']);
    expect(top.next).toBeNull();
    const inside = service.browseFolder(asMember(), { rootId: HOME_ROOT, folderId: FOLDER });
    expect(inside.folder?.id).toBe(FOLDER);
    expect(inside.items.map((item) => item.id)).toEqual([NESTED]);
  });

  it('refuses a folder of another root and a file used as a folder', () => {
    expect(() => service.browseFolder(asOwner(), { rootId: OWNER_ROOT, folderId: FOLDER })).toThrow(
      /no such folder/,
    );
    expect(() => service.browseFolder(asOwner(), { rootId: HOME_ROOT, folderId: FILE })).toThrow(
      /no such folder/,
    );
  });

  it('refuses a sort the item store cannot page', () => {
    expect(() =>
      service.browseFolder(asOwner(), {
        rootId: HOME_ROOT,
        sortField: 'bytes',
        sortDirection: 'desc',
      }),
    ).toThrow(/by name/);
    expect(
      service.browseFolder(asOwner(), {
        rootId: HOME_ROOT,
        sortField: 'name',
        sortDirection: 'asc',
      }).items,
    ).toHaveLength(2);
  });

  it('pages a large folder by cursor without losing or repeating a name', () => {
    const count = DRIVE_PAGE_SIZE + 5;
    for (let index = 0; index < count; index += 1) {
      const id = `0d000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`;
      document(id, MEMBER_ROOT, `file-${String(index).padStart(4, '0')}.txt`, null);
    }
    const first = service.browseFolder(asMember(), { rootId: MEMBER_ROOT });
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    expect(first.next).not.toBeNull();
    const second = service.browseFolder(asMember(), {
      rootId: MEMBER_ROOT,
      cursor: first.next ?? '',
    });
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeNull();
    const names = [...first.items, ...second.items].map((item) => item.name);
    expect(new Set(names).size).toBe(count);
  });
});

describe('albums', () => {
  it('shows a member home albums and their own only', () => {
    const { driveAlbums } = opened.store;
    driveAlbums.insert({
      id: '0d000000-0000-4000-8000-0000000000b1',
      kind: 'manual',
      surface: 'photos',
      title: 'Holidays',
      scope: 'home',
      ownerProfileId: null,
      coverItemId: null,
    });
    driveAlbums.insert({
      id: '0d000000-0000-4000-8000-0000000000b2',
      kind: 'manual',
      surface: 'photos',
      title: 'Mine',
      scope: 'person',
      ownerProfileId: memberProfile,
      coverItemId: null,
    });
    driveAlbums.insert({
      id: '0d000000-0000-4000-8000-0000000000b3',
      kind: 'manual',
      surface: 'photos',
      title: 'Theirs',
      scope: 'person',
      ownerProfileId: otherProfile,
      coverItemId: null,
    });
    expect(service.listAlbums(asMember(), 'photos').map((album) => album.title)).toEqual([
      'Holidays',
      'Mine',
    ]);
    expect(service.listAlbums(asOwner(), 'photos').map((album) => album.title)).toEqual([
      'Holidays',
    ]);
  });
});

describe('recent files', () => {
  function appended(itemId: string, rootId: string, op: 'create' | 'update', rev: number): void {
    opened.store.driveFeed.append({
      rootId,
      itemId,
      op,
      rev,
      actorProfileId: ownerProfile,
      via: 'app',
      deviceId: null,
    });
  }

  beforeEach(() => {
    appended(FILE, HOME_ROOT, 'create', 1);
    appended(OTHER_FILE, OTHER_ROOT, 'create', 1);
    appended(FILE, HOME_ROOT, 'update', 2);
  });

  it('answers added, changed and everything, newest first', () => {
    const added = service.readRecent(asOwner(), { filter: 'added' });
    expect(added.entries.map((entry) => [entry.kind, entry.item.id])).toEqual([['added', FILE]]);
    const changed = service.readRecent(asOwner(), { filter: 'changed' });
    expect(changed.entries.map((entry) => entry.kind)).toEqual(['changed']);
    expect(service.readRecent(asOwner(), { filter: 'everything' }).entries).toHaveLength(2);
  });

  it('hides other members’ files from a member', () => {
    const everything = service.readRecent(asMember(), { filter: 'everything' });
    expect(everything.entries.map((entry) => entry.item.id)).toEqual([FILE, FILE]);
  });

  it('refuses a cursor it did not give out and the unavailable opened filter', () => {
    expect(() => service.readRecent(asOwner(), { filter: 'added', cursor: 'abc' })).toThrow(
      /cursor/,
    );
    expect(() => service.readRecent(asOwner(), { filter: 'opened' })).toThrow(/opened/);
  });
});

describe('drive settings', () => {
  it('reads the seeded settings and changes only what the update names', () => {
    const before = readDriveSettings(opened.store);
    const after = updateDriveSettings(opened.store, { membersMayShare: !before.membersMayShare });
    expect(after).toEqual({ ...before, membersMayShare: !before.membersMayShare });
    expect(readDriveSettings(opened.store)).toEqual(after);
  });

  it('refuses a value the schema does not allow', () => {
    expect(() => updateDriveSettings(opened.store, { uploadExpiryDays: 0 })).toThrow();
  });
});
