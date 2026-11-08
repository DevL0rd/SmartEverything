import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  DRIVE_ALBUM_CREATE,
  DRIVE_BROWSE_QUERY,
  DRIVE_CHANGED_NOTICE,
  DRIVE_PROGRESS_NOTICE,
  DRIVE_ROOT_ADD,
  DRIVE_ROOT_CHANGE,
  DRIVE_SHARE_UNLOCK,
  LIVE_CLIENT_MESSAGE,
  LIVE_NOTICE,
  LIVE_TABLES,
  MEDIA_PATHS,
  MCP_TOOL_AREA_LABELS,
  MCP_TOOL_AREAS,
  ROW_CHANGE,
  TABLE_ROWS,
  buildPath,
  endpointAccessArea,
  isHumanOnlyOperation,
  matchPath,
  mcpOperationArea,
  pageOf,
} from '../../src';
import { z } from 'zod';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const DRIVE_NAMES = [
  'listRoots',
  'addRoot',
  'updateRoot',
  'removeRoot',
  'scanRoot',
  'listVolumes',
  'listHostFolders',
  'browseFolder',
  'readItem',
  'itemLinks',
  'searchDrive',
  'changeDrive',
  'readRecent',
  'readDriveStats',
  'listDuplicates',
  'listAlbums',
  'listAlbumItems',
  'createAlbum',
  'updateAlbum',
  'removeAlbum',
  'listTrash',
  'listVersions',
  'listItemActivity',
  'restoreVersion',
  'listShares',
  'createShare',
  'revokeShare',
  'unlockShare',
  'readUsage',
  'listQuotas',
  'setQuota',
  'readHealth',
  'startScrub',
  'reportBackup',
  'readBackupStatus',
  'listConflicts',
  'resolveConflict',
  'listSyncClients',
  'updateSyncClient',
  'readDriveSettings',
  'updateDriveSettings',
] as const;

const OWNER_ONLY = [
  'addRoot',
  'updateRoot',
  'removeRoot',
  'scanRoot',
  'listVolumes',
  'listQuotas',
  'listHostFolders',
  'setQuota',
  'startScrub',
  'reportBackup',
  'readBackupStatus',
  'updateDriveSettings',
];

const ROOT = {
  kind: 'folder',
  path: '/data/photos',
  label: 'Photos',
  scope: 'home',
  ownerProfileId: null,
  readOnly: false,
  versions: true,
  inPhotos: true,
  skipPatterns: [],
  includeHidden: false,
};

describe('the drive endpoints', () => {
  it('registers every endpoint of the plan under /api/drive with the right access', () => {
    for (const name of DRIVE_NAMES) {
      const endpoint = API_ENDPOINTS[name];
      const outside = name === 'unlockShare';
      expect(endpoint.path.startsWith(outside ? '/s/' : '/api/drive/'), name).toBe(true);
      const expected = outside ? 'public' : OWNER_ONLY.includes(name) ? 'owner' : 'member';
      expect(endpoint.access, name).toBe(expected);
    }
  });

  it('lets a member read the drive settings and only the owner change them', () => {
    expect(API_ENDPOINTS.readDriveSettings.access).toBe('member');
    expect(API_ENDPOINTS.updateDriveSettings.access).toBe('owner');
  });

  it('belongs to the Photos & Drive area, except what is human only', () => {
    expect(MCP_TOOL_AREAS).toContain('drive');
    expect(MCP_TOOL_AREA_LABELS.drive).toBe('Photos & Drive');
    for (const name of DRIVE_NAMES) {
      expect(mcpOperationArea(API_ENDPOINTS[name]), name).toBe('drive');
      expect(endpointAccessArea(API_ENDPOINTS[name]), name).toBe('drive');
    }
    expect(isHumanOnlyOperation('unlockShare')).toBe(true);
    expect(isHumanOnlyOperation('createShare')).toBe(false);
  });

  it('keeps a share password out of every query string', () => {
    expect(API_ENDPOINTS.unlockShare.query.safeParse({ password: 'x' }).success).toBe(false);
    expect(DRIVE_SHARE_UNLOCK.safeParse({ password: 'secret' }).success).toBe(true);
    expect(DRIVE_SHARE_UNLOCK.safeParse({ password: '' }).success).toBe(false);
    expect(matchPath(MEDIA_PATHS.driveShare, '/s/abc')).toStrictEqual({ token: 'abc' });
    expect(API_ENDPOINTS.unlockShare.path).toBe(MEDIA_PATHS.driveShare);
    expect(API_ENDPOINTS.unlockShare.method).toBe('POST');
  });

  it('names the signed media paths with the item and the size', () => {
    expect(buildPath(MEDIA_PATHS.driveThumb, { itemId: A, size: 'thumb' })).toBe(
      `/media/drive/${A}/thumb/thumb`,
    );
    expect(buildPath(MEDIA_PATHS.driveFile, { itemId: A })).toBe(`/media/drive/${A}/file`);
  });

  it('pages every list that is not a live table with an opaque cursor', () => {
    const page = pageOf(z.number());
    expect(page.safeParse({ items: [1], next: null }).success).toBe(true);
    expect(page.safeParse({ items: [1], next: '' }).success).toBe(false);
    for (const name of ['listVersions', 'listItemActivity', 'listAlbumItems'] as const) {
      expect(API_ENDPOINTS[name].query.safeParse({ cursor: 'abc' }).success, name).toBe(true);
      expect(API_ENDPOINTS[name].query.safeParse({ cursor: '' }).success, name).toBe(false);
    }
    for (const name of ['listTrash', 'listDuplicates', 'listConflicts'] as const) {
      expect(API_ENDPOINTS[name].query.safeParse({ rootId: A, cursor: 'abc' }).success, name).toBe(
        true,
      );
    }
    expect(API_ENDPOINTS.listShares.query.safeParse({ itemId: A, cursor: 'c' }).success).toBe(true);
    expect(API_ENDPOINTS.readRecent.query.safeParse({ filter: 'opened' }).success).toBe(true);
    expect(API_ENDPOINTS.readRecent.query.safeParse({ filter: 'weekly' }).success).toBe(false);
  });
});

describe('the drive request bodies', () => {
  it('adds a folder or a disk and refuses a root that contradicts itself', () => {
    expect(DRIVE_ROOT_ADD.safeParse(ROOT).success).toBe(true);
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, kind: 'cameras' }).success).toBe(false);
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, scope: 'person' }).success).toBe(false);
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, scope: 'person', ownerProfileId: A }).success).toBe(
      true,
    );
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, ownerProfileId: A }).success).toBe(false);
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, readOnly: true, versions: true }).success).toBe(
      false,
    );
    expect(DRIVE_ROOT_ADD.safeParse({ ...ROOT, extra: 1 }).success).toBe(false);
  });

  it('changes a root only by naming something to change', () => {
    expect(DRIVE_ROOT_CHANGE.safeParse({}).success).toBe(false);
    expect(DRIVE_ROOT_CHANGE.safeParse({ label: 'Family', synced: true }).success).toBe(true);
    expect(DRIVE_ROOT_CHANGE.safeParse({ label: ' ' }).success).toBe(false);
  });

  it('browses with a sort field and a direction together or neither', () => {
    expect(DRIVE_BROWSE_QUERY.safeParse({ rootId: A }).success).toBe(true);
    expect(
      DRIVE_BROWSE_QUERY.safeParse({
        rootId: A,
        folderId: B,
        sortField: 'name',
        sortDirection: 'asc',
      }).success,
    ).toBe(true);
    expect(DRIVE_BROWSE_QUERY.safeParse({ rootId: A, sortField: 'name' }).success).toBe(false);
    expect(DRIVE_BROWSE_QUERY.safeParse({ rootId: A, sortDirection: 'asc' }).success).toBe(false);
    expect(DRIVE_BROWSE_QUERY.safeParse({ folderId: B }).success).toBe(false);
  });

  it('creates a manual album from files or a smart album from a rule', () => {
    expect(
      DRIVE_ALBUM_CREATE.safeParse({
        kind: 'manual',
        title: 'Trip',
        surface: 'photos',
        scope: 'person',
        itemIds: [A],
      }).success,
    ).toBe(true);
    expect(
      DRIVE_ALBUM_CREATE.safeParse({
        kind: 'smart',
        title: 'Videos',
        surface: 'drive',
        scope: 'home',
        rule: { match: 'all', rules: [{ kind: 'item_kind', itemKinds: ['video'] }] },
      }).success,
    ).toBe(true);
    expect(
      DRIVE_ALBUM_CREATE.safeParse({
        kind: 'smart',
        title: 'Videos',
        surface: 'drive',
        scope: 'home',
        itemIds: [],
      }).success,
    ).toBe(false);
    expect(
      DRIVE_ALBUM_CREATE.safeParse({
        kind: 'manual',
        title: ' ',
        surface: 'drive',
        scope: 'home',
        itemIds: [],
      }).success,
    ).toBe(false);
  });

  it('creates an album only with a known surface and lists one surface at a time', () => {
    expect(
      DRIVE_ALBUM_CREATE.safeParse({ kind: 'manual', title: 'Trip', scope: 'home', itemIds: [] })
        .success,
    ).toBe(false);
    expect(API_ENDPOINTS.listAlbums.query.safeParse({ surface: 'photos' }).success).toBe(true);
    expect(API_ENDPOINTS.listAlbums.query.safeParse({}).success).toBe(false);
    expect(API_ENDPOINTS.listAlbums.query.safeParse({ surface: 'files' }).success).toBe(false);
  });

  it('asks for links to at least one item', () => {
    expect(API_ENDPOINTS.itemLinks.body.safeParse({ itemIds: [] }).success).toBe(false);
    expect(API_ENDPOINTS.itemLinks.body.safeParse({ itemIds: [A] }).success).toBe(true);
  });
});

describe('the drive live tables and notices', () => {
  it('lists the three tables and gives each its row schema', () => {
    for (const table of ['drive_roots', 'drive_albums', 'drive_sync_clients'] as const) {
      expect(LIVE_TABLES).toContain(table);
      expect(TABLE_ROWS[table]).toBeDefined();
    }
    expect(LIVE_TABLES).not.toContain('drive_items');
  });

  it('carries a sync client row change through the live protocol', () => {
    const record = {
      clientId: A,
      rootId: B,
      deviceId: A,
      profileId: B,
      enabled: true,
      selected: [],
      lastSeq: 0,
      lastSeenAt: null,
      needBytes: 0,
      errors: [],
    };
    const change = {
      type: 'change',
      table: 'drive_sync_clients',
      operation: 'INSERT',
      record,
      oldRecord: null,
    };
    expect(ROW_CHANGE.parse(change)).toStrictEqual(change);
    expect(ROW_CHANGE.safeParse({ ...change, record: { ...record, extra: 1 } }).success).toBe(
      false,
    );
    const message = LIVE_CLIENT_MESSAGE.parse({
      type: 'subscribe',
      tables: ['drive_roots'],
      streams: [],
    });
    expect(message.type).toBe('subscribe');
    if (message.type !== 'subscribe') throw new Error('Expected a subscription message');
    expect(message.tables).toStrictEqual(['drive_roots']);
  });

  it('announces drive changes and progress as live notices', () => {
    const changed = {
      type: 'drive_changed',
      rootIds: [A],
      folderIds: [],
      albumIds: [B],
      months: [],
      cursor: 12,
    };
    expect(DRIVE_CHANGED_NOTICE.parse(changed)).toStrictEqual(changed);
    expect(LIVE_NOTICE.parse(changed)).toStrictEqual(changed);
    expect(DRIVE_CHANGED_NOTICE.safeParse({ ...changed, cursor: -1 }).success).toBe(false);
    const progress = { type: 'drive_progress', rootId: A, phase: 'hash', done: 3, total: 10 };
    expect(DRIVE_PROGRESS_NOTICE.parse(progress)).toStrictEqual(progress);
    expect(LIVE_NOTICE.parse(progress)).toStrictEqual(progress);
    expect(DRIVE_PROGRESS_NOTICE.safeParse({ ...progress, done: 11 }).success).toBe(false);
    expect(DRIVE_PROGRESS_NOTICE.safeParse({ ...progress, phase: 'rotate' }).success).toBe(false);
  });
});
