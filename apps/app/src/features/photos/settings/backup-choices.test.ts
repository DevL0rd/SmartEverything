import { describe, expect, it } from 'vitest';
import type { DesktopPhotoItem, DesktopPhotos } from '@smarteverything/domain';
import { listComputerFolders } from './backup-choices';

function photo(id: string, folder: string): DesktopPhotoItem {
  return {
    id: id.repeat(64),
    name: `${id}.jpg`,
    mimeType: 'image/jpeg',
    bytes: 1,
    modifiedAt: 1,
    takenAt: 1,
    uri: `app://smarteverything/local-media/${id}`,
    video: false,
    folder,
  };
}

describe('computer folders for backup', () => {
  it('lists each folder that holds photos once, by name, with its path', async () => {
    const items = [
      photo('a', '/home/me/Pictures/Trip'),
      photo('b', '/home/me/Pictures/Garden'),
      photo('c', '/home/me/Pictures/Trip'),
    ];
    const photos: Pick<DesktopPhotos, 'list'> = {
      list: () => Promise.resolve({ items, issues: [] }),
    };
    await expect(listComputerFolders(photos)).resolves.toEqual([
      { id: '/home/me/Pictures/Garden', title: 'Garden', place: '/home/me/Pictures/Garden' },
      { id: '/home/me/Pictures/Trip', title: 'Trip', place: '/home/me/Pictures/Trip' },
    ]);
  });
});
