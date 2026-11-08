import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateDriveChanged } from '../../nas/data/windows';
import { driveKey } from '../../../queries/keys';
import { ROOT_ID } from '../../nas/data/fixtures';
import { PHOTO_ALL, photoKeys } from './keys';

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(photoKeys.buckets(PHOTO_ALL), []);
  client.setQueryData(photoKeys.month('2026-10', PHOTO_ALL), 'data');
  client.setQueryData(photoKeys.month('2026-09', PHOTO_ALL), 'data');
  client.setQueryData(photoKeys.backup(), []);
  client.setQueryData(driveKey('settings', null), 'data');
  return client;
}

function stale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe('photo windows', () => {
  it('keys each month and scope apart', () => {
    expect(photoKeys.month('2026-10', PHOTO_ALL)).not.toEqual(
      photoKeys.month('2026-09', PHOTO_ALL),
    );
    expect(photoKeys.month('2026-10', PHOTO_ALL)).not.toEqual(
      photoKeys.month('2026-10', { filter: 'videos', placeId: null }),
    );
    expect(photoKeys.month('2026-10', PHOTO_ALL)).not.toEqual(
      photoKeys.month('2026-10', { filter: 'all', placeId: 4 }),
    );
  });

  it('are marked for refetch by a drive_changed notice, leaving Drive settings alone', () => {
    const client = seeded();
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: [ROOT_ID],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    });
    expect(stale(client, photoKeys.buckets(PHOTO_ALL))).toBe(true);
    expect(stale(client, photoKeys.month('2026-10', PHOTO_ALL))).toBe(true);
    expect(stale(client, photoKeys.month('2026-09', PHOTO_ALL))).toBe(true);
    expect(stale(client, photoKeys.backup())).toBe(true);
    expect(stale(client, driveKey('settings', null))).toBe(false);
  });
});
