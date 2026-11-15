import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  COMPUTER_FILES_CHANGED_NOTICE,
  COMPUTER_TOPICS,
  DRIVE_DOWNLOAD,
  FILE_ABILITIES,
  FILE_ENTRY,
  FILE_PLACES,
  FILE_SEARCH_RESULT,
  FILE_TOOL_CHANGE,
  FILE_TRASH_LIST,
  FILE_WRITE_CHANGE,
  HUB_FRAME,
  LIVE_NOTICE,
  MEDIA_PATHS,
  NODE_FRAME,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  STATE_TOPICS,
  WATCH_DEMAND,
  NODE_DEMAND,
  mcpToolOperation,
} from '../src';

const ENTRY = {
  name: 'a.txt',
  path: '/home/dana/a.txt',
  kind: 'file',
  mime: 'text/plain',
  size: 3,
  modifiedAt: '2026-11-15T10:00:00.000Z',
  hidden: false,
};

const DEVICE = '3f2b8f1c-5d0a-4d8e-9a43-0a6f0f9a3b11';

describe('computer file entries and listing order', () => {
  it('carry the mime type, or null when none is known', () => {
    expect(FILE_ENTRY.parse(ENTRY).mime).toBe('text/plain');
    expect(FILE_ENTRY.parse({ ...ENTRY, mime: null }).mime).toBeNull();
    expect(FILE_ENTRY.safeParse({ ...ENTRY, mime: '' }).success).toBe(false);
    const { mime: _mime, ...without } = ENTRY;
    expect(FILE_ENTRY.safeParse(without).success).toBe(false);
  });

  it('take a sort field and a direction together or not at all', () => {
    const { query } = API_ENDPOINTS.listComputerFiles;
    expect(query.safeParse({ sort: 'size', direction: 'desc' }).success).toBe(true);
    expect(query.safeParse({}).success).toBe(true);
    expect(query.safeParse({ sort: 'size' }).success).toBe(false);
    expect(query.safeParse({ direction: 'asc' }).success).toBe(false);
    expect(query.safeParse({ sort: 'kind', direction: 'asc' }).success).toBe(false);
  });

  it('pass the sort to the computer in the files request', () => {
    expect(
      NODE_REQUEST.parse({
        verb: 'files',
        path: null,
        cursor: 0,
        sort: { field: 'modifiedAt', direction: 'desc' },
      }),
    ).toMatchObject({ sort: { field: 'modifiedAt' } });
    expect(NODE_REQUEST.parse({ verb: 'files', path: null, cursor: 0 })).toMatchObject({
      verb: 'files',
    });
  });
});

describe('computer places', () => {
  it('say what the computer can do with files and may include its Trash', () => {
    const places = FILE_PLACES.parse({
      home: '/home/dana',
      abilities: [...FILE_ABILITIES],
      places: [{ label: 'Trash', path: '/home/dana/.local/share/Trash/files', kind: 'trash' }],
    });
    expect(places.abilities).toHaveLength(9);
    expect(
      FILE_PLACES.safeParse({ home: '/home/dana', abilities: ['sudo'], places: [] }).success,
    ).toBe(false);
    expect(FILE_PLACES.safeParse({ home: '/home/dana', places: [] }).success).toBe(false);
  });
});

describe('computer links', () => {
  it('answer a file link and a thumbnail link, or no thumbnail', () => {
    const link = {
      url: '/media/computers/d/file?path=%2Fa&expires=1&signature=x',
      expiresAt: '2026-11-15T10:00:00.000Z',
    };
    const { response } = API_ENDPOINTS.computerFileLinks;
    expect(response.parse({ path: '/a', file: link, thumb: null }).thumb).toBeNull();
    expect(response.parse({ path: '/a', file: link, thumb: link }).thumb).toStrictEqual(link);
    expect(response.safeParse({ path: '/a', file: link }).success).toBe(false);
    expect(API_ENDPOINTS.computerFileLinks.access).toBe('member');
    expect(MEDIA_PATHS.computerFile).toBe('/media/computers/:deviceId/file');
    expect(MEDIA_PATHS.computerThumb).toBe('/media/computers/:deviceId/thumb');
  });
});

describe('computer zip contents', () => {
  it('use the drive zip page and an entry link with a media path', () => {
    const entry = {
      index: 0,
      path: 'a/b.txt',
      name: 'b.txt',
      folder: false,
      bytes: 3,
      compressedBytes: 3,
      modifiedAt: null,
      encrypted: false,
      kind: 'document',
    };
    const page = {
      items: [entry],
      next: null,
      totals: { files: 1, folders: 0, bytes: 3, compressedBytes: 3 },
    };
    expect(API_ENDPOINTS.listComputerZipEntries.response.parse(page).items).toHaveLength(1);
    expect(API_ENDPOINTS.listComputerZipEntries.query.safeParse({ path: '/a.zip' }).success).toBe(
      true,
    );
    expect(
      API_ENDPOINTS.computerZipEntryLink.query.safeParse({ path: '/a.zip', index: '2' }),
    ).toMatchObject({
      success: true,
      data: { index: 2 },
    });
    expect(API_ENDPOINTS.computerZipEntryLink.query.safeParse({ path: '/a.zip' }).success).toBe(
      false,
    );
    expect(MEDIA_PATHS.computerZipEntry).toBe('/media/computers/:deviceId/zip/:index');
  });

  it('ask the computer for entries and ranges under the files permission', () => {
    const requests = [
      { verb: 'zip_entries', path: '/a.zip', cursor: null },
      { verb: 'zip_entry_range', path: '/a.zip', index: 1, start: 0, length: 10 },
      { verb: 'trash_list', cursor: 0 },
    ];
    for (const request of requests) {
      expect(NODE_VERB_SCOPES[NODE_REQUEST.parse(request).verb]).toBe('files');
    }
    expect(
      NODE_REQUEST.safeParse({
        verb: 'zip_entry_range',
        path: '/a.zip',
        index: -1,
        start: 0,
        length: 1,
      }).success,
    ).toBe(false);
  });
});

describe('computer Trash', () => {
  it('list entries with their trash id, original place and size', () => {
    const entry = {
      trashId: 't1',
      name: 'a.txt',
      originalPath: '/home/dana/a.txt',
      deletedAt: '2026-11-15T10:00:00.000Z',
      size: 3,
      kind: 'file',
    };
    expect(
      FILE_TRASH_LIST.parse({ entries: [entry], total: 1, next: null }).entries[0],
    ).toMatchObject({
      trashId: 't1',
    });
    expect(
      FILE_TRASH_LIST.safeParse({ entries: [{ ...entry, trashId: '' }], total: 1, next: null })
        .success,
    ).toBe(false);
    expect(API_ENDPOINTS.listComputerTrash.query.safeParse({}).success).toBe(true);
  });

  it('delete for good only by trash id, in the app and for the assistant', () => {
    const change = { action: 'delete_now', items: ['t1'] };
    expect(FILE_WRITE_CHANGE.parse(change)).toStrictEqual(change);
    expect(FILE_TOOL_CHANGE.parse(change)).toStrictEqual(change);
    expect(FILE_WRITE_CHANGE.safeParse({ action: 'delete_now', items: [] }).success).toBe(false);
    expect(FILE_WRITE_CHANGE.safeParse({ action: 'delete_now', paths: ['/a'] }).success).toBe(
      false,
    );
  });

  it('are listed by assistant tools with a zip listing', () => {
    expect(mcpToolOperation('list_trash_files')).toBe('listComputerTrash');
    expect(mcpToolOperation('list_zip_files')).toBe('listComputerZipEntries');
  });
});

describe('computer file search', () => {
  it('turns on searching inside files with a flag that defaults to off', () => {
    const { query } = API_ENDPOINTS.searchComputerFiles;
    expect(query.parse({ path: '/a', text: 'x' }).contents).toBe(false);
    expect(query.parse({ path: '/a', text: 'x', contents: 'true' }).contents).toBe(true);
    expect(query.safeParse({ path: '/a', text: 'x', contents: 'yes' }).success).toBe(false);
    expect(
      NODE_REQUEST.parse({
        verb: 'files_search',
        query: { path: '/a', text: 'x', cursor: null },
      }),
    ).toMatchObject({ query: { contents: false } });
  });

  it('answer each match with its entry and where it hit', () => {
    const base = { path: '/a', scanned: 1, next: null };
    const name = { kind: 'name', snippet: 'a.txt', line: null, ranges: [{ start: 0, end: 1 }] };
    const text = { kind: 'text', snippet: 'hello there', line: 4, ranges: [{ start: 6, end: 11 }] };
    expect(
      FILE_SEARCH_RESULT.parse({
        ...base,
        matches: [
          { entry: ENTRY, hit: name },
          { entry: ENTRY, hit: text },
        ],
      }).matches,
    ).toHaveLength(2);
    expect(FILE_SEARCH_RESULT.safeParse({ ...base, matches: [ENTRY] }).success).toBe(false);
    expect(
      FILE_SEARCH_RESULT.safeParse({
        ...base,
        matches: [{ entry: ENTRY, hit: { ...text, line: null } }],
      }).success,
    ).toBe(false);
    expect(
      FILE_SEARCH_RESULT.safeParse({
        ...base,
        matches: [{ entry: ENTRY, hit: { ...name, line: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      FILE_SEARCH_RESULT.safeParse({
        ...base,
        matches: [{ entry: ENTRY, hit: { ...text, ranges: [{ start: 6, end: 30 }] } }],
      }).success,
    ).toBe(false);
    expect(
      FILE_SEARCH_RESULT.safeParse({
        ...base,
        matches: [{ entry: ENTRY, hit: { ...text, ranges: [{ start: 5, end: 5 }] } }],
      }).success,
    ).toBe(false);
    expect(
      FILE_SEARCH_RESULT.safeParse({
        ...base,
        matches: [{ entry: ENTRY, hit: { ...text, ranges: [] } }],
      }).success,
    ).toBe(false);
  });
});

describe('live changes of a folder', () => {
  it('are demanded as the files topic with the open folder', () => {
    expect(STATE_TOPICS).toContain('files');
    expect(COMPUTER_TOPICS).toContain('files');
    expect(
      NODE_DEMAND.parse({ topics: { files: 1000 }, files: ['/home/dana'] }).files,
    ).toStrictEqual(['/home/dana']);
    expect(NODE_DEMAND.safeParse({ topics: { files: 1000 }, files: ['home'] }).success).toBe(false);
    expect(
      WATCH_DEMAND.parse({ deviceId: DEVICE, topics: ['files'], files: '/home/dana' }).files,
    ).toBe('/home/dana');
    expect(
      WATCH_DEMAND.safeParse({ deviceId: DEVICE, topics: ['files'], files: 'x' }).success,
    ).toBe(false);
  });

  it('are reported by the computer and told to the apps', () => {
    expect(NODE_FRAME.parse({ type: 'files_changed', path: '/home/dana' })).toStrictEqual({
      type: 'files_changed',
      path: '/home/dana',
    });
    expect(NODE_FRAME.safeParse({ type: 'files_changed', path: 'dana' }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ type: 'files_changed', path: '/home/dana' }).success).toBe(false);
    const notice = { type: 'computer_files_changed', deviceId: DEVICE, path: '/home/dana' };
    expect(COMPUTER_FILES_CHANGED_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(LIVE_NOTICE.safeParse({ ...notice, deviceId: 'nope' }).success).toBe(false);
  });
});

describe('drive downloads', () => {
  const download = {
    kind: 'zip',
    name: 'Photos.zip',
    size: null,
    files: 3,
    folders: 1,
    bytes: 10,
    skipped: [{ path: 'Secret.pdf', reason: 'Only viewing is allowed.' }],
    url: '/media/drive-downloads/t?expires=1&signature=a',
    expiresAt: '2026-11-15T10:00:00.000Z',
  };

  it('answer a link and what was left out, for one or more items', () => {
    const { body, response, method, path, access } = API_ENDPOINTS.prepareDriveDownload;
    expect([method, path, access]).toStrictEqual(['POST', '/api/drive/downloads', 'member']);
    expect(body.safeParse({ itemIds: [DEVICE] }).success).toBe(true);
    expect(body.safeParse({ itemIds: [] }).success).toBe(false);
    expect(body.safeParse({ itemIds: ['x'] }).success).toBe(false);
    expect(response.parse(download)).toMatchObject({ skipped: [{ path: 'Secret.pdf' }] });
    expect(DRIVE_DOWNLOAD.parse({ ...download, kind: 'file', size: 10 }).kind).toBe('file');
    expect(DRIVE_DOWNLOAD.safeParse({ ...download, kind: 'folder' }).success).toBe(false);
    expect(DRIVE_DOWNLOAD.safeParse({ ...download, skipped: undefined }).success).toBe(false);
    expect(MEDIA_PATHS.driveDownload).toBe('/media/drive-downloads/:ticketId');
  });
});
