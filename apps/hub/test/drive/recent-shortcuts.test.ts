import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveRecentEntry } from '@smarteverything/domain';
import type { DriveActor } from '../../src/drive/access';
import { DriveDownloads } from '../../src/drive/download-zip';
import { DriveReadService } from '../../src/drive/service-read';
import { DriveShortcuts, type ShortcutActor } from '../../src/drive/social/shortcuts';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const MEMBER_ROOT = '0d000000-0000-4000-8000-000000000003';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000004';
const FOLDER = '0d000000-0000-4000-8000-0000000000f1';
const FILE = '0d000000-0000-4000-8000-0000000000f2';
const OTHER_FILE = '0d000000-0000-4000-8000-0000000000f3';
const LOCKED = '0d000000-0000-4000-8000-0000000000f5';
const LOCKED_FILE = '0d000000-0000-4000-8000-0000000000f6';

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
  addedByProfileId: null,
} as const;

function folder(id: string, rootId: string, relPath: string): void {
  opened.store.driveItems.write({
    item: {
      ...COMMON,
      id,
      rootId,
      parentId: null,
      relPath,
      name: relPath,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

function document(id: string, rootId: string, relPath: string, parentId: string | null): void {
  opened.store.driveItems.write({
    item: {
      ...COMMON,
      id,
      rootId,
      parentId,
      relPath,
      name: relPath.split('/').at(-1) ?? relPath,
      kind: 'document',
      mime: 'text/plain',
      bytes: 10,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

const asOwner = (): DriveActor => ({ profileId: ownerProfile });
const asMember = (): DriveActor => ({ profileId: memberProfile });
const memberVia = (via: ShortcutActor['via']): ShortcutActor => ({ ...asMember(), via });

function shortcuts(): DriveShortcuts {
  return new DriveShortcuts({ store: opened.store, context: opened.store.context, read: service });
}

function kinds(entries: readonly DriveRecentEntry[]): string[] {
  return entries.map((entry) => entry.kind);
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  otherProfile = store.profiles.create({ name: 'Ida' }).id;
  store.driveRoots.insert(sharedDriveRoot(HOME_ROOT));
  store.driveRoots.insert(personalDriveRoot(MEMBER_ROOT, memberProfile));
  store.driveRoots.insert(personalDriveRoot(OTHER_ROOT, otherProfile));
  folder(FOLDER, HOME_ROOT, 'Inbox');
  document(FILE, HOME_ROOT, 'readme.txt', null);
  document(OTHER_FILE, OTHER_ROOT, 'private.txt', null);
  folder(LOCKED, MEMBER_ROOT, '.locked');
  document(LOCKED_FILE, MEMBER_ROOT, '.locked/secret.txt', LOCKED);
  service = new DriveReadService(store);
});

afterEach(async () => {
  await opened.close();
});

describe('shortcuts in Recent', () => {
  it('lists a new shortcut under everything and added with who made it and how', () => {
    const made = shortcuts().create(memberVia('ai'), {
      targetItemId: FILE,
      name: 'Readme link',
      place: { kind: 'drive', rootId: MEMBER_ROOT },
    });
    const everything = service.readRecent(asMember(), { filter: 'everything' }).entries;
    expect(everything).toEqual([
      {
        kind: 'shortcut',
        shortcut: made,
        at: made.createdAt,
        actorProfileId: memberProfile,
        via: 'ai',
        deviceId: null,
      },
    ]);
    expect(kinds(service.readRecent(asMember(), { filter: 'added' }).entries)).toEqual([
      'shortcut',
    ]);
    expect(service.readRecent(asMember(), { filter: 'opened' }).entries).toEqual([]);
    expect(service.readRecent(asMember(), { filter: 'changed' }).entries).toEqual([]);
    expect(service.readRecent(asOwner(), { filter: 'everything' }).entries).toEqual([]);
  });

  it('leaves out a shortcut whose target the person can no longer open', () => {
    const grant = opened.store.driveGrants.set(
      { itemId: OTHER_FILE, profileId: memberProfile, role: 'view', expiresAt: null },
      otherProfile,
    );
    shortcuts().create(memberVia('app'), {
      targetItemId: OTHER_FILE,
      name: 'Shared note',
      place: { kind: 'drive', rootId: MEMBER_ROOT },
    });
    expect(kinds(service.readRecent(asMember(), { filter: 'added' }).entries)).toEqual([
      'shortcut',
    ]);
    opened.store.driveGrants.remove(grant.id);
    expect(service.readRecent(asMember(), { filter: 'added' }).entries).toEqual([]);
  });
});

describe('opened files', () => {
  it('records an open of a file the person can read and refuses folders and hidden files', () => {
    service.recordOpen(asMember(), FILE, '2026-11-08T00:00:00.000Z');
    expect(
      service
        .readRecent(asMember(), { filter: 'opened' })
        .entries.map((entry) => (entry.kind === 'opened' ? [entry.item.id, entry.at] : [])),
    ).toEqual([[FILE, '2026-11-08T00:00:00.000Z']]);
    expect(() => {
      service.recordOpen(asMember(), FOLDER, NOW);
    }).toThrow(/folder/);
    expect(() => {
      service.recordOpen(asMember(), OTHER_FILE, NOW);
    }).toThrow(/no such/);
    expect(service.readRecent(asOwner(), { filter: 'opened' }).entries).toEqual([]);
  });

  it('records an open when one file is prepared for download', async () => {
    const downloads = new DriveDownloads({
      store: opened.store,
      read: service,
      links: new MediaLinks((): Date => new Date(NOW)),
      now: (): Date => new Date('2026-11-09T00:00:00.000Z'),
      newId: (): string => 'ticket',
    });
    await downloads.prepare(asMember(), [FILE]);
    expect(
      service
        .readRecent(asMember(), { filter: 'opened' })
        .entries.map((entry) => (entry.kind === 'opened' ? entry.at : null)),
    ).toEqual(['2026-11-09T00:00:00.000Z']);
  });
});

describe('the Locked folder by id', () => {
  it('refuses its items unless the call opened the Locked folder', () => {
    expect(() => service.readItem(asMember(), LOCKED_FILE)).toThrow(/no such/);
    expect(() => service.readItem(asMember(), LOCKED)).toThrow(/no such/);
    expect(service.readItem({ ...asMember(), lockedFolder: 'open' }, LOCKED_FILE).id).toBe(
      LOCKED_FILE,
    );
  });
});

describe('file request uploads in Activity', () => {
  it('names the outsider who uploaded the file and nobody on later changes', () => {
    const { store } = opened;
    const request = store.driveFileRequests.create({
      folderItemId: FOLDER,
      createdBy: ownerProfile,
      title: 'Receipts',
      message: null,
      tokenHash: 'hash',
      expiresAt: null,
    });
    store.driveFileRequests.recordUpload({
      requestId: request.id,
      itemId: FILE,
      uploaderName: 'Kim',
      bytes: 10,
    });
    const append = (op: 'create' | 'update', via: 'share' | 'app', rev: number): void => {
      store.driveFeed.append({
        rootId: HOME_ROOT,
        itemId: FILE,
        op,
        rev,
        actorProfileId: via === 'share' ? null : ownerProfile,
        via,
        deviceId: null,
      });
    };
    append('create', 'share', 1);
    append('update', 'app', 2);
    const page = service.readActivity(asMember(), { from: '2026-10-01T00:00:00Z' });
    expect(page.items.map((entry) => [entry.row.op, entry.outsiderName])).toEqual([
      ['update', null],
      ['create', 'Kim'],
    ]);
  });
});
