import type {
  DriveAlbum,
  DriveChangedNotice,
  DriveProgressNotice,
  DriveRoot,
  LiveChange,
  LiveTable,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveNoticeSeenBy } from '../../src/server/live-access';
import { driveRowVisible, seenBy, visible, type Hearing } from '../../src/server/live-visibility';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = '2026-11-07T10:00:00.000Z';
const TABLES: readonly LiveTable[] = [
  'drive_roots',
  'drive_albums',
  'drive_grants',
  'drive_placements',
];
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const OWNER_ROOT = '0d000000-0000-4000-8000-000000000002';
const ANN_ROOT = '0d000000-0000-4000-8000-000000000003';
const BOB_ROOT = '0d000000-0000-4000-8000-000000000004';
const HOME_ALBUM = '0a000000-0000-4000-8000-000000000001';
const ANN_ALBUM = '0a000000-0000-4000-8000-000000000002';
const BOB_ALBUM = '0a000000-0000-4000-8000-000000000003';
const BOB_FOLDER = '0f000000-0000-4000-8000-000000000001';
const HOME_FOLDER = '0f000000-0000-4000-8000-000000000002';
const ANN_FOLDER = '0f000000-0000-4000-8000-000000000003';

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;

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
      shared: false,
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
  test = await driveTestStore();
  owner = addPerson(test, 'Robin', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  test.store.driveRoots.insert(sharedDriveRoot(HOME_ROOT));
  test.store.driveRoots.insert(personalDriveRoot(OWNER_ROOT, owner.profileId));
  test.store.driveRoots.insert(personalDriveRoot(ANN_ROOT, ann.profileId));
  test.store.driveRoots.insert(personalDriveRoot(BOB_ROOT, bob.profileId));
  test.store.driveAlbums.insert(albumOf(HOME_ALBUM, 'home', null));
  test.store.driveAlbums.insert(albumOf(ANN_ALBUM, 'person', ann.profileId));
  test.store.driveAlbums.insert(albumOf(BOB_ALBUM, 'person', bob.profileId));
  folderIn(HOME_FOLDER, HOME_ROOT);
  folderIn(BOB_FOLDER, BOB_ROOT);
  folderIn(ANN_FOLDER, ANN_ROOT);
});

afterEach(async () => {
  await test.close();
});

describe('drive roots in the live scope', () => {
  it('shows a member the Shared Drive and their own drive only', () => {
    const seen = [HOME_ROOT, OWNER_ROOT, ANN_ROOT, BOB_ROOT].filter((id) =>
      shownTo(ann, test.store.driveRoots.byId(id)),
    );
    expect(seen).toEqual([HOME_ROOT, ANN_ROOT]);
  });

  it('shows the hub owner the Shared Drive and their own drive, never a member drive', () => {
    const seen = [HOME_ROOT, OWNER_ROOT, ANN_ROOT, BOB_ROOT].filter((id) =>
      shownTo(owner, test.store.driveRoots.byId(id)),
    );
    expect(seen).toEqual([HOME_ROOT, OWNER_ROOT]);
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

describe('drive albums and grants in the live scope', () => {
  it('shows a member home albums and their own albums only', () => {
    const seen = [HOME_ALBUM, ANN_ALBUM, BOB_ALBUM].filter((id) =>
      driveRowVisible(hearing(ann), test.store.driveAlbums.byId(id), profileOf, personOfDevice),
    );
    expect(seen).toEqual([HOME_ALBUM, ANN_ALBUM]);
  });

  it('shows a grant to the person who made it and the person who received it only', () => {
    const grant = test.store.driveGrants.set(
      { itemId: BOB_FOLDER, profileId: ann.profileId, role: 'view' },
      bob.profileId,
    );
    const shown = (person: TestPerson): boolean =>
      driveRowVisible(hearing(person), grant, profileOf, personOfDevice);
    expect(shown(ann)).toBe(true);
    expect(shown(bob)).toBe(true);
    expect(shown(owner)).toBe(false);
  });

  it('applies the same rule to album and grant changes, the grantee hearing their own', () => {
    const album: LiveChange = {
      type: 'change',
      seq: 3,
      operation: 'UPDATE',
      table: 'drive_albums',
      record: test.store.driveAlbums.byId(BOB_ALBUM),
      oldRecord: null,
    };
    const grant: LiveChange = {
      type: 'change',
      seq: 4,
      operation: 'INSERT',
      table: 'drive_grants',
      record: test.store.driveGrants.set(
        { itemId: BOB_FOLDER, profileId: owner.profileId, role: 'edit' },
        bob.profileId,
      ),
      oldRecord: null,
    };
    expect(visible(hearing(ann), album, test.store)).toBe(false);
    expect(visible(hearing(ann), grant, test.store)).toBe(false);
    expect(visible(hearing(owner), album, test.store)).toBe(false);
    expect(visible(hearing(owner), grant, test.store)).toBe(true);
    expect(visible(hearing(bob), album, test.store)).toBe(true);
    expect(visible(hearing(bob), grant, test.store)).toBe(true);
  });
});

describe('drive notices in the live scope', () => {
  it('gives the hub owner no notice about a member drive and keeps the rest', () => {
    expect(
      driveNoticeSeenBy(hearing(owner), changed([BOB_ROOT], [BOB_FOLDER], [BOB_ALBUM]), test.store),
    ).toBeNull();
    expect(
      driveNoticeSeenBy(
        hearing(owner),
        changed([HOME_ROOT, BOB_ROOT], [HOME_FOLDER, BOB_FOLDER], [HOME_ALBUM, BOB_ALBUM]),
        test.store,
      ),
    ).toEqual(changed([HOME_ROOT], [HOME_FOLDER], [HOME_ALBUM]));
  });

  it('lets a person hear about a folder shared with them and nothing else of that drive', () => {
    test.store.driveGrants.set(
      { itemId: BOB_FOLDER, profileId: ann.profileId, role: 'view' },
      bob.profileId,
    );
    expect(
      driveNoticeSeenBy(hearing(ann), changed([BOB_ROOT], [BOB_FOLDER], [BOB_ALBUM]), test.store),
    ).toEqual(changed([], [BOB_FOLDER], []));
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
    expect(seenBy(hearing(owner), progress(BOB_ROOT), test.store)).toBeNull();
  });

  it('hides a notice about a root that no longer exists from a member', () => {
    const gone = '0d000000-0000-4000-8000-0000000000ff';
    expect(driveNoticeSeenBy(hearing(ann), changed([gone], [], []), test.store)).toBeNull();
  });
});
