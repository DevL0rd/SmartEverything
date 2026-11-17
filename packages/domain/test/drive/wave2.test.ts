import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  CLIENT_PREFS,
  DRIVE_ACCESS_ANSWER,
  DRIVE_ACCESS_REQUEST,
  DRIVE_ACCESS_REQUEST_CREATE,
  DRIVE_BROWSE_PAGE,
  DRIVE_COMMENT,
  DRIVE_COMMENT_ADD,
  DRIVE_COMMENT_THREAD,
  DRIVE_COMMENTS_CHANGED_NOTICE,
  DRIVE_EDIT_ACTIONS,
  DRIVE_FILE_REQUEST,
  DRIVE_FILE_REQUEST_CHANGE,
  DRIVE_FILE_REQUEST_CREATE,
  DRIVE_FOLDER_COLOUR_SET,
  DRIVE_GRANT,
  DRIVE_GRANT_SET,
  DRIVE_HIT,
  DRIVE_ITEM,
  DRIVE_ITEM_LINK,
  DRIVE_ITEM_TEXT,
  DRIVE_LOCK_SET,
  DRIVE_NOTIFICATION,
  DRIVE_NOTIFICATION_NOTICE,
  DRIVE_NOTIFICATIONS_READ,
  DRIVE_OFFLINE_ITEM,
  DRIVE_OFFLINE_REPORT,
  DRIVE_OPEN_ITEM,
  DRIVE_PROGRESS_NOTICE,
  DRIVE_QUERY,
  DRIVE_QUERY_PAGE,
  DRIVE_READ_VIEWS,
  DRIVE_SETTINGS,
  DRIVE_SETTINGS_UPDATE,
  DRIVE_SHORTCUT,
  DRIVE_SHORTCUT_CREATE,
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  DRIVE_SUGGESTION,
  DRIVE_TRANSFER,
  DRIVE_ZIP_PAGE,
  LIVE_NOTICE,
  LIVE_TABLES,
  MEDIA_PATHS,
  PUSH_COMMAND_TTL_SECONDS,
  PUSH_COMMANDS,
  PUSH_COMMANDS_OVER_LIVE,
  ROW_CHANGE,
  TABLE_AREAS,
  TABLE_ROWS,
  buildPath,
  endpointAccessArea,
  matchPath,
  mcpOperationArea,
} from '../../src';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const AT = '2026-11-07T10:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';
const PAST = '2001-01-01T00:00:00.000Z';

const FOLDER = {
  id: A,
  rootId: B,
  parentId: null,
  relPath: 'Trips',
  name: 'Trips',
  modifiedAt: AT,
  addedAt: AT,
  openedAt: null,
  starred: false,
  shared: false,
  locked: false,
  lockedHere: false,
  openComments: 0,
  rev: 1,
  etag: '1-abc',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  kind: 'folder',
  childCount: 2,
  bytes: 10,
  totalBytes: 10,
  totalFiles: 2,
  colour: null,
  iconHint: false,
};

const FILE = {
  ...FOLDER,
  id: C,
  relPath: 'a.txt',
  name: 'a.txt',
  kind: 'document',
  mime: 'text/plain',
  bytes: 5,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
  colour: undefined,
  iconHint: undefined,
  childCount: undefined,
  totalBytes: undefined,
  totalFiles: undefined,
};

const FILE_ITEM = Object.fromEntries(
  Object.entries(FILE).filter(([, value]) => value !== undefined),
);

describe('the item fields of wave 2', () => {
  it('gives folders a personal colour and an icon hint and files neither', () => {
    expect(DRIVE_ITEM.safeParse(FOLDER).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...FOLDER, colour: 'viz-8' }).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...FOLDER, colour: 'viz-9' }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...FOLDER, colour: '#ff0000' }).success).toBe(false);
    const { colour: _colour, ...withoutColour } = FOLDER;
    expect(DRIVE_ITEM.safeParse(withoutColour).success).toBe(false);
    expect(DRIVE_ITEM.safeParse(FILE_ITEM).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...FILE_ITEM, colour: null }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...FILE_ITEM, iconHint: true }).success).toBe(false);
  });

  it('needs the lock flag and a count of open comments on every item', () => {
    const { locked: _locked, ...withoutLock } = FILE_ITEM;
    const { openComments: _open, ...withoutComments } = FILE_ITEM;
    expect(DRIVE_ITEM.safeParse(withoutLock).success).toBe(false);
    expect(DRIVE_ITEM.safeParse(withoutComments).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...FILE_ITEM, locked: true, openComments: 3 }).success).toBe(
      true,
    );
    expect(DRIVE_ITEM.safeParse({ ...FILE_ITEM, openComments: -1 }).success).toBe(false);
  });

  it('sets a folder colour or a lock with exactly the item and the value', () => {
    expect(DRIVE_FOLDER_COLOUR_SET.safeParse({ itemId: A, colour: 'viz-1' }).success).toBe(true);
    expect(DRIVE_FOLDER_COLOUR_SET.safeParse({ itemId: A, colour: null }).success).toBe(true);
    expect(DRIVE_FOLDER_COLOUR_SET.safeParse({ itemId: A }).success).toBe(false);
    expect(DRIVE_LOCK_SET.safeParse({ itemId: A, locked: true }).success).toBe(true);
    expect(DRIVE_LOCK_SET.safeParse({ itemId: A }).success).toBe(false);
  });

  it('gives an item link a download link that is null when the viewer may only view', () => {
    const media = { url: '/media/drive/x/file', expiresAt: AT };
    const link = {
      itemId: A,
      rev: 1,
      file: media,
      download: null,
      icon: null,
      thumb: null,
      preview: null,
      playable: null,
    };
    expect(DRIVE_ITEM_LINK.safeParse(link).success).toBe(true);
    expect(DRIVE_ITEM_LINK.safeParse({ ...link, download: media, icon: media }).success).toBe(true);
    const { download: _download, ...without } = link;
    expect(DRIVE_ITEM_LINK.safeParse(without).success).toBe(false);
  });

  it('browses with the shortcuts of the folder next to its items', () => {
    const page = { folder: null, items: [], shortcuts: [], next: null };
    expect(DRIVE_BROWSE_PAGE.safeParse(page).success).toBe(true);
    const { shortcuts: _shortcuts, ...without } = page;
    expect(DRIVE_BROWSE_PAGE.safeParse(without).success).toBe(false);
  });
});

describe('expiring access', () => {
  const grant = { id: A, itemId: B, profileId: C, role: 'view', grantedBy: D, createdAt: AT };

  it('stores when a grant ends or null for never', () => {
    expect(DRIVE_GRANT.safeParse({ ...grant, expiresAt: null }).success).toBe(true);
    expect(DRIVE_GRANT.safeParse({ ...grant, expiresAt: FUTURE }).success).toBe(true);
    expect(DRIVE_GRANT.safeParse(grant).success).toBe(false);
  });

  it('only sets an end that is still ahead', () => {
    const set = { itemId: A, profileId: B, role: 'edit' };
    expect(DRIVE_GRANT_SET.safeParse({ ...set, expiresAt: FUTURE }).success).toBe(true);
    expect(DRIVE_GRANT_SET.safeParse({ ...set, expiresAt: null }).success).toBe(true);
    expect(DRIVE_GRANT_SET.safeParse({ ...set, expiresAt: PAST }).success).toBe(false);
    expect(DRIVE_GRANT_SET.safeParse(set).success).toBe(false);
  });
});

describe('search inside files', () => {
  const query = {
    text: 'invoice',
    match: 'all',
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
    cursor: null,
  };
  const open = DRIVE_SNIPPET_OPEN;
  const close = DRIVE_SNIPPET_CLOSE;

  it('matches everything or names only and needs the choice', () => {
    expect(DRIVE_QUERY.safeParse(query).success).toBe(true);
    expect(DRIVE_QUERY.safeParse({ ...query, match: 'names' }).success).toBe(true);
    expect(DRIVE_QUERY.safeParse({ ...query, match: 'contents' }).success).toBe(false);
    const { match: _match, ...without } = query;
    expect(DRIVE_QUERY.safeParse(without).success).toBe(false);
  });

  it('marks highlights with two control characters that must open and close in turn', () => {
    expect(open).toBe('\u0002');
    expect(close).toBe('\u0003');
    const hit = { itemId: A, where: 'text' };
    expect(DRIVE_HIT.safeParse({ ...hit, snippet: `see ${open}invoice${close} 12` }).success).toBe(
      true,
    );
    expect(DRIVE_HIT.safeParse({ ...hit, snippet: `see ${open}invoice 12` }).success).toBe(false);
    expect(DRIVE_HIT.safeParse({ ...hit, snippet: `see invoice${close} 12` }).success).toBe(false);
    expect(
      DRIVE_HIT.safeParse({ ...hit, snippet: `${open}a${open}b${close}${close}` }).success,
    ).toBe(false);
  });

  it('gives a name hit no snippet and a text or image text hit one', () => {
    expect(DRIVE_HIT.safeParse({ itemId: A, where: 'name', snippet: null }).success).toBe(true);
    expect(DRIVE_HIT.safeParse({ itemId: A, where: 'name', snippet: 'x' }).success).toBe(false);
    expect(DRIVE_HIT.safeParse({ itemId: A, where: 'text', snippet: null }).success).toBe(false);
    expect(DRIVE_HIT.safeParse({ itemId: A, where: 'image_text', snippet: 'x' }).success).toBe(
      true,
    );
    expect(DRIVE_HIT.safeParse({ itemId: A, where: 'pixels', snippet: 'x' }).success).toBe(false);
  });

  it('returns exactly one hit for each item of the page', () => {
    const hit = { itemId: C, where: 'name', snippet: null };
    expect(
      DRIVE_QUERY_PAGE.safeParse({ items: [FILE_ITEM], hits: [hit], next: null }).success,
    ).toBe(true);
    expect(DRIVE_QUERY_PAGE.safeParse({ items: [FILE_ITEM], hits: [], next: null }).success).toBe(
      false,
    );
    expect(
      DRIVE_QUERY_PAGE.safeParse({ items: [FILE_ITEM], hits: [hit, hit], next: null }).success,
    ).toBe(false);
    expect(
      DRIVE_QUERY_PAGE.safeParse({
        items: [FILE_ITEM],
        hits: [{ ...hit, itemId: A }],
        next: null,
      }).success,
    ).toBe(false);
    expect(DRIVE_QUERY_PAGE.safeParse({ items: [], hits: [], next: null }).success).toBe(true);
  });

  it('reads the text of an item and carries it only when the read found some', () => {
    const read = { itemId: A, rev: 1, source: 'document', state: 'ok', reason: null, chars: 3 };
    expect(DRIVE_ITEM_TEXT.safeParse({ ...read, text: 'abc' }).success).toBe(true);
    expect(DRIVE_ITEM_TEXT.safeParse({ ...read, text: null }).success).toBe(false);
    expect(
      DRIVE_ITEM_TEXT.safeParse({ ...read, state: 'empty', chars: 0, text: 'x' }).success,
    ).toBe(false);
    expect(
      DRIVE_ITEM_TEXT.safeParse({
        ...read,
        source: null,
        state: 'pending',
        chars: 0,
        text: null,
      }).success,
    ).toBe(true);
  });

  it('lets the owner turn content indexing off and has no OCR languages', () => {
    const settings = {
      uploadExpiryDays: 7,
      membersMayShare: false,
      duplicatesHashing: true,
      indexingPaused: false,
      contentIndexing: true,
      fileIoThreads: 8,
      cpuWorkers: 4,
      listingCacheSeconds: 300,
    };
    expect(DRIVE_SETTINGS.safeParse(settings).success).toBe(true);
    expect(DRIVE_SETTINGS.safeParse({ ...settings, ocrLanguages: ['eng'] }).success).toBe(false);
    const { contentIndexing: _indexing, ...without } = settings;
    expect(DRIVE_SETTINGS.safeParse(without).success).toBe(false);
    expect(DRIVE_SETTINGS_UPDATE.safeParse({ contentIndexing: false }).success).toBe(true);
    expect(DRIVE_SETTINGS_UPDATE.safeParse({ ocrLanguages: ['deu'] }).success).toBe(false);
  });

  it('reports the text phase of the background work', () => {
    expect(
      DRIVE_PROGRESS_NOTICE.safeParse({
        type: 'drive_progress',
        rootId: A,
        phase: 'text',
        done: 1,
        total: 2,
      }).success,
    ).toBe(true);
  });
});

describe('zip contents', () => {
  const entry = {
    index: 0,
    path: 'a/b.txt',
    name: 'b.txt',
    folder: false,
    bytes: 4,
    compressedBytes: 3,
    modifiedAt: null,
    encrypted: false,
    kind: 'document',
  };
  const totals = { files: 1, folders: 0, bytes: 4, compressedBytes: 3 };

  it('lists entries in archive order with their sizes and whether they are locked', () => {
    expect(DRIVE_ZIP_PAGE.safeParse({ items: [entry], next: null, totals }).success).toBe(true);
    expect(
      DRIVE_ZIP_PAGE.safeParse({ items: [{ ...entry, encrypted: true }], next: 'c', totals })
        .success,
    ).toBe(true);
    expect(
      DRIVE_ZIP_PAGE.safeParse({ items: [{ ...entry, index: -1 }], next: null, totals }).success,
    ).toBe(false);
    expect(DRIVE_ZIP_PAGE.safeParse({ items: [entry], next: null }).success).toBe(false);
  });

  it('gives a folder entry the folder kind and no other entry', () => {
    expect(
      DRIVE_ZIP_PAGE.safeParse({
        items: [{ ...entry, folder: true, kind: 'folder' }],
        next: null,
        totals,
      }).success,
    ).toBe(true);
    expect(
      DRIVE_ZIP_PAGE.safeParse({ items: [{ ...entry, folder: true }], next: null, totals }).success,
    ).toBe(false);
    expect(
      DRIVE_ZIP_PAGE.safeParse({ items: [{ ...entry, kind: 'folder' }], next: null, totals })
        .success,
    ).toBe(false);
  });

  it('asks for one entry by its index', () => {
    const { query } = API_ENDPOINTS.zipEntryLink;
    expect(query.parse({ index: '12' })).toStrictEqual({ index: 12 });
    expect(query.safeParse({ index: '-1' }).success).toBe(false);
    expect(query.safeParse({}).success).toBe(false);
    expect(API_ENDPOINTS.zipEntryLink.path).toBe('/api/drive/items/:itemId/zip/link');
    expect(buildPath(MEDIA_PATHS.driveZipEntry, { itemId: A, index: '3' })).toBe(
      `/media/drive/${A}/zip/3`,
    );
  });
});

describe('comments', () => {
  const comment = {
    id: A,
    itemId: B,
    authorProfileId: C,
    parentId: null,
    body: 'Looks good',
    mentions: [D],
    createdAt: AT,
    editedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    deleted: false,
  };
  const reply = { ...comment, id: D, parentId: A };

  it('keeps a deleted comment without its body and every other comment with one', () => {
    expect(DRIVE_COMMENT.safeParse(comment).success).toBe(true);
    expect(DRIVE_COMMENT.safeParse({ ...comment, body: null, deleted: true }).success).toBe(true);
    expect(DRIVE_COMMENT.safeParse({ ...comment, body: null }).success).toBe(false);
    expect(DRIVE_COMMENT.safeParse({ ...comment, deleted: true }).success).toBe(false);
  });

  it('resolves only the first comment of a thread and names who did', () => {
    const resolved = { ...comment, resolvedAt: AT, resolvedBy: B };
    expect(DRIVE_COMMENT.safeParse(resolved).success).toBe(true);
    expect(DRIVE_COMMENT.safeParse({ ...comment, resolvedAt: AT }).success).toBe(false);
    expect(DRIVE_COMMENT.safeParse({ ...reply, resolvedAt: AT, resolvedBy: B }).success).toBe(
      false,
    );
  });

  it('keeps replies under the comment that starts their thread', () => {
    expect(DRIVE_COMMENT_THREAD.safeParse({ root: comment, replies: [reply] }).success).toBe(true);
    expect(DRIVE_COMMENT_THREAD.safeParse({ root: comment, replies: [] }).success).toBe(true);
    expect(DRIVE_COMMENT_THREAD.safeParse({ root: reply, replies: [] }).success).toBe(false);
    expect(
      DRIVE_COMMENT_THREAD.safeParse({ root: comment, replies: [{ ...reply, parentId: C }] })
        .success,
    ).toBe(false);
    expect(
      DRIVE_COMMENT_THREAD.safeParse({ root: comment, replies: [{ ...reply, itemId: A }] }).success,
    ).toBe(false);
  });

  it('adds a comment with text and refuses empty text and extra fields', () => {
    const add = { body: 'Hi', parentId: null, mentions: [] };
    expect(DRIVE_COMMENT_ADD.safeParse(add).success).toBe(true);
    expect(DRIVE_COMMENT_ADD.safeParse({ ...add, body: '  ' }).success).toBe(false);
    expect(DRIVE_COMMENT_ADD.safeParse({ ...add, mentions: ['x'] }).success).toBe(false);
    expect(DRIVE_COMMENT_ADD.safeParse({ ...add, resolved: true }).success).toBe(false);
  });

  it('announces a changed thread list as a live notice', () => {
    const notice = { type: 'drive_comments_changed', itemId: A };
    expect(DRIVE_COMMENTS_CHANGED_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
  });
});

describe('shortcuts', () => {
  const shortcut = {
    id: A,
    rootId: B,
    parentId: null,
    name: 'Trips',
    createdBy: C,
    createdAt: AT,
  };

  it('shows the target when the viewer can open it and the reason when not', () => {
    expect(
      DRIVE_SHORTCUT.safeParse({ ...shortcut, target: { state: 'available', item: FOLDER } })
        .success,
    ).toBe(true);
    for (const reason of ['no_access', 'trashed']) {
      expect(
        DRIVE_SHORTCUT.safeParse({ ...shortcut, target: { state: 'unavailable', reason } }).success,
        reason,
      ).toBe(true);
    }
    expect(
      DRIVE_SHORTCUT.safeParse({ ...shortcut, target: { state: 'unavailable', reason: 'gone' } })
        .success,
    ).toBe(false);
    expect(
      DRIVE_SHORTCUT.safeParse({ ...shortcut, target: { state: 'available', item: null } }).success,
    ).toBe(false);
  });

  it('creates a shortcut at the top of a drive or inside a folder', () => {
    const create = { targetItemId: A, name: 'Trips' };
    expect(
      DRIVE_SHORTCUT_CREATE.safeParse({ ...create, place: { kind: 'drive', rootId: B } }).success,
    ).toBe(true);
    expect(
      DRIVE_SHORTCUT_CREATE.safeParse({ ...create, place: { kind: 'folder', folderId: B } })
        .success,
    ).toBe(true);
    expect(DRIVE_SHORTCUT_CREATE.safeParse({ ...create, place: { kind: 'item' } }).success).toBe(
      false,
    );
    expect(
      DRIVE_SHORTCUT_CREATE.safeParse({
        ...create,
        name: ' ',
        place: { kind: 'drive', rootId: B },
      }).success,
    ).toBe(false);
  });

  it('renames or moves a shortcut and refuses an empty change', () => {
    const { body } = API_ENDPOINTS.updateShortcut;
    expect(body.safeParse({ name: 'New' }).success).toBe(true);
    expect(body.safeParse({ place: { kind: 'folder', folderId: A } }).success).toBe(true);
    expect(body.safeParse({}).success).toBe(false);
  });
});

describe('access requests', () => {
  const request = {
    id: A,
    itemId: B,
    itemName: null,
    requesterProfileId: C,
    ownerProfileId: D,
    role: 'view',
    message: null,
    state: 'pending',
    answeredBy: null,
    answeredAt: null,
    expiresAt: null,
    createdAt: AT,
  };

  it('is answered only once and says by whom and when', () => {
    expect(DRIVE_ACCESS_REQUEST.safeParse(request).success).toBe(true);
    expect(
      DRIVE_ACCESS_REQUEST.safeParse({
        ...request,
        state: 'approved',
        answeredBy: D,
        answeredAt: AT,
      }).success,
    ).toBe(true);
    expect(DRIVE_ACCESS_REQUEST.safeParse({ ...request, state: 'declined' }).success).toBe(false);
    expect(DRIVE_ACCESS_REQUEST.safeParse({ ...request, answeredAt: AT }).success).toBe(false);
    expect(DRIVE_ACCESS_REQUEST.safeParse({ ...request, role: 'owner' }).success).toBe(false);
  });

  it('asks for a role with an optional message', () => {
    expect(
      DRIVE_ACCESS_REQUEST_CREATE.safeParse({ itemId: A, role: 'edit', message: 'Please' }).success,
    ).toBe(true);
    expect(
      DRIVE_ACCESS_REQUEST_CREATE.safeParse({ itemId: A, role: 'edit', message: ' ' }).success,
    ).toBe(false);
  });

  it('approves with a role and an end in the future, or declines with nothing', () => {
    expect(
      DRIVE_ACCESS_ANSWER.safeParse({ decision: 'approve', role: 'view', expiresAt: FUTURE })
        .success,
    ).toBe(true);
    expect(
      DRIVE_ACCESS_ANSWER.safeParse({ decision: 'approve', role: 'view', expiresAt: null }).success,
    ).toBe(true);
    expect(
      DRIVE_ACCESS_ANSWER.safeParse({ decision: 'approve', role: 'view', expiresAt: PAST }).success,
    ).toBe(false);
    expect(DRIVE_ACCESS_ANSWER.safeParse({ decision: 'approve' }).success).toBe(false);
    expect(DRIVE_ACCESS_ANSWER.safeParse({ decision: 'decline' }).success).toBe(true);
    expect(DRIVE_ACCESS_ANSWER.safeParse({ decision: 'decline', role: 'view' }).success).toBe(
      false,
    );
  });

  it('opens an item for someone with access and tells someone without whether they may ask', () => {
    for (const access of ['own', 'shared', 'edit', 'view']) {
      expect(DRIVE_OPEN_ITEM.safeParse({ access, item: FOLDER }).success, access).toBe(true);
    }
    expect(
      DRIVE_OPEN_ITEM.safeParse({ access: 'none', requestable: true, pendingRequest: null })
        .success,
    ).toBe(true);
    expect(
      DRIVE_OPEN_ITEM.safeParse({ access: 'none', requestable: false, pendingRequest: request })
        .success,
    ).toBe(true);
    expect(DRIVE_OPEN_ITEM.safeParse({ access: 'none', item: FOLDER }).success).toBe(false);
    expect(DRIVE_OPEN_ITEM.safeParse({ access: 'view' }).success).toBe(false);
  });
});

describe('file requests', () => {
  const request = {
    id: A,
    folderItemId: B,
    folderName: 'Receipts',
    createdBy: C,
    title: 'Send receipts',
    message: null,
    expiresAt: null,
    closedAt: null,
    uploads: 0,
    bytes: 0,
    createdAt: AT,
  };

  it('counts what arrived and says when it closes or ended', () => {
    expect(DRIVE_FILE_REQUEST.safeParse(request).success).toBe(true);
    expect(DRIVE_FILE_REQUEST.safeParse({ ...request, uploads: -1 }).success).toBe(false);
    expect(DRIVE_FILE_REQUEST.safeParse({ ...request, title: '' }).success).toBe(false);
  });

  it('only creates a request that ends in the future', () => {
    const create = { folderItemId: B, title: 'T', message: null };
    expect(DRIVE_FILE_REQUEST_CREATE.safeParse({ ...create, expiresAt: FUTURE }).success).toBe(
      true,
    );
    expect(DRIVE_FILE_REQUEST_CREATE.safeParse({ ...create, expiresAt: null }).success).toBe(true);
    expect(DRIVE_FILE_REQUEST_CREATE.safeParse({ ...create, expiresAt: PAST }).success).toBe(false);
  });

  it('changes the title, the message or the end and refuses an empty change', () => {
    expect(DRIVE_FILE_REQUEST_CHANGE.safeParse({ title: 'New' }).success).toBe(true);
    expect(DRIVE_FILE_REQUEST_CHANGE.safeParse({ message: null }).success).toBe(true);
    expect(DRIVE_FILE_REQUEST_CHANGE.safeParse({ expiresAt: null }).success).toBe(true);
    expect(DRIVE_FILE_REQUEST_CHANGE.safeParse({}).success).toBe(false);
    expect(DRIVE_FILE_REQUEST_CHANGE.safeParse({ expiresAt: PAST }).success).toBe(false);
  });

  it('serves the public upload page next to the share page', () => {
    expect(matchPath(MEDIA_PATHS.driveFileRequest, '/r/abc')).toStrictEqual({ token: 'abc' });
    expect(MEDIA_PATHS.driveFileRequest).not.toBe(MEDIA_PATHS.driveShare);
  });
});

describe('notifications', () => {
  const row = {
    id: A,
    profileId: B,
    kind: 'shared',
    itemId: C,
    actorProfileId: D,
    actorName: null,
    refId: null,
    count: 1,
    createdAt: AT,
    updatedAt: AT,
    readAt: null,
  };

  it('knows every kind of the inbox and refuses another', () => {
    for (const kind of [
      'shared',
      'edited',
      'commented',
      'mentioned',
      'replied',
      'access_requested',
      'access_answered',
      'transfer_offered',
      'transfer_answered',
    ]) {
      expect(DRIVE_NOTIFICATION.safeParse({ ...row, kind }).success, kind).toBe(true);
    }
    expect(DRIVE_NOTIFICATION.safeParse({ ...row, kind: 'access_expiring' }).success).toBe(false);
  });

  it('names a person as the cause, except for an upload through a file request', () => {
    const upload = {
      ...row,
      kind: 'file_request_upload',
      actorProfileId: null,
      actorName: 'Grandma',
    };
    expect(DRIVE_NOTIFICATION.safeParse(upload).success).toBe(true);
    expect(DRIVE_NOTIFICATION.safeParse({ ...upload, actorName: null }).success).toBe(false);
    expect(DRIVE_NOTIFICATION.safeParse({ ...upload, actorProfileId: D }).success).toBe(false);
    expect(DRIVE_NOTIFICATION.safeParse({ ...row, actorProfileId: null }).success).toBe(false);
    expect(DRIVE_NOTIFICATION.safeParse({ ...row, actorName: 'x' }).success).toBe(false);
    expect(DRIVE_NOTIFICATION.safeParse({ ...row, count: 0 }).success).toBe(false);
  });

  it('marks some rows or all rows as read', () => {
    expect(DRIVE_NOTIFICATIONS_READ.safeParse({ ids: [A] }).success).toBe(true);
    expect(DRIVE_NOTIFICATIONS_READ.safeParse({ all: true }).success).toBe(true);
    expect(DRIVE_NOTIFICATIONS_READ.safeParse({ ids: [] }).success).toBe(false);
    expect(DRIVE_NOTIFICATIONS_READ.safeParse({ all: false }).success).toBe(false);
    expect(DRIVE_NOTIFICATIONS_READ.safeParse({ ids: [A], all: true }).success).toBe(false);
  });

  it('announces a new row as a live notice for one person', () => {
    const notice = { type: 'drive_notification', profileId: A };
    expect(DRIVE_NOTIFICATION_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
  });

  it('lets a person choose which kinds also push and starts with every kind', () => {
    const { defaultValue, schema } = CLIENT_PREFS.drive_notifications;
    expect(defaultValue.pushKinds).toHaveLength(10);
    expect(schema.safeParse({ pushKinds: ['mentioned'] }).success).toBe(true);
    expect(schema.safeParse({ pushKinds: [] }).success).toBe(true);
    expect(schema.safeParse({ pushKinds: ['mentioned', 'mentioned'] }).success).toBe(false);
    expect(schema.safeParse({ pushKinds: ['spam'] }).success).toBe(false);
  });
});

describe('ownership transfer', () => {
  const transfer = {
    id: A,
    itemId: B,
    itemName: 'Trips',
    itemKind: 'folder',
    bytes: 10,
    fromProfileId: C,
    toProfileId: D,
    state: 'offered',
    createdAt: AT,
    answeredAt: null,
  };

  it('leaves an open offer unanswered and every other state answered', () => {
    expect(DRIVE_TRANSFER.safeParse(transfer).success).toBe(true);
    for (const state of ['accepted', 'declined', 'cancelled']) {
      expect(DRIVE_TRANSFER.safeParse({ ...transfer, state, answeredAt: AT }).success, state).toBe(
        true,
      );
      expect(DRIVE_TRANSFER.safeParse({ ...transfer, state }).success, state).toBe(false);
    }
    expect(DRIVE_TRANSFER.safeParse({ ...transfer, answeredAt: AT }).success).toBe(false);
  });

  it('moves an item to another person only', () => {
    expect(DRIVE_TRANSFER.safeParse({ ...transfer, toProfileId: C }).success).toBe(false);
  });

  it('answers by accepting or declining', () => {
    const { body } = API_ENDPOINTS.answerTransfer;
    expect(body.safeParse({ accept: true }).success).toBe(true);
    expect(body.safeParse({}).success).toBe(false);
  });
});

describe('suggested files', () => {
  const when = { item: FOLDER, at: AT };

  it('says why a file is suggested and who caused it when a person did', () => {
    expect(DRIVE_SUGGESTION.safeParse({ ...when, reason: 'opened' }).success).toBe(true);
    expect(DRIVE_SUGGESTION.safeParse({ ...when, reason: 'edited' }).success).toBe(true);
    for (const reason of ['edited_by', 'shared', 'commented', 'mentioned']) {
      expect(
        DRIVE_SUGGESTION.safeParse({ ...when, reason, actorProfileId: A }).success,
        reason,
      ).toBe(true);
      expect(DRIVE_SUGGESTION.safeParse({ ...when, reason }).success, reason).toBe(false);
    }
    expect(
      DRIVE_SUGGESTION.safeParse({ ...when, reason: 'opened', actorProfileId: A }).success,
    ).toBe(false);
    expect(DRIVE_SUGGESTION.safeParse({ ...when, reason: 'trending' }).success).toBe(false);
  });
});

describe('offline files', () => {
  const row = {
    clientId: A,
    itemId: B,
    profileId: C,
    state: 'waiting',
    bytes: 0,
    syncedRev: null,
    error: null,
    updatedAt: AT,
  };

  it('carries an error only when failed and a revision for a ready file', () => {
    expect(DRIVE_OFFLINE_ITEM.safeParse(row).success).toBe(true);
    expect(
      DRIVE_OFFLINE_ITEM.safeParse({ ...row, state: 'ready', bytes: 5, syncedRev: 2 }).success,
    ).toBe(true);
    expect(DRIVE_OFFLINE_ITEM.safeParse({ ...row, state: 'ready' }).success).toBe(false);
    expect(DRIVE_OFFLINE_ITEM.safeParse({ ...row, syncedRev: 2 }).success).toBe(true);
    expect(DRIVE_OFFLINE_ITEM.safeParse({ ...row, state: 'failed', error: 'x' }).success).toBe(
      true,
    );
    expect(DRIVE_OFFLINE_ITEM.safeParse({ ...row, state: 'failed' }).success).toBe(false);
    expect(DRIVE_OFFLINE_ITEM.safeParse({ ...row, error: 'x' }).success).toBe(false);
  });

  it('takes a phone report of ready and failed files, at least one', () => {
    const report = {
      clientId: A,
      items: [
        { itemId: B, state: 'ready', bytes: 5, rev: 2 },
        { itemId: C, state: 'failed', error: 'No space' },
      ],
    };
    expect(DRIVE_OFFLINE_REPORT.safeParse(report).success).toBe(true);
    expect(DRIVE_OFFLINE_REPORT.safeParse({ ...report, items: [] }).success).toBe(false);
    expect(
      DRIVE_OFFLINE_REPORT.safeParse({ ...report, items: [{ itemId: B, state: 'ready' }] }).success,
    ).toBe(false);
  });

  it('wakes a phone with the push command that names the changed items', () => {
    expect(PUSH_COMMANDS).toContain('drive_offline_changed');
    expect(PUSH_COMMANDS_OVER_LIVE).toContain('drive_offline_changed');
    expect(PUSH_COMMAND_TTL_SECONDS.drive_offline_changed).toBeGreaterThan(0);
  });
});

describe('the wave 2 endpoints', () => {
  const NAMES = [
    'listZipEntries',
    'zipEntryLink',
    'readItemText',
    'openItem',
    'setItemLock',
    'setFolderColour',
    'createShortcut',
    'updateShortcut',
    'removeShortcut',
    'listSuggested',
    'listComments',
    'addComment',
    'editComment',
    'resolveComment',
    'removeComment',
    'requestDriveAccess',
    'listDriveAccessRequests',
    'answerDriveAccessRequest',
    'createFileRequest',
    'listFileRequests',
    'updateFileRequest',
    'closeFileRequest',
    'listFileRequestUploads',
    'listNotifications',
    'markNotificationsRead',
    'offerTransfer',
    'listTransfers',
    'answerTransfer',
    'cancelTransfer',
    'listOffline',
    'setOffline',
    'reportOffline',
  ] as const;

  it('sit under /api/drive for members and belong to the Photos and Drive area', () => {
    for (const name of NAMES) {
      const endpoint = API_ENDPOINTS[name];
      expect(endpoint.path.startsWith('/api/drive/'), name).toBe(true);
      expect(endpoint.access, name).toBe('member');
      expect(mcpOperationArea(endpoint), name).toBe('drive');
      expect(endpointAccessArea(endpoint), name).toBe('drive');
    }
  });

  it('use each method and path once', () => {
    const seen = new Map<string, string>();
    for (const [name, endpoint] of Object.entries(API_ENDPOINTS)) {
      const key = `${endpoint.method} ${endpoint.path}`;
      expect(seen.get(key), `${name} repeats ${seen.get(key) ?? 'nothing'}`).toBeUndefined();
      seen.set(key, name);
    }
    for (const name of NAMES) {
      expect(seen.has(`${API_ENDPOINTS[name].method} ${API_ENDPOINTS[name].path}`), name).toBe(
        true,
      );
    }
  });

  it('page every list with an opaque cursor', () => {
    for (const name of [
      'listSuggested',
      'listComments',
      'listNotifications',
      'listTransfers',
      'listFileRequestUploads',
    ] as const) {
      expect(API_ENDPOINTS[name].query.safeParse({ cursor: 'c' }).success, name).toBe(true);
      expect(API_ENDPOINTS[name].query.safeParse({ cursor: '' }).success, name).toBe(false);
    }
    expect(API_ENDPOINTS.listDriveAccessRequests.query.safeParse({ box: 'waiting' }).success).toBe(
      true,
    );
    expect(API_ENDPOINTS.listDriveAccessRequests.query.safeParse({}).success).toBe(false);
    expect(API_ENDPOINTS.listDriveAccessRequests.query.safeParse({ box: 'all' }).success).toBe(
      false,
    );
    expect(API_ENDPOINTS.listOffline.query.safeParse({ clientId: A }).success).toBe(true);
    expect(API_ENDPOINTS.listFileRequests.query.safeParse({ folderItemId: A }).success).toBe(true);
  });

  it('name the thing they act on in the path', () => {
    expect(API_ENDPOINTS.resolveComment.params.safeParse({ commentId: A }).success).toBe(true);
    expect(API_ENDPOINTS.answerDriveAccessRequest.params.safeParse({ requestId: A }).success).toBe(
      true,
    );
    expect(API_ENDPOINTS.closeFileRequest.params.safeParse({ fileRequestId: A }).success).toBe(
      true,
    );
    expect(API_ENDPOINTS.cancelTransfer.params.safeParse({ transferId: A }).success).toBe(true);
    expect(API_ENDPOINTS.openItem.params.safeParse({ itemId: 'x' }).success).toBe(false);
  });

  it('hand out folder icons and zip entries as signed media paths', () => {
    expect(buildPath(MEDIA_PATHS.driveFolderIcon, { itemId: A })).toBe(`/media/drive/${A}/icon`);
    expect(matchPath(MEDIA_PATHS.driveZipEntry, `/media/drive/${A}/zip/7`)).toStrictEqual({
      itemId: A,
      index: '7',
    });
  });
});

describe('the wave 2 live tables', () => {
  it('stream five more tables of the Drive area, each with its row schema', () => {
    for (const table of [
      'drive_notifications',
      'drive_access_requests',
      'drive_file_requests',
      'drive_transfers',
      'drive_offline_items',
    ] as const) {
      expect(LIVE_TABLES, table).toContain(table);
      expect(TABLE_ROWS[table], table).toBeDefined();
      expect(TABLE_AREAS[table], table).toBe('drive');
    }
  });

  it('carries a notification row change through the live protocol', () => {
    const record = {
      id: A,
      profileId: B,
      kind: 'commented',
      itemId: C,
      actorProfileId: D,
      actorName: null,
      refId: null,
      count: 2,
      createdAt: AT,
      updatedAt: AT,
      readAt: null,
    };
    const change = {
      type: 'change',
      table: 'drive_notifications',
      operation: 'INSERT',
      record,
      oldRecord: null,
    };
    expect(ROW_CHANGE.parse(change)).toStrictEqual(change);
    expect(ROW_CHANGE.safeParse({ ...change, record: { ...record, kind: 'x' } }).success).toBe(
      false,
    );
  });
});

describe('the MCP coverage of wave 2', () => {
  it('reads every new view and edits every new action', () => {
    for (const view of [
      'zip',
      'text',
      'comments',
      'suggested',
      'notifications',
      'access_requests',
      'file_requests',
      'transfers',
      'offline',
    ]) {
      expect(DRIVE_READ_VIEWS, view).toContain(view);
    }
    for (const action of [
      'comment_add',
      'comment_edit',
      'comment_resolve',
      'comment_remove',
      'shortcut_create',
      'shortcut_update',
      'shortcut_remove',
      'access_request',
      'access_answer',
      'file_request_create',
      'file_request_update',
      'file_request_close',
      'lock_set',
      'folder_colour',
      'transfer_offer',
      'transfer_answer',
      'transfer_cancel',
      'notifications_read',
      'offline_set',
    ]) {
      expect(DRIVE_EDIT_ACTIONS, action).toContain(action);
    }
    expect(new Set(DRIVE_READ_VIEWS).size).toBe(DRIVE_READ_VIEWS.length);
    expect(new Set(DRIVE_EDIT_ACTIONS).size).toBe(DRIVE_EDIT_ACTIONS.length);
  });
});
