import type {
  DriveAlbum,
  DriveChangedNotice,
  DriveProgressNotice,
  DriveRoot,
  DriveSyncClient,
  LiveChange,
  LiveTable,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveNoticeSeenBy } from '../../src/server/live-access';
import { driveRowVisible, seenBy, visible, type Hearing } from '../../src/server/live-visibility';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-07T10:00:00.000Z';
const TABLES: readonly LiveTable[] = ['drive_roots', 'drive_albums', 'drive_sync_clients'];
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const LINKED_ROOT = '0d000000-0000-4000-8000-000000000002';
const ANN_ROOT = '0d000000-0000-4000-8000-000000000003';
const BOB_ROOT = '0d000000-0000-4000-8000-000000000004';
const HOME_ALBUM = '0a000000-0000-4000-8000-000000000001';
const ANN_ALBUM = '0a000000-0000-4000-8000-000000000002';
const BOB_ALBUM = '0a000000-0000-4000-8000-000000000003';
const BOB_FOLDER = '0f000000-0000-4000-8000-000000000001';
const HOME_FOLDER = '0f000000-0000-4000-8000-000000000002';
const CLIENT_ID = '0c000000-0000-4000-8000-000000000001';
const DEVICE_ID = '0e000000-0000-4000-8000-000000000001';
const HEALTH = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;

function rootOf(
  id: string,
  scope: 'home' | 'person',
  ownerProfileId: string | null,
  kind: 'managed' | 'folder' = 'managed',
): DriveRoot {
  return {
    id,
    kind,
    label: id,
    scope,
    ownerProfileId,
    path: `/srv/${id}`,
    readOnly: false,
    versions: false,
    volume: null,
    indexId: `index-${id}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: HEALTH,
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

function albumOf(
  id: string,
  scope: 'home' | 'person',
  ownerProfileId: string | null,
): Omit<Extract<DriveAlbum, { kind: 'manual' }>, 'createdAt' | 'updatedAt' | 'itemCount'> {
  return {
    id,
    title: id,
    kind: 'manual',
    surface: 'drive',
    scope,
    ownerProfileId,
    coverItemId: null,
  };
}

function folderIn(id: string, rootId: string): void {
  test.store.driveItems.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: id,
      name: id,
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

function syncClientOf(profileId: string): DriveSyncClient {
  return {
    clientId: CLIENT_ID,
    rootId: HOME_ROOT,
    deviceId: DEVICE_ID,
    profileId,
    enabled: true,
    selected: [],
    lastSeq: 0,
    lastSeenAt: null,
    needBytes: 0,
    errors: [],
  };
}

function hearing(person: TestPerson): Hearing {
  return { client: person.client, tables: new Set(TABLES) };
}

function profileOf(clientId: string): string {
  return test.store.profiles.activeOf(clientId).id;
}

function personOfDevice(deviceId: string): string | null {
  return test.store.computerNodes.personOf(deviceId);
}

function rootChange(row: DriveRoot): LiveChange {
  return {
    type: 'change',
    seq: 1,
    operation: 'INSERT',
    table: 'drive_roots',
    record: row,
    oldRecord: null,
  };
}

function shownTo(person: TestPerson, row: DriveRoot): boolean {
  return visible(hearing(person), rootChange(row), test.store);
}

function changed(rootIds: string[], folderIds: string[], albumIds: string[]): DriveChangedNotice {
  return { type: 'drive_changed', rootIds, folderIds, albumIds, months: [], cursor: 7 };
}

beforeEach(async () => {
  test = await testStore();
  owner = addPerson(test, 'Robin', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  test.store.driveRoots.insert(rootOf(HOME_ROOT, 'home', null));
  test.store.driveRoots.insert(rootOf(LINKED_ROOT, 'home', null, 'folder'));
  test.store.driveRoots.insert(rootOf(ANN_ROOT, 'person', ann.profileId));
  test.store.driveRoots.insert(rootOf(BOB_ROOT, 'person', bob.profileId));
  test.store.driveAlbums.insert(albumOf(HOME_ALBUM, 'home', null));
  test.store.driveAlbums.insert(albumOf(ANN_ALBUM, 'person', ann.profileId));
  test.store.driveAlbums.insert(albumOf(BOB_ALBUM, 'person', bob.profileId));
  folderIn(HOME_FOLDER, HOME_ROOT);
  folderIn(BOB_FOLDER, BOB_ROOT);
});

afterEach(async () => {
  await test.close();
});

describe('drive roots in the live scope', () => {
  it('shows a member the home root, the linked home roots and their own person root only', () => {
    const seen = [HOME_ROOT, LINKED_ROOT, ANN_ROOT, BOB_ROOT].filter((id) =>
      shownTo(ann, test.store.driveRoots.byId(id)),
    );
    expect(seen).toEqual([HOME_ROOT, LINKED_ROOT, ANN_ROOT]);
  });

  it('shows the owner every root including each member person root', () => {
    const seen = [HOME_ROOT, LINKED_ROOT, ANN_ROOT, BOB_ROOT].filter((id) =>
      shownTo(owner, test.store.driveRoots.byId(id)),
    );
    expect(seen).toEqual([HOME_ROOT, LINKED_ROOT, ANN_ROOT, BOB_ROOT]);
  });

  it('judges a deleted root by the old row', () => {
    const change: LiveChange = {
      type: 'change',
      seq: 2,
      operation: 'DELETE',
      table: 'drive_roots',
      record: null,
      oldRecord: test.store.driveRoots.byId(BOB_ROOT),
    };
    expect(visible(hearing(ann), change, test.store)).toBe(false);
    expect(visible(hearing(bob), change, test.store)).toBe(true);
  });

  it('hides drive rows from a connection that did not subscribe to the table', () => {
    const quiet: Hearing = { client: ann.client, tables: new Set() };
    expect(visible(quiet, rootChange(test.store.driveRoots.byId(HOME_ROOT)), test.store)).toBe(
      false,
    );
  });
});

describe('drive albums and sync clients in the live scope', () => {
  it('shows a member home albums and their own albums only', () => {
    const seen = [HOME_ALBUM, ANN_ALBUM, BOB_ALBUM].filter((id) =>
      driveRowVisible(hearing(ann), test.store.driveAlbums.byId(id), profileOf, personOfDevice),
    );
    expect(seen).toEqual([HOME_ALBUM, ANN_ALBUM]);
  });

  it('shows a member only their own sync clients and the owner all of them', () => {
    expect(
      driveRowVisible(hearing(ann), syncClientOf(ann.profileId), profileOf, personOfDevice),
    ).toBe(true);
    expect(
      driveRowVisible(hearing(ann), syncClientOf(bob.profileId), profileOf, personOfDevice),
    ).toBe(false);
    expect(
      driveRowVisible(hearing(owner), syncClientOf(bob.profileId), profileOf, personOfDevice),
    ).toBe(true);
  });

  it('applies the same rule to album and sync client changes', () => {
    const album: LiveChange = {
      type: 'change',
      seq: 3,
      operation: 'UPDATE',
      table: 'drive_albums',
      record: test.store.driveAlbums.byId(BOB_ALBUM),
      oldRecord: null,
    };
    const client: LiveChange = {
      type: 'change',
      seq: 4,
      operation: 'INSERT',
      table: 'drive_sync_clients',
      record: syncClientOf(bob.profileId),
      oldRecord: null,
    };
    expect(visible(hearing(ann), album, test.store)).toBe(false);
    expect(visible(hearing(ann), client, test.store)).toBe(false);
    expect(visible(hearing(bob), album, test.store)).toBe(true);
    expect(visible(hearing(bob), client, test.store)).toBe(true);
  });
});

describe('drive notices in the live scope', () => {
  it('passes every notice to the owner untouched', () => {
    const notice = changed([BOB_ROOT], [BOB_FOLDER], [BOB_ALBUM]);
    expect(driveNoticeSeenBy(hearing(owner), notice, test.store)).toEqual(notice);
  });

  it('keeps only the roots, folders and albums a member may see', () => {
    const notice = changed(
      [HOME_ROOT, BOB_ROOT],
      [HOME_FOLDER, BOB_FOLDER],
      [HOME_ALBUM, BOB_ALBUM],
    );
    expect(driveNoticeSeenBy(hearing(ann), notice, test.store)).toEqual(
      changed([HOME_ROOT], [HOME_FOLDER], [HOME_ALBUM]),
    );
  });

  it('drops a change notice that is entirely about another member', () => {
    const notice = changed([BOB_ROOT], [BOB_FOLDER], [BOB_ALBUM]);
    expect(driveNoticeSeenBy(hearing(ann), notice, test.store)).toBeNull();
    expect(seenBy(hearing(ann), notice, test.store)).toBeNull();
  });

  it('scopes progress per root', () => {
    const progress = (rootId: string): DriveProgressNotice => ({
      type: 'drive_progress',
      rootId,
      phase: 'scan',
      done: 1,
      total: 2,
    });
    expect(seenBy(hearing(ann), progress(ANN_ROOT), test.store)).toEqual(progress(ANN_ROOT));
    expect(seenBy(hearing(ann), progress(HOME_ROOT), test.store)).toEqual(progress(HOME_ROOT));
    expect(seenBy(hearing(ann), progress(BOB_ROOT), test.store)).toBeNull();
    expect(seenBy(hearing(owner), progress(BOB_ROOT), test.store)).toEqual(progress(BOB_ROOT));
  });

  it('hides a notice about a root that no longer exists from a member', () => {
    const gone = '0d000000-0000-4000-8000-0000000000ff';
    expect(driveNoticeSeenBy(hearing(ann), changed([gone], [], []), test.store)).toBeNull();
  });
});
