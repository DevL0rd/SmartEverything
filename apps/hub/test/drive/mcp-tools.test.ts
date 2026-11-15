import { randomUUID } from 'node:crypto';
import {
  CHAT_WIDGET,
  CHAT_WIDGET_GUIDE,
  DRIVE_EDIT_ACTIONS,
  DRIVE_READ_VIEWS,
  MCP_ROUTES,
  MCP_TOOLS,
  chatWidgetKey,
  type ClientRow,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { toolNamed } from '../../src/extensions/mcp/tools';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import { CHANGED_BY } from '../../src/extensions/mcp/tools/settings';
import type { Store } from '../../src/store/store';
import { operatingContext, selected, type Answers, type Call } from './mcp-rig';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const ROOT = randomUUID();
const FOLDER = randomUUID();
const ITEM = randomUUID();
const ALBUM = randomUUID();

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

function onlyCall(): Call {
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  return only;
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
