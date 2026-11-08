import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { folderRoot } from './drive-fixture';

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
let directory: string;
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
  directory = await mkdtemp(join(tmpdir(), 'drive-tools-'));
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
  await rm(directory, { recursive: true, force: true });
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

  it('describes sharing, revoking and that nothing is deleted for good', () => {
    const editing = MCP_TOOLS.find((tool) => tool.name === 'drive_edit')?.description ?? '';
    expect(editing).toContain('share_create');
    expect(editing).toContain('revoke');
    expect(editing).toContain('never deleted for good');
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
    ['roots', 'listRoots'],
    ['stats', 'readDriveStats'],
    ['usage', 'readUsage'],
    ['health', 'readHealth'],
    ['sync', 'listSyncClients'],
    ['backup', 'readBackupState'],
    ['memories', 'listMemories'],
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

  it('refuses a sort field without a direction and a folder without a library folder', () => {
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

  it('reads the photo months, or one month when asked', async () => {
    await read('timeline', { filter: 'videos', placeId: 3 });
    expect(onlyCall()).toMatchObject({
      name: 'readTimelineBuckets',
      query: { filter: 'videos', placeId: 3 },
    });
    calls = [];
    await read('timeline', { month: '2026-07' });
    expect(onlyCall()).toMatchObject({
      name: 'readTimelinePage',
      params: { month: '2026-07' },
      query: { filter: 'all' },
    });
  });

  it('reads one item, album, memory, place, stack and version list by id', async () => {
    await read('item', { itemId: ITEM });
    await read('album', { albumId: ALBUM, cursor: 'n' });
    await read('memories', { memoryId: 'on-this-day' });
    await read('places', { placeId: 7 });
    await read('stacks', { stackId: FOLDER });
    await read('versions', { itemId: ITEM });
    expect(calls.map((call) => [call.name, call.params])).toEqual([
      ['readItem', { itemId: ITEM }],
      ['listAlbumItems', { albumId: ALBUM }],
      ['listMemoryItems', { memoryId: 'on-this-day' }],
      ['readPlace', { placeId: '7' }],
      ['readStack', { stackId: FOLDER }],
      ['listVersions', { itemId: ITEM }],
    ]);
    expect(calls[1]?.query).toEqual({ cursor: 'n' });
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
    await selected(DRIVE_READ, 'roots').run(own, {}, {});
    const [first] = calls;
    expect(first?.caller.kind === 'client' ? first.caller.client.role : null).toBe('member');
    expect(() => selected(DRIVE_READ, 'roots').run(own, {}, { personId: ownerProfile.id })).toThrow(
      /Only an owner may act for another person/u,
    );
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

  it('makes a manual album from every page of a memory', async () => {
    const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];
    answers.listMemoryItems = (call): unknown =>
      call.query['cursor'] === undefined
        ? { items: [image({ id: first }), image({ id: second })], next: 'p2' }
        : { items: [image({ id: third })], next: null };
    await edit('make_memory_album', { memoryId: 'day-out', title: 'Beach day' });
    expect(calls.map((call) => call.name)).toEqual([
      'listMemoryItems',
      'listMemoryItems',
      'createAlbum',
    ]);
    expect(calls[2]?.body).toEqual({
      kind: 'manual',
      title: 'Beach day',
      surface: 'photos',
      scope: 'person',
      itemIds: [first, second, third],
    });
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

  it('restores a version, settles a conflict, sets sync and starts a scrub', async () => {
    const versionId = randomUUID();
    await edit('version_restore', { itemId: ITEM, versionId });
    await edit('conflict_resolve', { conflictId: randomUUID(), resolution: 'keep_both' });
    await edit('sync_set', {
      sync: { clientId: randomUUID(), rootId: ROOT, enabled: true, selected: [] },
    });
    await edit('scrub_start');
    expect(calls.map((call) => call.name)).toEqual([
      'restoreVersion',
      'resolveConflict',
      'updateSyncClient',
      'startScrub',
    ]);
    expect(calls[0]?.params).toEqual({ itemId: ITEM, versionId });
  });

  it('adds and scans library folders and makes and changes albums', async () => {
    await edit('add_root', {
      root: {
        kind: 'folder',
        path: directory,
        label: 'Photos',
        scope: 'home',
        ownerProfileId: null,
        readOnly: true,
        versions: false,
        inPhotos: true,
        skipPatterns: [],
        includeHidden: false,
      },
    });
    await edit('scan', { rootId: ROOT });
    await edit('album_create', {
      album: { kind: 'manual', title: 'Trip', surface: 'photos', scope: 'person', itemIds: [ITEM] },
    });
    await edit('album_update', { albumId: ALBUM, changes: { title: 'Trip 2' } });
    expect(calls.map((call) => call.name)).toEqual([
      'addRoot',
      'scanRoot',
      'createAlbum',
      'updateAlbum',
    ]);
    expect(calls[3]).toMatchObject({ params: { albumId: ALBUM }, body: { title: 'Trip 2' } });
  });

  it('refuses a member the owner-only actions before any operation runs', () => {
    const own = memberContext('c');
    expect(() => selected(DRIVE_EDIT, 'scrub_start').run(own, {}, {})).toThrow(
      /Only an owner may use startScrub/u,
    );
    expect(() => selected(DRIVE_EDIT, 'scan').run(own, { rootId: ROOT }, {})).toThrow(
      /Only an owner may use scanRoot/u,
    );
    expect(calls).toEqual([]);
  });
});

describe('drive_edit attach_to_chat', () => {
  async function stored(name: string, bytes: Buffer): Promise<void> {
    await writeFile(join(directory, name), bytes);
    opened.store.driveRoots.insert(folderRoot(ROOT, directory));
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
