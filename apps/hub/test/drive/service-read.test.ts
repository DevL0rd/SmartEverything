import {
  DRIVE_SORT_FIELDS,
  type DriveItem,
  type DriveRecentEntry,
  type DriveSort,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { DriveReadService } from '../../src/drive/service-read';
import { DRIVE_PAGE_SIZE } from '../../src/drive/page-size';
import { loadDriveSettings, updateDriveSettings } from '../../src/drive/settings';
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
  it('shows the hub owner their own drive and the Shared Drive only, without any path', async () => {
    const roots = await service.listRoots(asOwner());
    expect(roots.map((root) => root.id).sort()).toEqual([HOME_ROOT, OWNER_ROOT].sort());
    for (const root of roots) expect(root).not.toHaveProperty('path');
  });

  it('shows a member their own drive and the Shared Drive only', async () => {
    expect((await service.listRoots(asMember())).map((root) => root.id).sort()).toEqual(
      [HOME_ROOT, MEMBER_ROOT].sort(),
    );
  });

  it('refuses anyone, the hub owner included, another person’s drive, folder and item', async () => {
    for (const actor of [asMember(), asOwner()]) {
      await expect(service.browseFolder(actor, { rootId: OTHER_ROOT })).rejects.toThrow(/no such/);
      await expect(service.readItem(actor, OTHER_FILE)).rejects.toThrow(/no such/);
      await expect(service.rootFor(actor, OTHER_ROOT)).rejects.toThrow(/no such/);
    }
    expect((await service.readItem(asMember(), FILE)).id).toBe(FILE);
    expect((await service.rootFor(asOwner(), OWNER_ROOT)).path).toContain(ownerProfile);
  });

  it('refuses an unknown item', async () => {
    await expect(
      service.readItem(asOwner(), '0d000000-0000-4000-8000-0000000000aa'),
    ).rejects.toThrow(/no such/);
  });
});

describe('browsing a folder', () => {
  it('lists the top of a root and then a folder inside it', async () => {
    const top = await service.browseFolder(asMember(), { rootId: HOME_ROOT });
    expect(top.folder).toBeNull();
    expect(top.items.map((item) => item.name)).toEqual(['Saved', 'readme.txt']);
    expect(top.next).toBeNull();
    const inside = await service.browseFolder(asMember(), { rootId: HOME_ROOT, folderId: FOLDER });
    expect(inside.folder?.id).toBe(FOLDER);
    expect(inside.items.map((item) => item.id)).toEqual([NESTED]);
  });

  it('refuses a folder of another root and a file used as a folder', async () => {
    await expect(
      service.browseFolder(asOwner(), { rootId: OWNER_ROOT, folderId: FOLDER }),
    ).rejects.toThrow(/no such folder/);
    await expect(
      service.browseFolder(asOwner(), { rootId: HOME_ROOT, folderId: FILE }),
    ).rejects.toThrow(/no such folder/);
  });

  const SORTED = DRIVE_PAGE_SIZE + 5;

  function sortedFolder(): void {
    for (let index = 0; index < SORTED; index += 1) {
      const id = `0d000000-0000-4000-8000-${String(2000 + index).padStart(12, '0')}`;
      const day = String(1 + (index % 11)).padStart(2, '0');
      const added = String(1 + (index % 13)).padStart(2, '0');
      opened.store.driveItems.write({
        item: {
          ...COMMON,
          id,
          rootId: MEMBER_ROOT,
          parentId: null,
          relPath: `sorted-${String(index).padStart(4, '0')}.txt`,
          name: `sorted-${String(index).padStart(4, '0')}.txt`,
          kind: 'document',
          mime: 'text/plain',
          bytes: (index * 37) % 7,
          modifiedAt: `2026-10-${day}T00:00:00.000Z`,
          addedAt: `2026-09-${added}T00:00:00.000Z`,
          sha256: null,
          integrity: 'unknown',
          thumb: { state: 'none' },
          addedByProfileId: memberProfile,
        },
        identity: { dev: '1', ino: `s${String(index)}` },
      });
      if (index % 3 === 0) {
        opened.store.driveOpens.record(
          memberProfile,
          id,
          `2026-11-${String(1 + (index % 5)).padStart(2, '0')}T00:00:00.000Z`,
        );
      }
    }
  }

  function keyOf(item: DriveItem, field: DriveSort['field']): string | number {
    switch (field) {
      case 'name':
        return item.name;
      case 'bytes':
        return item.bytes;
      case 'modifiedAt':
        return item.modifiedAt;
      case 'addedAt':
        return item.addedAt;
      case 'openedAt':
        return item.openedAt ?? '';
      case 'takenAt':
        return 'takenAt' in item ? (item.takenAt ?? '') : '';
    }
  }

  function compared(a: string | number, b: string | number): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  const ORDERS = DRIVE_SORT_FIELDS.flatMap((field) =>
    (['asc', 'desc'] as const).map((direction) => ({ field, direction })),
  );

  it.each(ORDERS)(
    'pages every item by $field $direction in order',
    async ({ field, direction }) => {
      sortedFolder();
      const pages: DriveItem[] = [];
      let cursor: string | undefined;
      let rounds = 0;
      do {
        const page = await service.browseFolder(asMember(), {
          rootId: MEMBER_ROOT,
          sortField: field,
          sortDirection: direction,
          ...(cursor === undefined ? {} : { cursor }),
        });
        pages.push(...page.items);
        cursor = page.next ?? undefined;
        rounds += 1;
      } while (cursor !== undefined);
      expect(rounds).toBe(2);
      expect(new Set(pages.map((item) => item.id)).size).toBe(SORTED);
      const sign = direction === 'asc' ? 1 : -1;
      const expected = [...pages].sort(
        (a, b) => sign * (compared(keyOf(a, field), keyOf(b, field)) || compared(a.name, b.name)),
      );
      expect(pages.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    },
  );

  it('refuses a cursor that another sort or no listing gave out', async () => {
    sortedFolder();
    const bySize = await service.browseFolder(asMember(), {
      rootId: MEMBER_ROOT,
      sortField: 'bytes',
      sortDirection: 'desc',
    });
    await expect(
      service.browseFolder(asMember(), {
        rootId: MEMBER_ROOT,
        sortField: 'modifiedAt',
        sortDirection: 'desc',
        cursor: bySize.next ?? '',
      }),
    ).rejects.toThrow(/cursor/);
    await expect(
      service.browseFolder(asMember(), { rootId: MEMBER_ROOT, cursor: 'not-a-cursor' }),
    ).rejects.toThrow(/cursor/);
  });

  it('pages a large folder by cursor without losing or repeating a name', async () => {
    const count = DRIVE_PAGE_SIZE + 5;
    for (let index = 0; index < count; index += 1) {
      const id = `0d000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`;
      document(id, MEMBER_ROOT, `file-${String(index).padStart(4, '0')}.txt`, null);
    }
    const first = await service.browseFolder(asMember(), { rootId: MEMBER_ROOT });
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    expect(first.next).not.toBeNull();
    const second = await service.browseFolder(asMember(), {
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
  it('shows a member home albums and their own only', async () => {
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
    expect((await service.listAlbums(asMember(), 'photos')).map((album) => album.title)).toEqual([
      'Holidays',
      'Mine',
    ]);
    expect((await service.listAlbums(asOwner(), 'photos')).map((album) => album.title)).toEqual([
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

  function itemIds(entries: readonly DriveRecentEntry[]): string[] {
    return entries.map((entry) => (entry.kind === 'shortcut' ? entry.shortcut.id : entry.item.id));
  }

  it('answers added, changed and everything, newest first', async () => {
    const added = await service.readRecent(asOwner(), { filter: 'added' });
    expect(added.entries.map((entry) => entry.kind)).toEqual(['added']);
    expect(itemIds(added.entries)).toEqual([FILE]);
    const changed = await service.readRecent(asOwner(), { filter: 'changed' });
    expect(changed.entries.map((entry) => entry.kind)).toEqual(['changed']);
    expect((await service.readRecent(asOwner(), { filter: 'everything' })).entries).toHaveLength(2);
  });

  it('hides other members’ files from a member', async () => {
    const everything = await service.readRecent(asMember(), { filter: 'everything' });
    expect(itemIds(everything.entries)).toEqual([FILE, FILE]);
  });

  it('refuses a cursor it did not give out', async () => {
    await expect(service.readRecent(asOwner(), { filter: 'added', cursor: 'abc' })).rejects.toThrow(
      /cursor/,
    );
  });

  it('lists what the person opened, and only theirs', async () => {
    await service.recordOpen(asOwner(), FILE, '2026-11-08T00:00:00.000Z');
    expect(
      (await service.readRecent(asOwner(), { filter: 'opened' })).entries.map(
        (entry) => entry.kind,
      ),
    ).toEqual(['opened']);
    expect((await service.readRecent(asMember(), { filter: 'opened' })).entries).toEqual([]);
  });
});

describe('drive settings', () => {
  it('reads the seeded settings and changes only what the update names', async () => {
    const before = await loadDriveSettings(opened.store);
    const after = await updateDriveSettings(opened.store, {
      membersMayShare: !before.membersMayShare,
    });
    expect(after).toEqual({ ...before, membersMayShare: !before.membersMayShare });
    expect(await loadDriveSettings(opened.store)).toEqual(after);
  });

  it('refuses a value the schema does not allow', async () => {
    await expect(updateDriveSettings(opened.store, { uploadExpiryDays: 0 })).rejects.toThrow();
  });
});
