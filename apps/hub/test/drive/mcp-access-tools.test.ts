import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  type ClientRow,
  type DriveItem,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import type { Store } from '../../src/store/store';
import { operatingContext, selected, type Answers, type Call } from './mcp-rig';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { DriveReadService } from '../../src/drive/service-read';
import { readDriveUsage } from '../../src/drive/usage';
import { actorOf, usageViewerOf } from '../../src/server/handlers/drive-services';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';

const ROOT = randomUUID();
const ITEM = randomUUID();
const NOW = '2026-11-07T00:00:00.000Z';

let opened: TestStore;
let calls: Call[];
let answers: Answers;
let owner: ClientRow;
let ownerProfile: ProfileRow;
let context: OperatingContext;

function operating(client: ClientRow, profile: ProfileRow): OperatingContext {
  return operatingContext(
    {
      store: (): Store => opened.store,
      record: (call): void => {
        calls.push(call);
      },
      answers: (): Answers => answers,
    },
    client,
    profile,
  );
}

function read(view: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_READ, view).run(context, fields, {});
}

function edit(action: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_EDIT, action).run(context, fields, {});
}

function onlyCall(): Call {
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  return only;
}

function image(fields: Partial<Extract<DriveItem, { kind: 'image' }>> = {}): DriveItem {
  return {
    id: ITEM,
    rootId: ROOT,
    parentId: null,
    relPath: 'beach.png',
    name: 'beach.png',
    modifiedAt: NOW,
    addedAt: NOW,
    openedAt: null,
    starred: false,
    shared: false,
    locked: false,
    lockedHere: false,
    openComments: 0,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'image/png',
    bytes: 4,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    takenAt: null,
    width: 1,
    height: 1,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
    kind: 'image',
    ...fields,
  };
}

function memberContext(hash: string): OperatingContext {
  const member = opened.store.profiles.create({ name: 'Robin' });
  const paired = opened.store.clients.create({
    name: 'Robin phone',
    platform: 'android',
    role: 'member',
    tokenHash: hash.repeat(64),
  });
  return operating(opened.store.clients.useProfile(paired.id, member.id), member);
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  answers = {};
  ownerProfile = opened.store.profiles.first();
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  context = operating(owner, ownerProfile);
});

afterEach(async () => {
  await opened.close();
});

describe('the Locked folder and the AI', () => {
  it('reads and attaches no item inside it, even by id', async () => {
    opened.store.driveRoots.insert(sharedDriveRoot(ROOT));
    opened.store.driveItems.write({
      item: {
        id: ITEM,
        rootId: ROOT,
        parentId: null,
        relPath: '.locked/beach.png',
        name: 'beach.png',
        modifiedAt: NOW,
        addedAt: NOW,
        starred: false,
        shared: false,
        outside: false,
        addedByProfileId: null,
        remoteId: null,
        remoteRev: null,
        kind: 'document',
        mime: 'image/png',
        bytes: 4,
        sha256: null,
        integrity: 'unknown',
        thumb: { state: 'none' },
      },
      identity: { dev: '1', ino: '1' },
    });
    answers.readItem = (): unknown => image();
    await expect(edit('attach_to_chat', { itemId: ITEM })).rejects.toThrow(/no such file/u);
    expect(() => read('item', { itemId: ITEM })).toThrow(/no such file/u);
    expect(calls).toEqual([]);
  });
});

describe('the owner’s AI follows the access rule of every drive', () => {
  const SAM_DRIVE = randomUUID();
  const SAM_FILE = randomUUID();
  const SHARED_FILE = randomUUID();
  const HOME_DRIVE = randomUUID();
  let sam: ProfileRow;

  function real(client: ClientRow, profile: ProfileRow): OperatingContext {
    const reads = new DriveReadService(opened.store);
    const base = operating(client, profile);
    return {
      ...base,
      operations: {
        run: (name, caller): Promise<unknown> => {
          const actor = actorOf(opened.store, caller);
          if (name === 'readItem') return Promise.resolve(reads.readItem(actor, SAM_FILE));
          if (name === 'listRoots') return Promise.resolve(reads.listRoots(actor));
          return Promise.resolve(
            readDriveUsage(opened.store.driveQuotas, usageViewerOf(opened.store, caller)),
          );
        },
      },
    };
  }

  function put(rootId: string, id: string, name: string): void {
    opened.store.driveItems.write({
      item: {
        id,
        rootId,
        parentId: null,
        relPath: name,
        name,
        modifiedAt: NOW,
        addedAt: NOW,
        starred: false,
        shared: false,
        outside: false,
        addedByProfileId: rootId === SAM_DRIVE ? sam.id : null,
        remoteId: null,
        remoteRev: null,
        kind: 'document',
        mime: 'text/plain',
        bytes: 10,
        sha256: null,
        integrity: 'unknown',
        thumb: { state: 'none' },
      },
      identity: { dev: '1', ino: id.slice(-8) },
    });
  }

  beforeEach(() => {
    sam = opened.store.profiles.create({ name: 'Sam' });
    opened.store.driveRoots.insert(sharedDriveRoot(HOME_DRIVE));
    opened.store.driveRoots.insert(personalDriveRoot(randomUUID(), ownerProfile.id));
    opened.store.driveRoots.insert(personalDriveRoot(SAM_DRIVE, sam.id));
    put(SAM_DRIVE, SAM_FILE, 'diary.txt');
    put(HOME_DRIVE, SHARED_FILE, 'recipes.txt');
  });

  it('lists only the owner’s drive and the Shared Drive, never a member’s', async () => {
    const roots = API_ENDPOINTS.listRoots.response.parse(
      await selected(DRIVE_READ, 'drives').run(real(owner, ownerProfile), {}, {}),
    );
    expect(roots.map((root) => root.id)).toContain(HOME_DRIVE);
    expect(roots.map((root) => root.id)).not.toContain(SAM_DRIVE);
    expect(roots).toHaveLength(2);
  });

  it('refuses the owner’s AI on a member’s unshared item', () => {
    expect(() =>
      selected(DRIVE_READ, 'item').run(real(owner, ownerProfile), { itemId: SAM_FILE }, {}),
    ).toThrow();
  });

  it('gives the owner’s AI per-person totals through usage and the member only their own', async () => {
    const totals = API_ENDPOINTS.readUsage.response.parse(
      await selected(DRIVE_READ, 'usage').run(real(owner, ownerProfile), {}, {}),
    );
    expect(totals.map((row) => row.profileId)).toContain(sam.id);
    const own = { ...memberContext('d'), operations: real(owner, ownerProfile).operations };
    const mine = API_ENDPOINTS.readUsage.response.parse(
      await selected(DRIVE_READ, 'usage').run(own, {}, {}),
    );
    expect(mine).toHaveLength(1);
  });
});

describe('photo folders through the drive tools', () => {
  it('lists the photo folders', async () => {
    await read('photo_folders');
    expect(onlyCall().name).toBe('listPhotoFolders');
  });

  it('hides a folder and shows it again by its key and name', async () => {
    await edit('folder_hide', { folderKey: 'phone:DCIM/Camera', folderName: 'Camera' });
    await edit('folder_show', { folderKey: 'phone:DCIM/Camera', folderName: 'Camera' });
    expect(calls.map((call) => [call.name, call.body])).toEqual([
      ['setPhotoFolderHidden', { key: 'phone:DCIM/Camera', name: 'Camera', hidden: true }],
      ['setPhotoFolderHidden', { key: 'phone:DCIM/Camera', name: 'Camera', hidden: false }],
    ]);
  });

  it('reads one folder or the library with hidden folders included', async () => {
    await read('library', { folderKey: 'computer:/home/me/Pictures' });
    await read('library', { allFolders: true });
    expect(calls.map((call) => call.query)).toEqual([
      { filter: 'all', folder: 'computer:/home/me/Pictures' },
      { filter: 'all', folders: 'all' },
    ]);
  });

  it('refuses a key that names no kind of folder', () => {
    expect(
      selected(DRIVE_EDIT, 'folder_hide').issues({ folderKey: 'Camera', folderName: 'x' }),
    ).not.toBeNull();
  });
});
