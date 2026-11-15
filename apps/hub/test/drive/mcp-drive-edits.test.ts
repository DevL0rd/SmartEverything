import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  API_ENDPOINTS,
  DRIVE_EDIT_ACTIONS,
  DRIVE_READ_VIEWS,
  type ClientRow,
  type DriveItem,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import { SelectionImages } from '../../src/extensions/mcp/tools/selected-tool';
import type { Store } from '../../src/store/store';
import { operatingContext, selected, type Answers, type Call } from './mcp-rig';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { sharedDriveRoot } from '../store/drive-roots-fixture';

const ROOT = randomUUID();
const FOLDER = randomUUID();
const ITEM = randomUUID();
const ALBUM = randomUUID();
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

function edit(action: string, fields: Record<string, unknown> = {}): unknown {
  return selected(DRIVE_EDIT, action).run(context, fields, {});
}

function onlyCall(): Call {
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  return only;
}

function actionsOf(): string[] {
  return calls.map((call) => API_ENDPOINTS.changeDrive.body.parse(call.body).action);
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

describe('drive_edit', () => {
  it('changes files through one change call with the action named', async () => {
    await edit('new_folder', { parentId: FOLDER, name: 'Trips' });
    await edit('new_folder', { rootId: ROOT, name: 'Top' });
    await edit('rename', { itemId: ITEM, name: 'sunset.png' });
    await edit('move', { itemIds: [ITEM], toFolderId: FOLDER });
    await edit('copy', { itemIds: [ITEM], toFolderId: FOLDER });
    await edit('trash', { itemIds: [ITEM] });
    await edit('restore', { itemIds: [ITEM] });
    await edit('album_add', { albumId: ALBUM, itemIds: [ITEM] });
    await edit('album_remove', { albumId: ALBUM, itemIds: [ITEM] });
    expect(calls.every((call) => call.name === 'changeDrive')).toBe(true);
    expect(actionsOf()).toEqual([
      'new_folder',
      'new_folder',
      'rename',
      'move',
      'copy',
      'trash',
      'restore',
      'album_add',
      'album_remove',
    ]);
    expect(calls.slice(0, 2).map((call) => call.body)).toEqual([
      { action: 'new_folder', parent: { kind: 'folder', folderId: FOLDER }, name: 'Trips' },
      { action: 'new_folder', parent: { kind: 'drive', rootId: ROOT }, name: 'Top' },
    ]);
  });

  it('stars by default and removes the star when told', async () => {
    await edit('star', { itemIds: [ITEM] });
    await edit('star', { itemIds: [ITEM], starred: false });
    expect(actionsOf()).toEqual(['star', 'unstar']);
  });

  it('refuses an empty name and a move with no items', () => {
    expect(selected(DRIVE_EDIT, 'rename').issues({ itemId: ITEM, name: ' ' })).toContain('name');
    expect(selected(DRIVE_EDIT, 'move').issues({ itemIds: [], toFolderId: FOLDER })).toContain(
      'itemIds',
    );
  });

  it('keeps camera or AI pictures in the library', async () => {
    await edit('keep', { source: 'ai', itemIds: [ITEM] });
    expect(onlyCall()).toMatchObject({
      name: 'keepSourceItems',
      params: { source: 'ai' },
      body: { itemIds: [ITEM] },
    });
  });

  it('answers a new share with its link, end time and how to revoke it', async () => {
    const shareId = randomUUID();
    const expiresAt = '2026-11-14T00:00:00.000Z';
    answers.createShare = (): unknown => ({
      share: {
        id: shareId,
        itemId: ITEM,
        albumId: null,
        permission: 'view',
        expiresAt,
        hasPassword: false,
        createdBy: ownerProfile.id,
        revokedAt: null,
        opens: 0,
        downloads: 0,
        lastOpenedAt: null,
      },
      url: 'https://home.example.com/s/abc',
      public: true,
    });
    const answer = await edit('share_create', {
      share: { itemId: ITEM, permission: 'view', expiresAt, password: null },
    });
    expect(answer).toMatchObject({
      url: 'https://home.example.com/s/abc',
      expiresAt,
      revoke: { tool: 'drive_edit', action: 'share_revoke', shareId },
    });
    await edit('share_revoke', { shareId });
    expect(calls[1]).toMatchObject({ name: 'revokeShare', params: { shareId } });
  });

  it('restores a version, settles a conflict and starts a scrub', async () => {
    const versionId = randomUUID();
    await edit('version_restore', { itemId: ITEM, versionId });
    await edit('conflict_resolve', { conflictId: randomUUID(), resolution: 'keep_both' });
    await edit('scrub_start');
    expect(calls.map((call) => call.name)).toEqual([
      'restoreVersion',
      'resolveConflict',
      'startScrub',
    ]);
    expect(calls[0]?.params).toEqual({ itemId: ITEM, versionId });
  });

  it('syncs, mounts and unplaces on a computer', async () => {
    const deviceId = randomUUID();
    const placement = {
      deviceId,
      rootId: ROOT,
      folderItemId: FOLDER,
      localPath: '/home/robin/Trips',
      enabled: true,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
    };
    await edit('placement_set', { placement });
    await edit('mount_set', { mount: { deviceId, enabled: true } });
    const placementId = randomUUID();
    await edit('placement_remove', { placementId });
    expect(calls.map((call) => call.name)).toEqual([
      'setPlacement',
      'setComputerMount',
      'removePlacement',
    ]);
    expect(calls[0]?.body).toEqual(placement);
    expect(calls[1]?.body).toEqual({ deviceId, enabled: true });
    expect(calls[2]?.params).toEqual({ placementId });
  });

  it('shares with a person, changes the role and stops sharing', async () => {
    const profileId = randomUUID();
    const grantId = randomUUID();
    await edit('share_people', { itemId: ITEM, recipientId: profileId, role: 'edit' });
    expect(onlyCall()).toMatchObject({
      name: 'setGrant',
      body: { itemId: ITEM, profileId, role: 'edit', expiresAt: null },
    });
    calls = [];
    answers.listGrants = (): unknown => [
      {
        id: grantId,
        itemId: ITEM,
        profileId,
        role: 'edit',
        grantedBy: ownerProfile.id,
        createdAt: NOW,
        expiresAt: null,
      },
    ];
    await edit('share_people', { itemId: ITEM, recipientId: profileId, role: 'none' });
    expect(calls.map((call) => call.name)).toEqual(['listGrants', 'removeGrant']);
    expect(calls[1]?.params).toEqual({ grantId });
    await expect(
      edit('share_people', { itemId: ITEM, recipientId: randomUUID(), role: 'none' }),
    ).rejects.toThrow(/not shared with that person/u);
  });

  it('changes a drive and scans it, and has no way to add a folder or disk', async () => {
    await edit('configure', {
      rootId: ROOT,
      driveChanges: { versions: false, skipPatterns: ['*.tmp'] },
    });
    await edit('scan', { rootId: ROOT });
    expect(calls.map((call) => [call.name, call.params])).toEqual([
      ['updateRoot', { rootId: ROOT }],
      ['scanRoot', { rootId: ROOT }],
    ]);
    expect(calls[0]?.body).toEqual({ versions: false, skipPatterns: ['*.tmp'] });
    expect(DRIVE_EDIT_ACTIONS).not.toContain('add_root');
    expect(DRIVE_EDIT_ACTIONS).not.toContain('sync_set');
    expect(DRIVE_READ_VIEWS).not.toContain('sync');
  });

  it('makes and changes albums', async () => {
    await edit('album_create', {
      album: { kind: 'manual', title: 'Trip', surface: 'photos', scope: 'person', itemIds: [ITEM] },
    });
    await edit('album_update', { albumId: ALBUM, changes: { title: 'Trip 2' } });
    expect(calls.map((call) => call.name)).toEqual(['createAlbum', 'updateAlbum']);
    expect(calls[1]).toMatchObject({ params: { albumId: ALBUM }, body: { title: 'Trip 2' } });
  });

  it('refuses acting on another person’s drive, even for the owner’s AI', () => {
    const other = opened.store.profiles.create({ name: 'Sam' });
    expect(() =>
      selected(DRIVE_READ, 'folder').run(context, { rootId: ROOT }, { personId: other.id }),
    ).toThrow(/nobody, the owner included/u);
    expect(() =>
      selected(DRIVE_EDIT, 'trash').run(context, { itemIds: [ITEM] }, { personId: other.id }),
    ).toThrow(/nobody, the owner included/u);
    expect(calls).toEqual([]);
  });

  it('acts for the asking person when the person is named as themselves', async () => {
    await selected(DRIVE_READ, 'drives').run(context, {}, { personId: ownerProfile.id });
    expect(onlyCall().name).toBe('listRoots');
  });

  it('refuses a member the owner-only action before any operation runs', () => {
    const own = memberContext('c');
    expect(() => selected(DRIVE_EDIT, 'scrub_start').run(own, {}, {})).toThrow(
      /Only an owner may use startScrub/u,
    );
    expect(calls).toEqual([]);
  });
});

describe('drive_edit attach_to_chat', () => {
  async function stored(name: string, bytes: Buffer): Promise<void> {
    await mkdir(opened.layout.home.drive, { recursive: true });
    await writeFile(join(opened.layout.home.drive, name), bytes);
    opened.store.driveRoots.insert(sharedDriveRoot(ROOT));
  }

  it('hands the picture over so the AI can look at it', async () => {
    const png = Buffer.from([137, 80, 78, 71]);
    await stored('beach.png', png);
    answers.readItem = (): unknown => image({ bytes: png.length });
    const shown = await edit('attach_to_chat', { itemId: ITEM });
    expect(shown).toBeInstanceOf(SelectionImages);
    expect(shown).toMatchObject({
      result: { itemId: ITEM, name: 'beach.png', mime: 'image/png', bytes: 4 },
      images: [{ data: png.toString('base64'), mimeType: 'image/png' }],
    });
    expect(onlyCall()).toMatchObject({ name: 'readItem', params: { itemId: ITEM } });
  });

  it('says plainly why another format, a large picture or a missing file cannot be shown', async () => {
    await stored('beach.png', Buffer.from([1]));
    answers.readItem = (): unknown => image({ mime: 'image/heic' });
    await expect(edit('attach_to_chat', { itemId: ITEM })).rejects.toThrow(/cannot be shown/u);
    answers.readItem = (): unknown => image({ bytes: 5 * 1024 * 1024 });
    await expect(edit('attach_to_chat', { itemId: ITEM })).rejects.toThrow(/larger than 4 MB/u);
    answers.readItem = (): unknown => image({ relPath: 'gone.png' });
    await expect(edit('attach_to_chat', { itemId: ITEM })).rejects.toThrow(
      /not available on disk/u,
    );
  });
});
