import { describe, expect, it } from 'vitest';
import {
  BACKUP_CHECK,
  LIBRARY_PAGE_QUERY,
  LIVE_NOTICE,
  PHOTO_FOLDER_HIDE,
  PHOTO_FOLDER_KEY,
  PHOTO_FOLDER_ORIGIN,
  PHOTOS_ENDPOINTS,
  phoneFolderPath,
  photoFolderKey,
  photoFolderKindOf,
  photoFolderPlaceOf,
} from '../../src';

const SHA = 'a'.repeat(64);

describe('photo folder keys', () => {
  it('names the kind and the place of a folder', () => {
    const key = photoFolderKey('computer', '/home/person/Pictures/Trip 2026');
    expect(key).toBe('computer:/home/person/Pictures/Trip 2026');
    expect(photoFolderKindOf(key)).toBe('computer');
    expect(photoFolderPlaceOf(key)).toBe('/home/person/Pictures/Trip 2026');
  });

  it('refuses keys without a kind or a place', () => {
    for (const key of ['album:x', 'phone:', 'drive: ', 'Camera', 'phone: padded ']) {
      expect(PHOTO_FOLDER_KEY.safeParse(key).success).toBe(false);
    }
  });

  it('reads a phone album from the Android relative path', () => {
    expect(phoneFolderPath('DCIM/Camera/')).toBe('DCIM/Camera');
    expect(phoneFolderPath('/')).toBeNull();
    expect(phoneFolderPath('')).toBeNull();
  });
});

describe('the contracts that carry folders', () => {
  it('takes a phone album or a computer folder as where a backup came from', () => {
    expect(PHOTO_FOLDER_ORIGIN.parse({ key: 'phone:DCIM/Camera', name: 'Camera' })).toEqual({
      key: 'phone:DCIM/Camera',
      name: 'Camera',
    });
    expect(PHOTO_FOLDER_ORIGIN.safeParse({ key: 'drive:x', name: 'Photos' }).success).toBe(false);
  });

  it('requires every backup check to say where each photo came from', () => {
    const body = PHOTOS_ENDPOINTS.checkBackupHashes.body;
    expect(body).toBe(BACKUP_CHECK);
    expect(
      body.safeParse({ deviceId: 'd', assets: [{ localId: 'l', sha256: SHA, folder: null }] })
        .success,
    ).toBe(true);
    expect(body.safeParse({ deviceId: 'd', assets: [{ localId: 'l', sha256: SHA }] }).success).toBe(
      false,
    );
  });

  it('narrows the library to one folder or shows hidden folders too', () => {
    expect(
      LIBRARY_PAGE_QUERY.parse({ filter: 'all', folder: 'drive:root', folders: 'all' }),
    ).toEqual({ filter: 'all', folder: 'drive:root', folders: 'all' });
    expect(LIBRARY_PAGE_QUERY.safeParse({ filter: 'all', folders: 'hidden' }).success).toBe(false);
  });

  it('hides or shows a named folder with a strict body', () => {
    expect(
      PHOTO_FOLDER_HIDE.safeParse({ key: 'phone:DCIM/Camera', name: 'Camera', hidden: true })
        .success,
    ).toBe(true);
    expect(
      PHOTO_FOLDER_HIDE.safeParse({ key: 'phone:a', name: 'a', hidden: true, extra: 1 }).success,
    ).toBe(false);
  });

  it('tells a person their hidden folders changed', () => {
    const notice = {
      type: 'photos_folders_changed',
      profileId: '0f000000-0000-4000-8000-000000000001',
    };
    expect(LIVE_NOTICE.parse(notice)).toEqual(notice);
  });
});
