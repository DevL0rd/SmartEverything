import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canRead, canShare, canWrite, itemAccess, type DriveActor } from '../../src/drive/access';
import { DriveGrants } from '../../src/drive/grants';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { driveTestStore, putItem } from './spaces-fixture';

const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000002';
const SAM_DRIVE = '0d000000-0000-4000-8000-000000000003';
const id = (n: number): string => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP = id(1);
const TRIP_FILE = id(2);
const OTHER_FILE = id(3);
const SHARED_FILE = id(4);
const ROBIN_FILE = id(5);
const UNKNOWN = id(99);

let opened: TestStore;
let grants: DriveGrants;
let robin: DriveActor;
let sam: DriveActor;
let kim: DriveActor;

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  const { store } = opened;
  robin = { profileId: store.profiles.first().id };
  sam = { profileId: store.profiles.create({ name: 'Sam' }).id };
  kim = { profileId: store.profiles.create({ name: 'Kim' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robin.profileId));
  store.driveRoots.insert(personalDriveRoot(SAM_DRIVE, sam.profileId));
  putItem(store, { rootId: SAM_DRIVE, id: TRIP, relPath: 'trip', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIP_FILE, relPath: 'trip/a.txt', kind: 'document' });
  putItem(store, { rootId: SAM_DRIVE, id: OTHER_FILE, relPath: 'other.txt', kind: 'document' });
  putItem(store, { rootId: HOME, id: SHARED_FILE, relPath: 'shared.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_FILE, relPath: 'mine.txt', kind: 'document' });
  grants = new DriveGrants({ store });
});

afterEach(async () => {
  await opened.close();
});

function accessTo(actor: DriveActor, itemId: string): ReturnType<typeof itemAccess> {
  const { store } = opened;
  const item = store.driveItems.byId(itemId, actor.profileId);
  return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
}

describe('sharing with a person', () => {
  it('grants a folder, covers what is inside and lists the grant to the person who shared', () => {
    const grant = grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    expect(grant).toMatchObject({
      itemId: TRIP,
      profileId: robin.profileId,
      grantedBy: sam.profileId,
    });
    expect(accessTo(robin, TRIP_FILE)).toBe('view');
    expect(grants.list(sam, TRIP)).toEqual([grant]);
    expect(opened.store.driveItems.byId(TRIP, robin.profileId).shared).toBe(true);
  });

  it('changes the role of a person already shared with and keeps one grant', () => {
    const first = grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    const again = grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'edit' });
    expect(again.id).toBe(first.id);
    expect(again.role).toBe('edit');
    expect(grants.list(sam, TRIP)).toHaveLength(1);
    expect(accessTo(robin, TRIP_FILE)).toBe('edit');
  });

  it('stops sharing when the person who shared revokes', () => {
    const grant = grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    grants.remove(sam, grant.id);
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
    expect(grants.list(sam, TRIP)).toEqual([]);
    expect(() => {
      grants.remove(sam, grant.id);
    }).toThrow(/no such share/u);
  });

  it('lets the recipient leave a share and nobody else end it', () => {
    const grant = grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    expect(() => {
      grants.remove(kim, grant.id);
    }).toThrow(/no such share/u);
    grants.remove(robin, grant.id);
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
  });

  it('lets an edit grantee write but not share, and refuses a view grantee any write', () => {
    grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'edit' });
    grants.set(sam, { itemId: OTHER_FILE, profileId: kim.profileId, role: 'view' });
    expect(canWrite(accessTo(robin, TRIP_FILE))).toBe(true);
    expect(canShare(accessTo(robin, TRIP_FILE))).toBe(false);
    expect(() =>
      grants.set(robin, { itemId: TRIP_FILE, profileId: kim.profileId, role: 'view' }),
    ).toThrow(/whose drive/u);
    expect(canRead(accessTo(kim, OTHER_FILE))).toBe(true);
    expect(canWrite(accessTo(kim, OTHER_FILE))).toBe(false);
    expect(() =>
      grants.set(kim, { itemId: OTHER_FILE, profileId: robin.profileId, role: 'view' }),
    ).toThrow(/whose drive/u);
  });

  it('shows a grantee only their own grant on the item', () => {
    grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    grants.set(sam, { itemId: TRIP, profileId: kim.profileId, role: 'edit' });
    expect(grants.list(sam, TRIP)).toHaveLength(2);
    expect(grants.list(robin, TRIP_FILE)).toEqual([]);
    expect(grants.list(robin, TRIP).map((grant) => grant.profileId)).toEqual([robin.profileId]);
  });

  it('refuses the Hub owner any view or change of another person’s unshared items', () => {
    expect(() => grants.list(robin, TRIP)).toThrow(/no such file/u);
    expect(() =>
      grants.set(robin, { itemId: TRIP, profileId: kim.profileId, role: 'view' }),
    ).toThrow(/no such file/u);
    grants.set(sam, { itemId: TRIP, profileId: kim.profileId, role: 'view' });
    expect(() => grants.list(robin, TRIP)).toThrow(/no such file/u);
    expect(grants.sharedWithMe(robin, undefined).items).toEqual([]);
    expect(grants.sharedByMe(robin, undefined).items).toEqual([]);
  });

  it('refuses the Shared Drive, yourself, an unknown person and an unknown item', () => {
    expect(() =>
      grants.set(robin, { itemId: SHARED_FILE, profileId: sam.profileId, role: 'view' }),
    ).toThrow(/Shared Drive/u);
    expect(() => grants.set(sam, { itemId: TRIP, profileId: sam.profileId, role: 'view' })).toThrow(
      /own/u,
    );
    expect(() => grants.set(sam, { itemId: TRIP, profileId: UNKNOWN, role: 'view' })).toThrow(
      /no such person/u,
    );
    expect(() =>
      grants.set(sam, { itemId: UNKNOWN, profileId: kim.profileId, role: 'view' }),
    ).toThrow(/no such file/u);
  });
});

describe('what happens to the item', () => {
  function trash(itemId: string, name: string): void {
    const { store } = opened;
    store.write(() => {
      store.driveTrash.insert({
        itemId,
        rootId: SAM_DRIVE,
        name,
        originalRelPath: name,
        trashRelPath: `.trash/${itemId}`,
        isFolder: false,
        bytes: 1,
        deletedAt: '2026-11-08T00:00:00.000Z',
        purgeAt: '2026-12-08T00:00:00.000Z',
        deletedBy: sam.profileId,
        addedByProfileId: sam.profileId,
      });
      store.driveItems.remove(itemId);
    });
  }

  it('hides a trashed item from the person it was shared with and shows it again when restored', () => {
    const { store } = opened;
    const grant = grants.set(sam, { itemId: OTHER_FILE, profileId: robin.profileId, role: 'view' });
    expect(grants.sharedWithMe(robin, undefined).items).toHaveLength(1);
    trash(OTHER_FILE, 'other.txt');
    expect(grants.sharedWithMe(robin, undefined).items).toEqual([]);
    expect(grants.sharedByMe(sam, undefined).items).toEqual([]);
    expect(store.driveGrants.find(grant.id)).toBeDefined();
    store.write(() => {
      store.driveTrash.remove(OTHER_FILE);
      putItem(store, { rootId: SAM_DRIVE, id: OTHER_FILE, relPath: 'other.txt', kind: 'document' });
    });
    expect(grants.sharedWithMe(robin, undefined).items).toHaveLength(1);
    expect(accessTo(robin, OTHER_FILE)).toBe('view');
  });

  it('forgets the grants of an item that is gone for good', () => {
    const { store } = opened;
    const grant = grants.set(sam, { itemId: OTHER_FILE, profileId: robin.profileId, role: 'view' });
    trash(OTHER_FILE, 'other.txt');
    store.driveGrants.sweepOrphans();
    expect(store.driveGrants.find(grant.id)).toBeDefined();
    store.driveTrash.remove(OTHER_FILE);
    store.driveGrants.sweepOrphans();
    expect(store.driveGrants.find(grant.id)).toBeUndefined();
  });

  it('ends cover when an item moves out of the shared folder', () => {
    grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    expect(accessTo(robin, TRIP_FILE)).toBe('view');
    const item = opened.store.driveItems.byId(TRIP_FILE, null);
    opened.store.driveItems.write({
      item: { ...item, parentId: null, relPath: 'moved.txt', name: 'moved.txt' },
      identity: { dev: '1', ino: TRIP_FILE.slice(-8) },
    });
    expect(opened.store.driveItems.find(TRIP_FILE, robin.profileId)).toBeDefined();
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
  });
});

describe('the pages', () => {
  it('lists what was shared with a person, with the role and who shared', () => {
    grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'edit' });
    grants.set(sam, { itemId: OTHER_FILE, profileId: robin.profileId, role: 'view' });
    grants.set(sam, { itemId: OTHER_FILE, profileId: kim.profileId, role: 'view' });
    const page = grants.sharedWithMe(robin, undefined);
    expect(page.next).toBeNull();
    expect(
      page.items
        .map((entry) => [entry.item.id, entry.grant.role, entry.grant.grantedBy])
        .sort(([left = ''], [right = '']) => left.localeCompare(right)),
    ).toEqual([
      [TRIP, 'edit', sam.profileId],
      [OTHER_FILE, 'view', sam.profileId],
    ]);
    expect(grants.sharedWithMe(kim, undefined).items).toHaveLength(1);
    expect(grants.sharedWithMe(sam, undefined).items).toEqual([]);
  });

  it('lists what a person shared with their people and their links, by name', () => {
    grants.set(sam, { itemId: TRIP, profileId: robin.profileId, role: 'view' });
    grants.set(sam, { itemId: TRIP, profileId: kim.profileId, role: 'edit' });
    opened.store.driveShares.insert({
      id: id(60),
      itemId: OTHER_FILE,
      tokenHash: 'a',
      permission: 'view',
      expiresAt: null,
      passwordHash: null,
      createdBy: sam.profileId,
      createdAt: '2026-11-07T00:00:00.000Z',
    });
    opened.store.driveShares.insert({
      id: id(61),
      itemId: OTHER_FILE,
      tokenHash: 'b',
      permission: 'view',
      expiresAt: null,
      passwordHash: null,
      createdBy: sam.profileId,
      createdAt: '2026-11-07T00:01:00.000Z',
    });
    opened.store.driveShares.revoke(id(61), '2026-11-07T00:02:00.000Z');
    const page = grants.sharedByMe(sam, undefined);
    expect(page.items.map((entry) => entry.item.name)).toEqual(['other.txt', 'trip']);
    expect(page.items[0]?.links.map((link) => link.id)).toEqual([id(60)]);
    expect(page.items[1]?.grants.map((grant) => grant.profileId).sort()).toEqual(
      [robin.profileId, kim.profileId].sort(),
    );
    expect(grants.sharedByMe(robin, undefined).items).toEqual([]);
  });

  it('pages with a cursor and refuses one it did not give out', () => {
    for (let index = 0; index < 52; index += 1) {
      putItem(opened.store, {
        rootId: SAM_DRIVE,
        id: id(100 + index),
        relPath: `bulk-${String(index).padStart(2, '0')}.txt`,
        kind: 'document',
      });
      grants.set(sam, { itemId: id(100 + index), profileId: robin.profileId, role: 'view' });
    }
    const first = grants.sharedWithMe(robin, undefined);
    expect(first.items).toHaveLength(50);
    expect(first.next).not.toBeNull();
    const second = grants.sharedWithMe(robin, first.next ?? undefined);
    expect(second.items).toHaveLength(2);
    expect(second.next).toBeNull();
    expect(() => grants.sharedWithMe(robin, UNKNOWN)).toThrow(/cursor/u);
    const mine = grants.sharedByMe(sam, undefined);
    expect(mine.items).toHaveLength(50);
    expect(grants.sharedByMe(sam, mine.next ?? undefined).items).toHaveLength(2);
  });
});
