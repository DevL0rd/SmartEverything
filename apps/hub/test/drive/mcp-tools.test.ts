import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  API_ENDPOINTS,
  CHAT_WIDGET,
  CHAT_WIDGET_GUIDE,
  DRIVE_EDIT_ACTIONS,
  DRIVE_READ_VIEWS,
  MCP_ROUTES,
  MCP_TOOLS,
  chatWidgetKey,
  type ClientRow,
  type DriveItem,
  type EndpointName,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { toolNamed } from '../../src/extensions/mcp/tools';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import { CHANGED_BY } from '../../src/extensions/mcp/tools/settings';
import {
  SelectionImages,
  type Selection,
  type SelectedToolDefinition,
} from '../../src/extensions/mcp/tools/selected-tool';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { DriveReadService } from '../../src/drive/service-read';
import { readDriveUsage } from '../../src/drive/usage';
import { actorOf, usageViewerOf } from '../../src/server/handlers/drive-services';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';

interface Call {
  readonly name: EndpointName;
  readonly caller: Caller;
  readonly params: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
}

const ROOT = randomUUID();
const FOLDER = randomUUID();
const ITEM = randomUUID();
const ALBUM = randomUUID();
const NOW = '2026-11-07T00:00:00.000Z';

let opened: TestStore;
let calls: Call[];
let answers: Partial<Record<EndpointName, (call: Call) => unknown>>;
let owner: ClientRow;
let ownerProfile: ProfileRow;
let context: OperatingContext;

function operating(client: ClientRow, profile: ProfileRow): OperatingContext {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: client.id, profileId: profile.id, chatId: null },
    operations: {
      run: (name, caller, input): Promise<unknown> => {
        API_ENDPOINTS[name].params.parse(input.params ?? {});
        const call = {
          name,
          caller,
          params: input.params ?? {},
          query: input.query ?? {},
          body: input.body,
        };
        calls.push(call);
        return Promise.resolve(answers[name]?.(call) ?? { ok: true });
      },
    },
  };
}

function selected(definition: SelectedToolDefinition, key: string): Selection {
  const found = definition.selections[key];
  if (found === undefined) throw new Error(`no selection ${key}`);
  return found;
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

describe('the drive tool pair', () => {
  it('is one read tool and one edit tool in the Photos and Drive area', () => {
    const tools = MCP_TOOLS.filter((tool) => tool.area === 'drive');
    expect(tools.map((tool) => [tool.name, tool.access])).toEqual([
      ['drive_read', 'read'],
      ['drive_edit', 'control'],
    ]);
    expect(MCP_ROUTES.get('drive_read')).toStrictEqual({ custom: true });
    expect(MCP_ROUTES.get('drive_edit')).toStrictEqual({ custom: true });
    expect(toolNamed('drive_read')?.listing.annotations.readOnlyHint).toBe(true);
    expect(toolNamed('drive_edit')?.listing.annotations.readOnlyHint).toBe(false);
  });

  it('has a selection for every view and action and none for permanent deletion', () => {
    expect(Object.keys(DRIVE_READ.selections).sort()).toEqual([...DRIVE_READ_VIEWS].sort());
    expect(Object.keys(DRIVE_EDIT.selections).sort()).toEqual([...DRIVE_EDIT_ACTIONS].sort());
    expect(DRIVE_EDIT_ACTIONS).not.toContain('delete_now');
    expect(DRIVE_EDIT.input.safeParse({ action: 'delete_now' }).success).toBe(false);
  });

  it('describes sharing, revoking, drives and that nothing is deleted for good', () => {
    const editing = MCP_TOOLS.find((tool) => tool.name === 'drive_edit')?.description ?? '';
    expect(editing).toContain('share_create');
    expect(editing).toContain('revoke');
    expect(editing).toContain('never deleted for good');
    expect(editing).toContain('share_people');
    expect(editing).toContain('Shared Drive');
    expect(editing).toContain('the owner’s AI included');
    const reading = MCP_TOOLS.find((tool) => tool.name === 'drive_read')?.description ?? '';
    expect(reading).toContain('Shared Drive');
    expect(reading).toContain('per-person space totals');
    expect(`${reading} ${editing}`.toLowerCase()).not.toContain('library folder');
  });

  it('points the library settings at drive_edit from settings_read', () => {
    expect(CHANGED_BY.drive_settings).toContain('drive_edit');
    expect(CHANGED_BY.drive_settings).toContain('updateDriveSettings');
  });
});

describe('the chat photos widget', () => {
  it('shows a photo, album, memory or month by id and is told apart by view', () => {
    const photo = CHAT_WIDGET.parse({ kind: 'photos', view: 'item', id: ITEM });
    const album = CHAT_WIDGET.parse({ kind: 'photos', view: 'album', id: ITEM });
    expect(chatWidgetKey(photo)).not.toBe(chatWidgetKey(album));
    expect(CHAT_WIDGET.parse({ kind: 'photos', view: 'month', id: '2026-07' })).toMatchObject({
      view: 'month',
    });
    expect(CHAT_WIDGET.safeParse({ kind: 'photos', view: 'trash', id: ITEM }).success).toBe(false);
    expect(CHAT_WIDGET_GUIDE.photos).toContain('drive_read');
  });
});

describe('drive_read', () => {
  it.each([
    ['drives', 'listRoots'],
    ['shared_with_me', 'listSharedWithMe'],
    ['shared_by_me', 'listSharedByMe'],
    ['stats', 'readDriveStats'],
    ['usage', 'readUsage'],
    ['health', 'readHealth'],
    ['placements', 'listPlacements'],
    ['backup', 'readBackupState'],
    ['places', 'listPlaces'],
  ] as const)('reads view %s through %s', async (view, name) => {
    await read(view);
    expect(onlyCall().name).toBe(name);
  });

  it('browses a folder with its sort and cursor', async () => {
    await read('folder', {
      rootId: ROOT,
      folderId: FOLDER,
      sortField: 'name',
      sortDirection: 'asc',
      cursor: 'c1',
    });
    expect(onlyCall()).toMatchObject({
      name: 'browseFolder',
      query: {
        rootId: ROOT,
        folderId: FOLDER,
        sortField: 'name',
        sortDirection: 'asc',
        cursor: 'c1',
      },
    });
  });

  it('refuses a sort field without a direction and a folder without a drive', () => {
    const folder = selected(DRIVE_READ, 'folder');
    expect(folder.issues({ rootId: ROOT, sortField: 'name' })).toContain('sortDirection');
    expect(folder.issues({})).toContain('rootId');
  });

  it('searches with filters and a newest-first sort when none is named', async () => {
    await read('search', { text: 'beach', kinds: ['image'], from: '2026-07-01', to: '2026-07-31' });
    expect(onlyCall()).toMatchObject({
      name: 'searchDrive',
      body: {
        text: 'beach',
        rootId: null,
        folderId: null,
        kinds: ['image'],
        starred: null,
        duration: null,
        taken: { from: '2026-07-01', to: '2026-07-31' },
        sort: { field: 'modifiedAt', direction: 'desc' },
        cursor: null,
      },
    });
  });

  it('reads one item, album, place, stack and version list by id', async () => {
    await read('item', { itemId: ITEM });
    await read('album', { albumId: ALBUM, cursor: 'n' });
    await read('places', { placeId: 7 });
    await read('stacks', { stackId: FOLDER });
    await read('versions', { itemId: ITEM });
    expect(calls.map((call) => [call.name, call.params])).toEqual([
      ['readItem', { itemId: ITEM }],
      ['listAlbumItems', { albumId: ALBUM }],
      ['readPlace', { placeId: '7' }],
      ['readStack', { stackId: FOLDER }],
      ['listVersions', { itemId: ITEM }],
    ]);
    expect(calls[1]?.query).toEqual({ cursor: 'n' });
  });

  it('reads the Photos Library by month with its scope, and one month with the same scope', async () => {
    await read('library', { text: 'beach', libraryFilter: 'videos', countryCode: 'NZ' });
    await read('library', { month: '2026-07', from: '2026-07-01', camera: 'Pixel', cursor: 'n' });
    await read('library');
    expect(calls.map((call) => [call.name, call.params, call.query])).toEqual([
      ['readLibraryBuckets', {}, { filter: 'videos', text: 'beach', countryCode: 'NZ' }],
      [
        'readLibraryPage',
        { month: '2026-07' },
        { filter: 'all', from: '2026-07-01', camera: 'Pixel', cursor: 'n' },
      ],
      ['readLibraryBuckets', {}, { filter: 'all' }],
    ]);
  });

  it('refuses a malformed Library month and a removed view', () => {
    expect(() => selected(DRIVE_READ, 'library').issues({ month: '2026-13' })).not.toThrow();
    expect(selected(DRIVE_READ, 'library').issues({ month: '2026-13' })).not.toBeNull();
    expect(Object.keys(DRIVE_READ.selections)).not.toContain('memories');
    expect(Object.keys(DRIVE_READ.selections)).not.toContain('timeline');
  });

  it('lists albums of one surface, recent files and conflicts', async () => {
    await read('albums');
    await read('recent', { filter: 'added' });
    await read('conflicts', { rootId: ROOT });
    expect(calls.map((call) => [call.name, call.query])).toEqual([
      ['listAlbums', { surface: 'photos' }],
      ['readRecent', { filter: 'added' }],
      ['listConflicts', { rootId: ROOT }],
    ]);
  });

  it('acts as the asking member and refuses acting for someone else', async () => {
    const own = memberContext('b');
    await selected(DRIVE_READ, 'drives').run(own, {}, {});
    const [first] = calls;
    expect(first?.caller.kind === 'client' ? first.caller.client.role : null).toBe('member');
    expect(() =>
      selected(DRIVE_READ, 'drives').run(own, {}, { personId: ownerProfile.id }),
    ).toThrow(/another person’s drive/u);
  });
});

describe('drive_edit', () => {
  it('changes files through one change call with the action named', async () => {
    await edit('new_folder', { parentId: FOLDER, name: 'Trips' });
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
      'rename',
      'move',
      'copy',
      'trash',
      'restore',
      'album_add',
      'album_remove',
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

  it('places and unplaces a drive folder on a computer', async () => {
    const placement = {
      deviceId: randomUUID(),
      rootId: ROOT,
      folderItemId: FOLDER,
      mode: 'synced',
      localPath: '/home/robin/Trips',
      enabled: true,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
    };
    await edit('placement_set', { placement });
    const placementId = randomUUID();
    await edit('placement_remove', { placementId });
    expect(calls.map((call) => call.name)).toEqual(['setPlacement', 'removePlacement']);
    expect(calls[0]?.body).toEqual(placement);
    expect(calls[1]?.params).toEqual({ placementId });
  });

  it('shares with a person, changes the role and stops sharing', async () => {
    const profileId = randomUUID();
    const grantId = randomUUID();
    await edit('share_people', { itemId: ITEM, recipientId: profileId, role: 'edit' });
    expect(onlyCall()).toMatchObject({
      name: 'setGrant',
      body: { itemId: ITEM, profileId, role: 'edit' },
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
