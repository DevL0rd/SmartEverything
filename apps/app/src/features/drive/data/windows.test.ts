import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { DRIVE_EVERYWHERE, driveKey, type DriveWindowScope } from '../../../queries/keys';
import {
  ALBUM_ID,
  FOLDER_ID,
  OTHER_ALBUM_ID,
  OTHER_FOLDER_ID,
  OTHER_ROOT_ID,
  ROOT_ID,
} from './fixtures';
import { invalidateDriveChanged, reaches } from './windows';

const NO_IDS: readonly string[] = [];
const folderIn = (rootId: string, folderId: string | null): DriveWindowScope => ({
  rootId,
  folderId,
  albumId: null,
});
const album = (albumId: string): DriveWindowScope => ({
  rootId: null,
  folderId: null,
  albumId,
});

function seeded(): QueryClient {
  const client = new QueryClient();
  const windows: readonly (readonly [readonly unknown[]])[] = [
    [driveKey('folder', folderIn(ROOT_ID, FOLDER_ID), null)],
    [driveKey('folder', folderIn(ROOT_ID, OTHER_FOLDER_ID), null)],
    [driveKey('folder', folderIn(OTHER_ROOT_ID, null), null)],
    [driveKey('album-items', album(ALBUM_ID))],
    [driveKey('album-items', album(OTHER_ALBUM_ID))],
    [driveKey('stats', DRIVE_EVERYWHERE)],
    [driveKey('settings', null)],
  ];
  for (const [key] of windows) client.setQueryData(key, 'data');
  return client;
}

function stale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe('drive windows reached by a change', () => {
  it('matches the narrowest scope a window names', () => {
    const reach = { rootIds: [ROOT_ID], folderIds: [FOLDER_ID], albumIds: [], months: null };
    expect(reaches(folderIn(ROOT_ID, FOLDER_ID), reach)).toBe(true);
    expect(reaches(folderIn(ROOT_ID, OTHER_FOLDER_ID), reach)).toBe(false);
    expect(reaches(folderIn(ROOT_ID, null), reach)).toBe(true);
    expect(reaches(folderIn(OTHER_ROOT_ID, null), reach)).toBe(false);
    expect(reaches(album(ALBUM_ID), reach)).toBe(false);
    expect(reaches(DRIVE_EVERYWHERE, reach)).toBe(true);
  });

  it('refetches only the windows a drive_changed notice intersects', () => {
    const client = seeded();
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: [ROOT_ID],
      folderIds: [FOLDER_ID],
      albumIds: [ALBUM_ID],
      months: [],
      cursor: 7,
    });
    expect(stale(client, driveKey('folder', folderIn(ROOT_ID, FOLDER_ID), null))).toBe(true);
    expect(stale(client, driveKey('folder', folderIn(ROOT_ID, OTHER_FOLDER_ID), null))).toBe(false);
    expect(stale(client, driveKey('folder', folderIn(OTHER_ROOT_ID, null), null))).toBe(false);
    expect(stale(client, driveKey('album-items', album(ALBUM_ID)))).toBe(true);
    expect(stale(client, driveKey('album-items', album(OTHER_ALBUM_ID)))).toBe(false);
    expect(stale(client, driveKey('stats', DRIVE_EVERYWHERE))).toBe(true);
    expect(stale(client, driveKey('settings', null))).toBe(false);
  });

  it('leaves every window alone when the notice names nothing and windows are scoped', () => {
    const client = seeded();
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: NO_IDS,
      folderIds: NO_IDS,
      albumIds: NO_IDS,
      months: [],
      cursor: 8,
    });
    expect(stale(client, driveKey('folder', folderIn(ROOT_ID, FOLDER_ID), null))).toBe(false);
    expect(stale(client, driveKey('album-items', album(ALBUM_ID)))).toBe(false);
  });

  it('refetches the sharing windows on a drive change notice', () => {
    const client = new QueryClient();
    const sharing = [
      driveKey('grants', DRIVE_EVERYWHERE, FOLDER_ID),
      driveKey('shared-with-me', DRIVE_EVERYWHERE),
      driveKey('shared-by-me', DRIVE_EVERYWHERE),
    ];
    for (const key of sharing) client.setQueryData(key, 'data');
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: [ROOT_ID],
      folderIds: NO_IDS,
      albumIds: NO_IDS,
      months: [],
      cursor: 9,
    });
    expect(sharing.every((key) => stale(client, key))).toBe(true);
  });
});
