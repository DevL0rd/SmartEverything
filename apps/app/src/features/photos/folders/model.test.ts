import { describe, expect, it } from 'vitest';
import type { PhotoFolder } from '@smarteverything/domain';
import type { LocalMediaItem } from '../local/types';
import { withFolderShow } from './data';
import {
  backedUpShare,
  backupIdsOf,
  countLineOf,
  folderGroupsOf,
  folderKeyOfParam,
  folderParamOf,
  hiddenCountOf,
} from './model';

const CAMERA = { key: 'phone:DCIM/Camera', name: 'Camera', backupId: 'album-camera' } as const;

function local(id: string, takenAt: number): LocalMediaItem {
  return {
    id,
    name: `${id}.jpg`,
    takenAt,
    modificationTime: 1,
    width: null,
    height: null,
    durationMs: null,
    video: false,
    folder: CAMERA,
  };
}

function hub(key: string, kind: PhotoFolder['kind'], count: number): PhotoFolder {
  return {
    key,
    kind,
    name: key.split(':')[1] ?? key,
    place: kind === 'drive' ? 'My Drive' : 'Pixel 8',
    count,
    coverItemId: '0f000000-0000-4000-8000-000000000001',
    coverRev: 1,
    latestAt: '2026-11-01T10:00:00.000Z',
    hidden: false,
  };
}

describe('the Folders page model', () => {
  const groups = folderGroupsOf({
    hub: [
      hub(CAMERA.key, 'phone', 1),
      hub('computer:/home/me/Pictures', 'computer', 5),
      hub('drive:photos', 'drive', 7),
    ],
    local: [local('a', 10), local('b', 20)],
    hidden: new Set([CAMERA.key]),
    here: 'This phone',
  });

  it('puts this phone first and joins its albums with their backups', () => {
    expect(groups.map((group) => group.id)).toEqual(['device', 'devices', 'drive']);
    const [camera] = groups[0]?.folders ?? [];
    expect(camera).toMatchObject({
      key: CAMERA.key,
      place: 'This phone',
      local: 2,
      backedUp: 1,
      hidden: true,
      backupId: 'album-camera',
      cover: { kind: 'local', localId: 'b', video: false },
    });
    expect(camera === undefined ? null : countLineOf(camera, true)).toBe('2 items · 1 backed up');
    expect(camera === undefined ? null : backedUpShare(camera)).toBe(0.5);
    expect(groups[1]?.folders.map((folder) => folder.key)).toEqual(['computer:/home/me/Pictures']);
    expect(hiddenCountOf(groups)).toBe(1);
  });

  it('describes folders that only live on the hub', () => {
    const drive = groups[2]?.folders[0];
    expect(drive === undefined ? null : countLineOf(drive, false)).toBe('7 items');
    expect(drive === undefined ? null : backedUpShare(drive)).toBeNull();
    expect(drive?.backupId).toBeNull();
    expect(backupIdsOf(groups)).toEqual(['album-camera']);
  });

  it('carries any folder key through the route and back', () => {
    for (const key of [CAMERA.key, 'computer:C:\\Users\\Ünal\\Pictures', 'drive:a/b']) {
      const param = folderParamOf(key);
      expect(param).toMatch(/^[0-9a-f]+$/);
      expect(folderKeyOfParam(param)).toBe(key);
    }
    expect(folderKeyOfParam('xyz')).toBeNull();
    expect(folderKeyOfParam('')).toBeNull();
  });

  it('shows hidden folders for the session only outside an opened folder', () => {
    expect(withFolderShow({ filter: 'all' }, true)).toEqual({ filter: 'all', folders: 'all' });
    expect(withFolderShow({ filter: 'all' }, false)).toEqual({ filter: 'all' });
    expect(withFolderShow({ filter: 'all', folder: CAMERA.key }, true)).toEqual({
      filter: 'all',
      folder: CAMERA.key,
    });
  });
});
