import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import {
  albumChange,
  albumRow,
  grantChange,
  grantRow,
  GRANT_ID,
  MEMBER_ID,
  FOLDER_ID,
  rootChange,
  rootRow,
  ALBUM_ID,
  OTHER_ALBUM_ID,
  ROOT_ID,
} from './fixtures';
import { applyDriveChanges, driveReconnected } from './live';
import { driveProgress, receiveDriveProgress } from './progress';

const STATS = driveKey('stats', DRIVE_EVERYWHERE);
const ALBUM_WINDOW = driveKey('album-items', { rootId: null, folderId: null, albumId: ALBUM_ID });
const OTHER_ALBUM_WINDOW = driveKey('album-items', {
  rootId: null,
  folderId: null,
  albumId: OTHER_ALBUM_ID,
});
const ROOT_WINDOW = driveKey('folder', { rootId: ROOT_ID, folderId: null, albumId: null }, null);

function seeded(): QueryClient {
  const client = new QueryClient();
  for (const key of [STATS, ALBUM_WINDOW, OTHER_ALBUM_WINDOW, ROOT_WINDOW])
    client.setQueryData(key, 'data');
  return client;
}

function stale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe('drive live table changes', () => {
  beforeEach(() => {
    driveProgress.set({});
  });

  it('refetches only the album window of a changed album', () => {
    const client = seeded();
    applyDriveChanges(client, [albumChange('UPDATE', albumRow(ALBUM_ID), 1)]);
    expect(stale(client, ALBUM_WINDOW)).toBe(true);
    expect(stale(client, OTHER_ALBUM_WINDOW)).toBe(false);
    expect(stale(client, STATS)).toBe(false);
  });

  it('refetches every drive window when a root appears or goes', () => {
    const client = seeded();
    applyDriveChanges(client, [rootChange('INSERT', null, rootRow(ROOT_ID, 'scanning'), 2)]);
    expect([STATS, ALBUM_WINDOW, ROOT_WINDOW].every((key) => stale(client, key))).toBe(true);
  });

  it('refetches a root window when its state moves and not when only counts move', () => {
    const quiet = seeded();
    applyDriveChanges(quiet, [
      rootChange('UPDATE', rootRow(ROOT_ID, 'ready'), rootRow(ROOT_ID, 'ready'), 3),
    ]);
    expect(stale(quiet, ROOT_WINDOW)).toBe(false);
    const moved = seeded();
    applyDriveChanges(moved, [
      rootChange('UPDATE', rootRow(ROOT_ID, 'scanning'), rootRow(ROOT_ID, 'ready'), 4),
    ]);
    expect(stale(moved, ROOT_WINDOW)).toBe(true);
    expect(stale(moved, ALBUM_WINDOW)).toBe(false);
  });

  it('refetches every drive window and every sharing window when a grant moves', () => {
    const client = seeded();
    const sharing = [
      driveKey('grants', DRIVE_EVERYWHERE, FOLDER_ID),
      driveKey('shared-with-me', DRIVE_EVERYWHERE),
      driveKey('shared-by-me', DRIVE_EVERYWHERE),
    ];
    for (const key of sharing) client.setQueryData(key, 'data');
    applyDriveChanges(client, [
      grantChange('INSERT', grantRow(GRANT_ID, FOLDER_ID, MEMBER_ID, 'view'), 5),
    ]);
    expect([...sharing, STATS, ROOT_WINDOW].every((key) => stale(client, key))).toBe(true);
  });

  it('on reconnect drops stale progress and refetches the drive windows', () => {
    const client = seeded();
    receiveDriveProgress({
      type: 'drive_progress',
      rootId: ROOT_ID,
      phase: 'scan',
      done: 1,
      total: 4,
    });
    driveReconnected(client);
    expect(driveProgress.get()).toEqual({});
    expect(stale(client, STATS)).toBe(true);
  });
});
