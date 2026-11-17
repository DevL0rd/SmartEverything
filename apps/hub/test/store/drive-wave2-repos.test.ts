import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { lockedSql, mayExport, itemAccess } from '../../src/drive/access';
import { DriveAccessRequestPendingError } from '../../src/store/repositories/drive-access-requests';
import type { DriveNotificationInput } from '../../src/store/repositories/drive-notifications';
import { DriveTransferOpenError } from '../../src/store/repositories/drive-transfers';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { driveTestStore, putItem } from '../drive/spaces-fixture';
import { personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000002';
const SAM_DRIVE = '0d000000-0000-4000-8000-000000000003';
const id = (n: number): string => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP = id(1);
const TRIP_FILE = id(2);
const TRIPOD = id(3);
const TRIPOD_FILE = id(4);
const ROBIN_FILE = id(5);
const SHARED_FILE = id(6);
const SHA = 'b'.repeat(64);

let opened: TestStore;
let store: TestStore['store'];
let robin: string;
let sam: string;
let kim: string;

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  store = opened.store;
  robin = store.profiles.first().id;
  sam = store.profiles.create({ name: 'Sam' }).id;
  kim = store.profiles.create({ name: 'Kim' }).id;
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robin));
  store.driveRoots.insert(personalDriveRoot(SAM_DRIVE, sam));
  putItem(store, { rootId: SAM_DRIVE, id: TRIP, relPath: 'trip', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIP_FILE, relPath: 'trip/a.txt', kind: 'document' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIPOD, relPath: 'tripod', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIPOD_FILE, relPath: 'tripod/c.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_FILE, relPath: 'mine.txt', kind: 'document' });
  putItem(store, { rootId: HOME, id: SHARED_FILE, relPath: 'shared.txt', kind: 'document' });
});

afterEach(async () => {
  await opened.close();
});

describe('the viewer fields of a drive item', () => {
  it('shows each person their own opened time', () => {
    store.driveOpens.record(sam, TRIP_FILE, '2026-11-08T00:00:00.000Z');
    store.driveOpens.record(robin, TRIP_FILE, '2026-11-09T00:00:00.000Z');
    expect(store.driveItems.byId(TRIP_FILE, sam).openedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(store.driveItems.byId(TRIP_FILE, robin).openedAt).toBe('2026-11-09T00:00:00.000Z');
    expect(store.driveItems.byId(TRIP_FILE, kim).openedAt).toBeNull();
  });

  it('keeps the newest open when an older one is recorded later', () => {
    store.driveOpens.record(sam, TRIP_FILE, '2026-11-09T00:00:00.000Z');
    store.driveOpens.record(sam, TRIP_FILE, '2026-11-08T00:00:00.000Z');
    expect(store.driveItems.byId(TRIP_FILE, sam).openedAt).toBe('2026-11-09T00:00:00.000Z');
  });

  it('marks an item locked when it or a folder above it is locked, and not a similar sibling', () => {
    store.driveLocks.set(TRIP, sam, true);
    expect(store.driveItems.byId(TRIP, sam).locked).toBe(true);
    expect(store.driveItems.byId(TRIP_FILE, sam).locked).toBe(true);
    expect(store.driveItems.byId(TRIPOD, sam).locked).toBe(false);
    expect(store.driveItems.byId(TRIPOD_FILE, sam).locked).toBe(false);
    store.driveLocks.set(TRIP, sam, false);
    expect(store.driveItems.byId(TRIP_FILE, sam).locked).toBe(false);
  });

  it('shows folder colours only to the person who chose them', () => {
    store.driveFolderColours.set(sam, TRIP, 'viz-3');
    expect(store.driveItems.byId(TRIP, sam)).toMatchObject({ colour: 'viz-3' });
    expect(store.driveItems.byId(TRIP, robin)).toMatchObject({ colour: null });
    store.driveFolderColours.set(sam, TRIP, null);
    expect(store.driveItems.byId(TRIP, sam)).toMatchObject({ colour: null });
  });

  it('counts unresolved threads and reopens a resolved one', () => {
    const first = store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: sam,
      parentId: null,
      body: 'look',
      mentions: [],
    });
    store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: sam,
      parentId: null,
      body: 'again',
      mentions: [],
    });
    expect(store.driveItems.byId(TRIP_FILE, sam).openComments).toBe(2);
    store.driveComments.resolve(first.id, sam);
    expect(store.driveItems.byId(TRIP_FILE, sam).openComments).toBe(1);
    store.driveComments.resolve(first.id, null);
    expect(store.driveItems.byId(TRIP_FILE, sam).openComments).toBe(2);
  });

  it('flags a folder that holds an icon', () => {
    store.driveFolderIcons.set({
      folderItemId: TRIP,
      source: 'named_file',
      sourceRelPath: 'trip/icon.png',
      sourceRev: 1,
      imageSha256: SHA,
    });
    expect(store.driveItems.byId(TRIP, sam)).toMatchObject({ iconHint: true });
    expect(store.driveItems.byId(TRIPOD, sam)).toMatchObject({ iconHint: false });
    expect(store.driveFolderIcons.clear(TRIP)).toBe(true);
    expect(store.driveItems.byId(TRIP, sam)).toMatchObject({ iconHint: false });
  });
});

describe('the export rule', () => {
  it('refuses only a view grantee of a locked item', () => {
    expect(mayExport('view', true)).toBe(false);
    expect(mayExport('view', false)).toBe(true);
    for (const access of ['own', 'shared', 'edit'] as const) {
      expect(mayExport(access, true)).toBe(true);
    }
  });

  it('applies to a view grantee of a folder through the folder lock', () => {
    store.driveGrants.set({ itemId: TRIP, profileId: kim, role: 'view', expiresAt: null }, sam);
    store.driveLocks.set(TRIP, sam, true);
    const file = store.driveItems.byId(TRIP_FILE, kim);
    const drive = store.driveRoots.byId(SAM_DRIVE);
    expect(file.locked).toBe(true);
    expect(mayExport(itemAccess(store, { profileId: kim }, drive, file), file.locked)).toBe(false);
    expect(mayExport(itemAccess(store, { profileId: sam }, drive, file), file.locked)).toBe(true);
  });

  it('builds a lock test that is true exactly for covered rows', () => {
    store.driveLocks.set(TRIP, sam, true);
    const rows = store.context.sql.all(
      z.strictObject({ id: z.string(), locked: z.number() }),
      `select i.id, ${lockedSql('i')} as locked from drive_items i where i.root_id = $root order by i.rel_path`,
      { root: SAM_DRIVE },
    );
    expect(rows.filter((row) => row.locked === 1).map((row) => row.id)).toEqual([TRIP, TRIP_FILE]);
  });
});

describe('expiring grants', () => {
  it('removes exactly the expired grants and reports the next expiry', () => {
    const soon = '2026-11-08T00:00:00.000Z';
    const later = '2026-12-08T00:00:00.000Z';
    store.driveGrants.set({ itemId: TRIP, profileId: kim, role: 'view', expiresAt: soon }, sam);
    store.driveGrants.set({ itemId: TRIPOD, profileId: kim, role: 'edit', expiresAt: later }, sam);
    store.driveGrants.set(
      { itemId: TRIP_FILE, profileId: robin, role: 'view', expiresAt: null },
      sam,
    );
    expect(store.driveGrants.nextExpiry()).toBe(soon);
    const removed = store.driveGrants.removeExpired('2026-11-08T00:00:00.000Z');
    expect(removed.map((grant) => grant.itemId)).toEqual([TRIP]);
    expect(store.driveGrants.nextExpiry()).toBe(later);
    expect(
      store.driveGrants
        .receivedBy(kim)
        .map((grant) => grant.itemId)
        .toSorted(),
    ).toEqual([TRIPOD]);
    expect(store.driveGrants.receivedBy(robin)).toHaveLength(1);
  });

  it('changes the expiry of an existing grant', () => {
    store.driveGrants.set({ itemId: TRIP, profileId: kim, role: 'view', expiresAt: null }, sam);
    const changed = store.driveGrants.set(
      { itemId: TRIP, profileId: kim, role: 'view', expiresAt: '2026-12-01T00:00:00.000Z' },
      sam,
    );
    expect(changed.expiresAt).toBe('2026-12-01T00:00:00.000Z');
  });
});

describe('comments', () => {
  it('keeps a deleted thread with replies as a placeholder and drops it with its last reply', () => {
    const root = store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: sam,
      parentId: null,
      body: 'question',
      mentions: [],
    });
    const reply = store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: kim,
      parentId: root.id,
      body: 'answer',
      mentions: [],
    });
    expect(store.driveComments.participants(root.id).toSorted()).toEqual([kim, sam].toSorted());
    store.driveComments.remove(root.id);
    expect(store.driveComments.byId(root.id).deleted).toBe(true);
    expect(store.driveComments.threads(TRIP_FILE, null, 10).threads).toHaveLength(1);
    store.driveComments.remove(reply.id);
    expect(store.driveComments.find(root.id)).toBeUndefined();
    expect(store.driveComments.threads(TRIP_FILE, null, 10).threads).toHaveLength(0);
  });

  it('refuses a reply to a reply or to another item thread', () => {
    const root = store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: sam,
      parentId: null,
      body: 'question',
      mentions: [],
    });
    const reply = store.driveComments.add({
      itemId: TRIP_FILE,
      authorProfileId: sam,
      parentId: root.id,
      body: 'more',
      mentions: [],
    });
    for (const [itemId, parentId] of [
      [TRIP_FILE, reply.id],
      [TRIPOD_FILE, root.id],
    ] as const) {
      expect(() =>
        store.driveComments.add({
          itemId,
          authorProfileId: sam,
          parentId,
          body: 'x',
          mentions: [],
        }),
      ).toThrow();
    }
  });
});

describe('notifications', () => {
  const edited = (): DriveNotificationInput => ({
    profileId: sam,
    kind: 'edited',
    itemId: TRIP_FILE,
    actorProfileId: robin,
    actorName: null,
    refId: null,
  });

  it('coalesces an unread notice of the same kind, item and actor and creates once', () => {
    const notices: unknown[] = [];
    store.feed.subscribeNotices((notice) => notices.push(notice));
    const first = store.driveNotifications.add(edited());
    const second = store.driveNotifications.add(edited());
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.notification).toMatchObject({ id: first.notification.id, count: 2 });
    expect(store.driveNotifications.unreadCount(sam)).toBe(1);
    expect(notices).toEqual([
      { type: 'drive_notification', profileId: sam },
      { type: 'drive_notification', profileId: sam },
    ]);
  });

  it('starts a new row after the old one is read and keeps actors apart', () => {
    const first = store.driveNotifications.add(edited());
    store.driveNotifications.add({ ...edited(), actorProfileId: kim });
    store.driveNotifications.markRead(sam, { ids: [first.notification.id] });
    const again = store.driveNotifications.add(edited());
    expect(again.created).toBe(true);
    expect(store.driveNotifications.unreadCount(sam)).toBe(2);
  });

  it('coalesces file request uploads per request and uploader name', () => {
    const upload = (name: string, request: string): DriveNotificationInput => ({
      profileId: sam,
      kind: 'file_request_upload',
      itemId: TRIP,
      actorProfileId: null,
      actorName: name,
      refId: request,
    });
    const a = store.driveNotifications.add(upload('Alex', id(50)));
    const b = store.driveNotifications.add(upload('Alex', id(50)));
    const c = store.driveNotifications.add(upload('Alex', id(51)));
    const d = store.driveNotifications.add(upload('Bo', id(50)));
    expect([a.created, b.created, c.created, d.created]).toEqual([true, false, true, true]);
  });

  it('marks all read and lists newest first', () => {
    store.driveNotifications.add(edited());
    store.driveNotifications.add({ ...edited(), kind: 'shared' });
    expect(store.driveNotifications.markRead(sam, { all: true })).toHaveLength(2);
    expect(store.driveNotifications.unreadCount(sam)).toBe(0);
    expect(store.driveNotifications.list(sam, null, 10).notifications).toHaveLength(2);
    expect(store.driveNotifications.list(robin, null, 10).notifications).toHaveLength(0);
  });
});

describe('access requests', () => {
  it('allows one pending request per item and person, then another after it is answered', () => {
    const request = store.driveAccessRequests.create({
      itemId: TRIP,
      requesterProfileId: kim,
      role: 'view',
      message: null,
    });
    expect(() =>
      store.driveAccessRequests.create({
        itemId: TRIP,
        requesterProfileId: kim,
        role: 'edit',
        message: null,
      }),
    ).toThrow();
    expect(store.driveAccessRequests.pendingFor(TRIP, kim)?.id).toBe(request.id);
    expect(store.driveAccessRequests.waiting(sam, null, 10).requests).toHaveLength(1);
    const answered = store.driveAccessRequests.answer(request.id, sam, {
      decision: 'approve',
      role: 'edit',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    expect(answered).toMatchObject({ state: 'approved', role: 'edit' });
    expect(() =>
      store.driveAccessRequests.answer(request.id, sam, {
        decision: 'decline',
      }),
    ).toThrow(DriveAccessRequestPendingError);
    expect(store.driveAccessRequests.pendingFor(TRIP, kim)).toBeUndefined();
    store.driveAccessRequests.create({
      itemId: TRIP,
      requesterProfileId: kim,
      role: 'view',
      message: 'please',
    });
    expect(store.driveAccessRequests.made(kim, null, 10).requests).toHaveLength(2);
  });
});

describe('transfers', () => {
  it('allows one open offer per item', () => {
    const offer = store.driveTransfers.offer({
      itemId: TRIP,
      fromProfileId: sam,
      toProfileId: kim,
    });
    expect(() =>
      store.driveTransfers.offer({ itemId: TRIP, fromProfileId: sam, toProfileId: robin }),
    ).toThrow(DriveTransferOpenError);
    expect(store.driveTransfers.openFor(TRIP)?.id).toBe(offer.id);
    store.driveTransfers.settle(offer.id, 'declined');
    expect(store.driveTransfers.openFor(TRIP)).toBeUndefined();
    store.driveTransfers.offer({ itemId: TRIP, fromProfileId: sam, toProfileId: robin });
    expect(store.driveTransfers.involving(sam, null, 10).transfers).toHaveLength(2);
  });
});

describe('shortcuts', () => {
  it('keeps names unique per folder, lists a folder and finds shortcuts by target', () => {
    const made = store.driveShortcuts.create({
      rootId: ROBIN_DRIVE,
      parentId: null,
      targetItemId: TRIP_FILE,
      name: 'Trip notes',
      createdBy: robin,
      createdVia: 'app',
    });
    expect(() =>
      store.driveShortcuts.create({
        rootId: ROBIN_DRIVE,
        parentId: null,
        targetItemId: TRIPOD_FILE,
        name: 'Trip notes',
        createdBy: robin,
        createdVia: 'app',
      }),
    ).toThrow();
    expect(store.driveShortcuts.nameTaken(ROBIN_DRIVE, null, 'Trip notes')).toBe(true);
    expect(store.driveShortcuts.inFolder(ROBIN_DRIVE, null).map((row) => row.id)).toEqual([
      made.id,
    ]);
    expect(store.driveShortcuts.pointingAt(TRIP_FILE)).toHaveLength(1);
    store.driveShortcuts.update(made.id, { name: 'Notes' });
    expect(store.driveShortcuts.byId(made.id).name).toBe('Notes');
  });

  it('keeps a shortcut while its target is only trashed and sweeps it when the target is gone', () => {
    store.driveShortcuts.create({
      rootId: ROBIN_DRIVE,
      parentId: null,
      targetItemId: TRIP_FILE,
      name: 'Trip notes',
      createdBy: robin,
      createdVia: 'app',
    });
    store.driveShortcuts.sweepOrphans();
    expect(store.driveShortcuts.pointingAt(TRIP_FILE)).toHaveLength(1);
    store.driveItems.remove(TRIP_FILE);
    store.driveShortcuts.sweepOrphans();
    expect(store.driveShortcuts.pointingAt(TRIP_FILE)).toHaveLength(0);
  });
});

describe('file requests', () => {
  it('counts uploads and finds a request by its token hash', () => {
    const request = store.driveFileRequests.create({
      folderItemId: TRIP,
      createdBy: sam,
      title: 'Receipts',
      message: null,
      tokenHash: 'h'.repeat(64),
      expiresAt: null,
    });
    expect(store.driveFileRequests.byToken('h'.repeat(64))?.id).toBe(request.id);
    store.driveFileRequests.recordUpload({
      requestId: request.id,
      itemId: TRIP_FILE,
      uploaderName: 'Alex',
      bytes: 10,
    });
    expect(store.driveFileRequests.byId(request.id)).toMatchObject({ uploads: 1, bytes: 10 });
    expect(store.driveFileRequests.uploads(request.id, null, 10).uploads).toHaveLength(1);
    expect(store.driveFileRequests.close(request.id).closedAt).not.toBeNull();
  });
});

describe('offline pins', () => {
  it('records a pin per phone, finds holders through a pinned folder and takes reports', () => {
    const phone = store.clients.create(
      { name: 'Phone', platform: 'android', role: 'member', tokenHash: 'p' },
      false,
    ).id;
    store.driveOffline.set(phone, TRIP, sam, true);
    expect(store.driveOffline.holdersOfEach([TRIP_FILE, TRIPOD_FILE])).toEqual([
      { itemId: TRIP_FILE, clientId: phone, profileId: sam },
    ]);
    expect(store.driveOffline.holdersOfEach([TRIPOD_FILE])).toEqual([]);
    store.driveOffline.report(phone, [{ itemId: TRIP, state: 'ready', bytes: 10, rev: 1 }]);
    expect(store.driveOffline.find(phone, TRIP)).toMatchObject({ state: 'ready', syncedRev: 1 });
    store.driveOffline.set(phone, TRIP, sam, false);
    expect(store.driveOffline.find(phone, TRIP)).toBeUndefined();
  });
});

describe('indexed text', () => {
  it('searches the stored body, replaces it and forgets it with the item', () => {
    store.driveItemText.put({
      itemId: TRIP_FILE,
      rev: 1,
      source: 'document',
      state: 'ok',
      body: 'Boarding passes for Lisbon',
    });
    const search = (term: string): string[] =>
      store.context.sql
        .all(
          z.strictObject({ item_id: z.string() }),
          'select item_id from drive_item_text_search where drive_item_text_search match $term',
          { term },
        )
        .map((row) => row.item_id);
    expect(search('lisbon')).toEqual([TRIP_FILE]);
    store.driveItemText.put({ itemId: TRIP_FILE, rev: 2, source: 'document', state: 'empty' });
    expect(search('lisbon')).toEqual([]);
    store.driveItemText.put({
      itemId: TRIP_FILE,
      rev: 3,
      source: 'document',
      state: 'ok',
      body: 'Porto',
    });
    expect(search('porto')).toEqual([TRIP_FILE]);
    store.driveItems.remove(TRIP_FILE);
    expect(search('porto')).toEqual([]);
    expect(store.driveItemText.find(TRIP_FILE)).toBeUndefined();
  });
});
