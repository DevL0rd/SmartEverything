import { z } from 'zod';
import { DRIVE_OPEN_ITEM } from '../drive/access-request';
import { DRIVE_FOLDER_COLOUR_SET, DRIVE_ITEM, DRIVE_LOCK_SET } from '../drive/item';
import { DRIVE_ITEM_TEXT } from '../drive/query';
import { DRIVE_SHORTCUT, DRIVE_SHORTCUT_CREATE } from '../drive/shortcut';
import { DRIVE_SUGGESTION } from '../drive/suggestion';
import { DRIVE_FOLDER_PLACE } from '../drive/upload';
import { DRIVE_ZIP_PAGE } from '../drive/zip';
import { COMPUTER_DOWNLOAD } from '../node/computer-files';
import { NO_BODY, endpoint } from './endpoint';
import { CURSOR_QUERY, DRIVE_ITEM_PARAMS, pageOf } from './endpoints-drive';
import { MEDIA_LINK } from './endpoints-media';
import { DONE, ID, NOTHING, somethingToChange } from './primitives';

const TITLE = z.string().trim().min(1);

export const DRIVE_ZIP_ENTRY_LINK = z
  .strictObject({
    index: z.int().nonnegative(),
    file: MEDIA_LINK,
    download: MEDIA_LINK.nullable().describe('Null when the viewer may only view the archive'),
  })
  .readonly();

export type DriveZipEntryLink = z.infer<typeof DRIVE_ZIP_ENTRY_LINK>;

export const DRIVE_DOWNLOAD_ITEMS = z.strictObject({ itemIds: z.array(ID).min(1).readonly() });

export const DRIVE_DOWNLOAD = z.strictObject(COMPUTER_DOWNLOAD.shape).readonly();

export type DriveDownload = z.infer<typeof DRIVE_DOWNLOAD>;

export const DRIVE_SHORTCUT_CHANGE = somethingToChange({
  name: TITLE,
  place: DRIVE_FOLDER_PLACE,
});

export type DriveShortcutChange = z.infer<typeof DRIVE_SHORTCUT_CHANGE>;

const SHORTCUT_PARAMS = z.strictObject({ shortcutId: ID });

export const DRIVE_CONTENT_ENDPOINTS = {
  prepareDriveDownload: endpoint({
    method: 'POST',
    path: '/api/drive/downloads',
    access: 'member',
    summary:
      'Get ready to download drive files or folders: one file stays as it is, a folder or several items become one zip built while it streams; items the viewer may only view are left out and listed with the reason; answers the name, size, counts, what was left out and a short-lived signed link to fetch it from',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_DOWNLOAD_ITEMS,
    response: DRIVE_DOWNLOAD,
  }),
  listZipEntries: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/zip',
    access: 'member',
    summary: 'The files and folders inside a zip archive in its own order, one page at a time',
    params: DRIVE_ITEM_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: DRIVE_ZIP_PAGE,
  }),
  zipEntryLink: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/zip/link',
    access: 'member',
    summary: 'A short-lived signed path that streams one file out of a zip archive',
    params: DRIVE_ITEM_PARAMS,
    query: z.strictObject({ index: z.coerce.number().int().nonnegative() }),
    body: NO_BODY,
    response: DRIVE_ZIP_ENTRY_LINK,
  }),
  readItemText: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/text',
    access: 'member',
    summary: 'The text the hub read out of a document or an image, the same text search looks in',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_ITEM_TEXT,
  }),
  openItem: endpoint({
    method: 'GET',
    path: '/api/drive/open/:itemId',
    access: 'member',
    summary:
      'Open a file or folder from a people link: the item when the caller has access, else whether they can ask for it',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_OPEN_ITEM,
  }),
  setItemLock: endpoint({
    method: 'PUT',
    path: '/api/drive/locks',
    access: 'member',
    summary:
      'Make a file or folder view only, so people it is shared with as viewers cannot download or copy it, or lift that',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_LOCK_SET,
    response: DRIVE_ITEM,
  }),
  setFolderColour: endpoint({
    method: 'PUT',
    path: '/api/drive/colours',
    access: 'member',
    summary: 'Give a folder a colour only the caller sees, or clear it',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_FOLDER_COLOUR_SET,
    response: DRIVE_ITEM,
  }),
  createShortcut: endpoint({
    method: 'POST',
    path: '/api/drive/shortcuts',
    access: 'member',
    summary:
      'Show a file or folder in another folder without copying it; the target may be in another drive',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_SHORTCUT_CREATE,
    response: DRIVE_SHORTCUT,
  }),
  updateShortcut: endpoint({
    method: 'PATCH',
    path: '/api/drive/shortcuts/:shortcutId',
    access: 'member',
    summary: 'Rename a shortcut or move it to another folder',
    params: SHORTCUT_PARAMS,
    query: NOTHING,
    body: DRIVE_SHORTCUT_CHANGE,
    response: DRIVE_SHORTCUT,
  }),
  removeShortcut: endpoint({
    method: 'DELETE',
    path: '/api/drive/shortcuts/:shortcutId',
    access: 'member',
    summary: 'Remove a shortcut; its target stays',
    params: SHORTCUT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listSuggested: endpoint({
    method: 'GET',
    path: '/api/drive/suggested',
    access: 'member',
    summary:
      'Files the caller may want next, each with the newest reason: opened, edited, edited by a person, shared, commented or mentioned',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_SUGGESTION),
  }),
} as const;
