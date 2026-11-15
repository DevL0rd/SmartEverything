import { randomUUID } from 'node:crypto';
import type {
  DriveAccessRequest,
  DriveFileRequest,
  DriveNotification,
  DriveOfflineItem,
  DriveTransfer,
  LiveChange,
  LiveTable,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { driveNoticeSeenBy } from '../../src/server/live-access';
import { visible, type Hearing } from '../../src/server/live-visibility';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = '2026-11-07T10:00:00.000Z';
const TABLES: readonly LiveTable[] = [
  'drive_notifications',
  'drive_access_requests',
  'drive_file_requests',
  'drive_transfers',
  'drive_offline_items',
];
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const ANN_ROOT = '0d000000-0000-4000-8000-000000000003';
const ANN_FOLDER = '0f000000-0000-4000-8000-000000000003';
const ITEM = randomUUID();

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let cy: TestPerson;

function hearing(person: TestPerson): Hearing {
  return { client: person.client, tables: new Set(TABLES) };
}

function seenBy(person: TestPerson, change: LiveChange): boolean {
  return visible(hearing(person), change, test.store);
}

function everyone(change: LiveChange): Record<string, boolean> {
  return {
    ann: seenBy(ann, change),
    bob: seenBy(bob, change),
    cy: seenBy(cy, change),
    owner: seenBy(owner, change),
  };
}

function notification(profileId: string): DriveNotification {
  return {
    id: randomUUID(),
    profileId,
    kind: 'shared',
    itemId: ITEM,
    actorProfileId: bob.profileId,
    actorName: null,
    refId: null,
    count: 1,
    createdAt: NOW,
    updatedAt: NOW,
    readAt: null,
  };
}

function request(requester: string, answerer: string): DriveAccessRequest {
  return {
    id: randomUUID(),
    itemId: ITEM,
    itemName: null,
    requesterProfileId: requester,
    ownerProfileId: answerer,
    role: 'view',
    message: null,
    state: 'pending',
    answeredBy: null,
    answeredAt: null,
    expiresAt: null,
    createdAt: NOW,
  };
}

function fileRequest(createdBy: string): DriveFileRequest {
  return {
    id: randomUUID(),
    folderItemId: ITEM,
    folderName: 'Receipts',
    createdBy,
    title: 'Send receipts',
    message: null,
    expiresAt: null,
    closedAt: null,
    uploads: 0,
    bytes: 0,
    createdAt: NOW,
  };
}

function transfer(from: string, to: string): DriveTransfer {
  return {
    id: randomUUID(),
    itemId: ITEM,
    itemName: 'Taxes',
    itemKind: 'folder',
    bytes: 0,
    fromProfileId: from,
    toProfileId: to,
    state: 'offered',
    createdAt: NOW,
    answeredAt: null,
  };
}

function offlineRow(profileId: string): DriveOfflineItem {
  return {
    clientId: randomUUID(),
    itemId: ITEM,
    profileId,
    state: 'waiting',
    bytes: 0,
    syncedRev: null,
    error: null,
    updatedAt: NOW,
  };
}

beforeEach(async () => {
  test = await driveTestStore();
  owner = addPerson(test, 'Robin', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  cy = addPerson(test, 'Cy', 'member');
  test.store.driveRoots.insert(sharedDriveRoot(HOME_ROOT));
  test.store.driveRoots.insert(personalDriveRoot(ANN_ROOT, ann.profileId));
  test.store.driveItems.write({
    item: {
      id: ANN_FOLDER,
      rootId: ANN_ROOT,
      parentId: null,
      relPath: 'Taxes',
      name: 'Taxes',
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
    identity: { dev: '1', ino: 'taxes' },
  });
});

afterEach(async () => {
  await test.close();
});

describe('the new drive tables in the live scope', () => {
  it('shows a notification to the person it is for and to nobody else, the owner included', () => {
    const record = notification(ann.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_notifications',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: true,
      bob: false,
      cy: false,
      owner: false,
    });
  });

  it('shows an access request to the one who asked and the one who answers only', () => {
    const record = request(bob.profileId, ann.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_access_requests',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: true,
      bob: true,
      cy: false,
      owner: false,
    });
  });

  it('shows a file request to the person who made it only', () => {
    const record = fileRequest(ann.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_file_requests',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: true,
      bob: false,
      cy: false,
      owner: false,
    });
  });

  it('shows an ownership transfer to both sides and nobody else', () => {
    const record = transfer(ann.profileId, bob.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_transfers',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: true,
      bob: true,
      cy: false,
      owner: false,
    });
  });

  it('shows an offline pin to the person who keeps it only', () => {
    const record = offlineRow(ann.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_offline_items',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: true,
      bob: false,
      cy: false,
      owner: false,
    });
  });

  it('judges a removed row by its old row', () => {
    const before = notification(bob.profileId);
    const change: LiveChange = {
      type: 'change',
      seq: 2,
      operation: 'DELETE',
      table: 'drive_notifications',
      record: null,
      oldRecord: before,
    };
    expect(everyone(change)).toEqual({ ann: false, bob: true, cy: false, owner: false });
  });

  it('shows the owner an owner’s own rows like anyone else’s', () => {
    const record = notification(owner.profileId);
    expect(
      everyone({
        type: 'change',
        seq: 1,
        operation: 'INSERT',
        table: 'drive_notifications',
        record,
        oldRecord: null,
      }),
    ).toEqual({
      ann: false,
      bob: false,
      cy: false,
      owner: true,
    });
  });
});

describe('the new drive notices in the live scope', () => {
  it('tells only the person a notification is for that their inbox changed', () => {
    const notice = { type: 'drive_notification', profileId: ann.profileId } as const;
    expect(driveNoticeSeenBy(hearing(ann), notice, test.store)).toEqual(notice);
    expect(driveNoticeSeenBy(hearing(bob), notice, test.store)).toBeNull();
    expect(driveNoticeSeenBy(hearing(owner), notice, test.store)).toBeNull();
  });

  it('tells people who can open an item that its comments changed, and nobody else', () => {
    const notice = { type: 'drive_comments_changed', itemId: ANN_FOLDER } as const;
    expect(driveNoticeSeenBy(hearing(ann), notice, test.store)).toEqual(notice);
    expect(driveNoticeSeenBy(hearing(bob), notice, test.store)).toBeNull();
    expect(driveNoticeSeenBy(hearing(owner), notice, test.store)).toBeNull();
    test.store.driveGrants.set(
      { itemId: ANN_FOLDER, profileId: bob.profileId, role: 'view', expiresAt: null },
      ann.profileId,
    );
    expect(driveNoticeSeenBy(hearing(bob), notice, test.store)).toEqual(notice);
    expect(driveNoticeSeenBy(hearing(cy), notice, test.store)).toBeNull();
  });
});
