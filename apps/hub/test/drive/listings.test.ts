import type { DriveConflict } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { DRIVE_PAGE_SIZE, DriveReadService } from '../../src/drive/service-read';
import { driveListings } from '../../src/server/handlers/drive-listings';
import type { DriveListings } from '../../src/server/handlers/drive-services';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const HOME = '0e000000-0000-4000-8000-000000000001';
const SAMS = '0e000000-0000-4000-8000-000000000002';
const DEVICE = '0e000000-0000-4000-8000-0000000000d1';

let opened: TestStore;
let owner: DriveActor;
let sam: DriveActor;
let listings: DriveListings;
let counter = 0;

function nextId(): string {
  counter += 1;
  return `0e000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

function file(rootId: string): string {
  const id = nextId();
  opened.store.driveItems.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: `${id}.txt`,
      name: `${id}.txt`,
      modifiedAt: '2026-11-07T00:00:00.000Z',
      addedAt: '2026-11-07T00:00:00.000Z',
      starred: false,
      shared: false,
      outside: false,
      remoteId: null,
      remoteRev: null,
      addedByProfileId: null,
      kind: 'document',
      mime: 'text/plain',
      bytes: 1,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
    },
    identity: { dev: '1', ino: id.slice(-6) },
  });
  return id;
}

function conflict(rootId: string, at: string): DriveConflict {
  const record: DriveConflict = {
    id: nextId(),
    rootId,
    itemId: file(rootId),
    conflictItemId: file(rootId),
    relPath: 'notes.txt',
    conflictRelPath: 'notes.sync-conflict.txt',
    hubRev: 2,
    baseRev: 1,
    deviceId: DEVICE,
    profileId: null,
    at,
    resolvedAt: null,
    resolution: null,
  };
  opened.store.driveConflicts.insert(record);
  return record;
}

function share(itemId: string, createdBy: string, createdAt: string): string {
  const id = nextId();
  opened.store.driveShares.insert({
    id,
    itemId,
    tokenHash: id,
    permission: 'view',
    expiresAt: null,
    passwordHash: null,
    createdBy,
    createdAt,
  });
  return id;
}

beforeEach(async () => {
  opened = await driveTestStore();
  const { store } = opened;
  owner = { profileId: store.profiles.first().id };
  sam = { profileId: store.profiles.create({ name: 'Sam' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(SAMS, sam.profileId));
  listings = driveListings({
    store,
    read: new DriveReadService(store),
    duplicates: { groups: () => ({ groups: [], next: null }) },
  });
});

afterEach(async () => {
  await opened.close();
});

describe('drive conflicts', () => {
  it('keeps conflicts in the store and resolves them once', () => {
    const made = conflict(HOME, '2026-11-07T01:00:00.000Z');
    expect(opened.store.driveConflicts.find(made.id)).toEqual(made);
    const resolved = opened.store.driveConflicts.resolve(
      made.id,
      'keep_both',
      '2026-11-07T02:00:00.000Z',
    );
    expect(resolved).toMatchObject({
      resolution: 'keep_both',
      resolvedAt: '2026-11-07T02:00:00.000Z',
    });
  });

  it('lists only the conflicts of folders the person may see, newest first, a page at a time', () => {
    const hidden = conflict(SAMS, '2026-11-07T00:30:00.000Z');
    const made = Array.from({ length: DRIVE_PAGE_SIZE + 1 }, (_, index) =>
      conflict(HOME, new Date(Date.parse('2026-11-07T01:00:00.000Z') + index * 1000).toISOString()),
    );
    const first = listings.conflicts(owner, { rootId: HOME });
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    expect(first.items[0]?.id).toBe(made.at(-1)?.id);
    expect(first.next).not.toBeNull();
    const second = listings.conflicts(owner, { rootId: HOME, cursor: first.next ?? undefined });
    expect(second).toEqual({ items: [made[0]], next: null });
    expect(listings.conflicts(sam, { rootId: SAMS }).items).toEqual([hidden]);
    const outsider = opened.store.profiles.create({ name: 'Ann' }).id;
    expect(() => listings.conflicts({ profileId: outsider }, { rootId: SAMS })).toThrow();
    expect(() => listings.conflicts(owner, { rootId: SAMS })).toThrow();
    expect(() => listings.conflicts(sam, { rootId: HOME, cursor: hidden.id })).toThrow();
  });
});

describe('drive shares', () => {
  it('lists the links the person made, for one item or all, a page at a time', () => {
    const item = file(HOME);
    const other = file(HOME);
    const minute = (offset: number): string =>
      new Date(Date.parse('2026-11-07T01:00:00.000Z') + offset * 60_000).toISOString();
    const made = Array.from({ length: DRIVE_PAGE_SIZE + 1 }, (_, index) =>
      share(item, owner.profileId, minute(index)),
    );
    const onOther = share(other, owner.profileId, minute(500));
    share(item, sam.profileId, minute(600));
    const first = listings.shares(owner, { itemId: item });
    expect(first.items).toHaveLength(DRIVE_PAGE_SIZE);
    expect(first.items[0]?.id).toBe(made.at(-1));
    const second = listings.shares(owner, { itemId: item, cursor: first.next ?? undefined });
    expect(second.items.map((one) => one.id)).toEqual([made[0]]);
    expect(second.next).toBeNull();
    expect(listings.shares(owner, {}).items[0]?.id).toBe(onOther);
    expect(listings.shares(sam, {}).items).toHaveLength(1);
    expect(() => listings.shares(sam, { cursor: onOther })).toThrow();
  });
});
