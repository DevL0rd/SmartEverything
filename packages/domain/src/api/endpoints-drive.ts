import { z } from 'zod';
import {
  DRIVE_ALBUM,
  DRIVE_ALBUM_CHANGE,
  DRIVE_ALBUM_CREATE,
  DRIVE_ALBUM_SURFACES,
} from '../drive/album';
import { DRIVE_CHANGE, DRIVE_CHANGE_RESULT } from '../drive/change';
import {
  DRIVE_GRANT,
  DRIVE_GRANT_SET,
  DRIVE_SHARED_BY_ME_ENTRY,
  DRIVE_SHARED_WITH_ME_ENTRY,
} from '../drive/grant';
import { DRIVE_ITEM } from '../drive/item';
import { DRIVE_MOUNT_SET, DRIVE_PLACEMENT, DRIVE_PLACEMENT_SET } from '../drive/placement';
import {
  DRIVE_QUERY,
  DRIVE_QUERY_PAGE,
  DRIVE_SEARCH_PAGE,
  DRIVE_SORT_FIELDS,
} from '../drive/query';
import { DRIVE_RECENT_FILTERS, DRIVE_RECENT_PAGE } from '../drive/recent';
import { DRIVE_ROOT } from '../drive/root';
import { DRIVE_SHORTCUT } from '../drive/shortcut';
import { DRIVE_STATS } from '../drive/stats';
import { DRIVE_TRASH_ENTRY } from '../drive/trash';
import { NO_BODY, endpoint } from './endpoint';
import { MEDIA_LINK } from './endpoints-media';
import { COUNT, DONE, ID, NOTHING, somethingToChange } from './primitives';

export const DRIVE_THUMB_SIZES = ['thumb', 'preview'] as const;

export const DRIVE_THUMB_SIZE = z.enum(DRIVE_THUMB_SIZES);

export type DriveThumbSize = z.infer<typeof DRIVE_THUMB_SIZE>;

export const DRIVE_CURSOR = z.string().min(1);

export const CURSOR_QUERY = z.strictObject({ cursor: DRIVE_CURSOR.optional() });

export function pageOf<T extends z.ZodType>(
  item: T,
): z.ZodReadonly<
  z.ZodObject<
    { items: z.ZodReadonly<z.ZodArray<T>>; next: z.ZodNullable<z.ZodString> },
    z.core.$strict
  >
> {
  return z
    .strictObject({ items: z.array(item).readonly(), next: DRIVE_CURSOR.nullable() })
    .readonly();
}

const PATTERNS = z.array(z.string().min(1)).readonly();

export const DRIVE_ROOT_CHANGE = somethingToChange({
  versions: z.boolean(),
  skipPatterns: PATTERNS,
  includeHidden: z.boolean(),
});

export type DriveRootChange = z.infer<typeof DRIVE_ROOT_CHANGE>;

export const DRIVE_BROWSE_QUERY = z
  .strictObject({
    rootId: ID,
    folderId: ID.optional(),
    sortField: z.enum(DRIVE_SORT_FIELDS).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    cursor: DRIVE_CURSOR.optional(),
  })
  .refine((query) => (query.sortField === undefined) === (query.sortDirection === undefined), {
    message: 'name both a sort field and a direction, or neither',
    path: ['sortDirection'],
  });

export const DRIVE_BROWSE_PAGE = z
  .strictObject({
    folder: DRIVE_ITEM.nullable(),
    items: z.array(DRIVE_ITEM).readonly(),
    shortcuts: z
      .array(DRIVE_SHORTCUT)
      .readonly()
      .describe('Every shortcut of the folder, on the first page only'),
    next: DRIVE_CURSOR.nullable(),
  })
  .readonly();

export const DRIVE_ITEM_LINK = z
  .strictObject({
    itemId: ID,
    rev: z.int().positive(),
    file: MEDIA_LINK,
    download: MEDIA_LINK.nullable().describe('Null when the viewer may only view the file'),
    icon: MEDIA_LINK.nullable().describe('The icon image a folder holds, shown as its badge'),
    thumb: MEDIA_LINK.nullable(),
    preview: MEDIA_LINK.nullable(),
    playable: MEDIA_LINK.nullable(),
  })
  .readonly();

export type DriveItemLink = z.infer<typeof DRIVE_ITEM_LINK>;

export const DRIVE_DUPLICATE_GROUP = z
  .strictObject({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: COUNT,
    items: z.array(DRIVE_ITEM).min(2).readonly(),
  })
  .readonly();

const ROOT_PARAMS = z.strictObject({ rootId: ID });
const GRANT_PARAMS = z.strictObject({ grantId: ID });

const PLACEMENT_PARAMS = z.strictObject({ placementId: ID });
export const DRIVE_ITEM_PARAMS = z.strictObject({ itemId: ID });
const ALBUM_PARAMS = z.strictObject({ albumId: ID });
export const DRIVE_ALBUM_LIST_QUERY = z.strictObject({ surface: z.enum(DRIVE_ALBUM_SURFACES) });
export const DRIVE_ROOT_PAGE_QUERY = z.strictObject({
  rootId: ID.optional(),
  cursor: DRIVE_CURSOR.optional(),
});

export const DRIVE_LIBRARY_ENDPOINTS = {
  listRoots: endpoint({
    method: 'GET',
    path: '/api/drive/roots',
    access: 'member',
    summary:
      'The drives the caller can open: their own and the Shared Drive, with state, size and health',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_ROOT),
  }),
  updateRoot: endpoint({
    method: 'PATCH',
    path: '/api/drive/roots/:rootId',
    access: 'member',
    summary: 'Change a drive: versions, skip patterns and whether hidden files are indexed',
    params: ROOT_PARAMS,
    query: NOTHING,
    body: DRIVE_ROOT_CHANGE,
    response: DRIVE_ROOT,
  }),
  scanRoot: endpoint({
    method: 'POST',
    path: '/api/drive/roots/:rootId/scan',
    access: 'member',
    summary: 'Re-read a drive from disk now',
    params: ROOT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listPlacements: endpoint({
    method: 'GET',
    path: '/api/drive/placements',
    access: 'member',
    summary:
      'The synced folders and the mounted drive on each of the caller’s computers, with live status',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_PLACEMENT).readonly(),
  }),
  setPlacement: endpoint({
    method: 'PUT',
    path: '/api/drive/placements',
    access: 'member',
    summary:
      'Sync a drive or one of its folders to a folder on a computer, or change its path, enabled state or sync settings',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_PLACEMENT_SET,
    response: DRIVE_PLACEMENT,
  }),
  setComputerMount: endpoint({
    method: 'PUT',
    path: '/api/drive/mount',
    access: 'member',
    summary:
      'Turn the mounted drive on a computer on or off; it is always the caller’s whole My Drive in the computer’s network drive place',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_MOUNT_SET,
    response: DRIVE_PLACEMENT,
  }),
  removePlacement: endpoint({
    method: 'DELETE',
    path: '/api/drive/placements/:placementId',
    access: 'member',
    summary:
      'Stop syncing a folder or remove the mounted drive on a computer; files already on its disk stay',
    params: PLACEMENT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  browseFolder: endpoint({
    method: 'GET',
    path: '/api/drive/browse',
    access: 'member',
    summary: 'One page of the files and folders inside a drive or one of its folders',
    params: NOTHING,
    query: DRIVE_BROWSE_QUERY,
    body: NO_BODY,
    response: DRIVE_BROWSE_PAGE,
  }),
  readItem: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId',
    access: 'member',
    summary: 'One file or folder with its details',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_ITEM,
  }),
  itemLinks: endpoint({
    method: 'POST',
    path: '/api/drive/items/links',
    access: 'member',
    summary: 'Short-lived signed paths that open files and show their thumbnails and previews',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ itemIds: z.array(ID).min(1) }),
    response: z.array(DRIVE_ITEM_LINK),
  }),
  searchDrive: endpoint({
    method: 'POST',
    path: '/api/drive/search',
    access: 'member',
    summary:
      'Find files by name, by the text inside them or inside their images, and by filters, one sorted page at a time, with the place of each match; shortcuts that match by name come with the first page',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_QUERY,
    response: DRIVE_SEARCH_PAGE,
  }),
  changeDrive: endpoint({
    method: 'POST',
    path: '/api/drive/changes',
    access: 'member',
    summary:
      'Make a folder, rename, move, copy, star, trash, restore or delete files, or change an album’s contents',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_CHANGE,
    response: DRIVE_CHANGE_RESULT,
  }),
  readRecent: endpoint({
    method: 'GET',
    path: '/api/drive/recent',
    access: 'member',
    summary: 'Recently opened, added or changed files, newest first',
    params: NOTHING,
    query: z.strictObject({
      filter: z.enum(DRIVE_RECENT_FILTERS),
      cursor: DRIVE_CURSOR.optional(),
    }),
    body: NO_BODY,
    response: DRIVE_RECENT_PAGE,
  }),
  recordDriveOpen: endpoint({
    method: 'POST',
    path: '/api/drive/items/:itemId/open',
    access: 'member',
    summary:
      'Note that the person opened this file to look at it, so it leads their recently opened files',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  readDriveStats: endpoint({
    method: 'GET',
    path: '/api/drive/stats',
    access: 'member',
    summary:
      'How much the caller’s drives hold by kind and folder, the data disk space, and how it grows',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_STATS,
  }),
  listDuplicates: endpoint({
    method: 'GET',
    path: '/api/drive/duplicates',
    access: 'member',
    summary: 'Groups of files with identical content, one page at a time',
    params: NOTHING,
    query: DRIVE_ROOT_PAGE_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_DUPLICATE_GROUP),
  }),
  listGrants: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/grants',
    access: 'member',
    summary: 'The people a file or folder is shared with, and what each may do',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_GRANT),
  }),
  setGrant: endpoint({
    method: 'PUT',
    path: '/api/drive/grants',
    access: 'member',
    summary:
      'Share a file or folder of the caller’s drive with a person to view or edit, or change that',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_GRANT_SET,
    response: DRIVE_GRANT,
  }),
  removeGrant: endpoint({
    method: 'DELETE',
    path: '/api/drive/grants/:grantId',
    access: 'member',
    summary: 'Stop sharing a file or folder with a person',
    params: GRANT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listSharedWithMe: endpoint({
    method: 'GET',
    path: '/api/drive/shared-with-me',
    access: 'member',
    summary:
      'Files and folders other people shared with the caller, with the role and who shared, one page at a time',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_SHARED_WITH_ME_ENTRY),
  }),
  listSharedByMe: endpoint({
    method: 'GET',
    path: '/api/drive/shared-by-me',
    access: 'member',
    summary: 'Files and folders the caller shared, with their people and links, one page at a time',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_SHARED_BY_ME_ENTRY),
  }),
  listAlbums: endpoint({
    method: 'GET',
    path: '/api/drive/albums',
    access: 'member',
    summary: 'Every album of one surface the caller may see, manual and smart',
    params: NOTHING,
    query: DRIVE_ALBUM_LIST_QUERY,
    body: NO_BODY,
    response: z.array(DRIVE_ALBUM),
  }),
  listAlbumItems: endpoint({
    method: 'GET',
    path: '/api/drive/albums/:albumId/items',
    access: 'member',
    summary: 'The files in an album, one page at a time',
    params: ALBUM_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: DRIVE_QUERY_PAGE,
  }),
  createAlbum: endpoint({
    method: 'POST',
    path: '/api/drive/albums',
    access: 'member',
    summary: 'Make a manual album or a smart album that follows a rule',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_ALBUM_CREATE,
    response: DRIVE_ALBUM,
  }),
  updateAlbum: endpoint({
    method: 'PATCH',
    path: '/api/drive/albums/:albumId',
    access: 'member',
    summary: 'Rename an album, choose its cover or change a smart album’s rule',
    params: ALBUM_PARAMS,
    query: NOTHING,
    body: DRIVE_ALBUM_CHANGE,
    response: DRIVE_ALBUM,
  }),
  removeAlbum: endpoint({
    method: 'DELETE',
    path: '/api/drive/albums/:albumId',
    access: 'member',
    summary: 'Delete an album; its files stay',
    params: ALBUM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listTrash: endpoint({
    method: 'GET',
    path: '/api/drive/trash',
    access: 'member',
    summary: 'Trashed files and folders with when they leave for good, one page at a time',
    params: NOTHING,
    query: DRIVE_ROOT_PAGE_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_TRASH_ENTRY),
  }),
} as const;
