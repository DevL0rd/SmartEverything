import { describe, expect, it } from 'vitest';
import { backupOriginOf, computerFolderOf, lastSegment, phoneFolderOf } from './folders';
import { shownLocalItems } from './tiles';
import type { LocalMediaItem } from './types';

function item(id: string, folder: LocalMediaItem['folder']): LocalMediaItem {
  return {
    id,
    name: `${id}.jpg`,
    takenAt: 1,
    modificationTime: 1,
    width: null,
    height: null,
    durationMs: null,
    video: false,
    folder,
  };
}

const CAMERA = phoneFolderOf('DCIM/Camera/');
const WHATSAPP = phoneFolderOf('Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/');

describe('local folders', () => {
  it('names a phone album and a computer folder by their last part', () => {
    expect(CAMERA).toEqual({ key: 'phone:DCIM/Camera', name: 'Camera' });
    expect(WHATSAPP?.name).toBe('WhatsApp Images');
    expect(computerFolderOf('C:\\Users\\me\\Pictures\\')).toEqual({
      key: 'computer:C:\\Users\\me\\Pictures\\',
      name: 'Pictures',
    });
    expect(lastSegment('/home/me/Pictures/Trip')).toBe('Trip');
    expect(phoneFolderOf('')).toBeNull();
  });

  it('reports where a backup came from on each platform', () => {
    expect(backupOriginOf('android', 'DCIM/Camera/')).toEqual(CAMERA);
    expect(backupOriginOf('desktop', '/home/me/Pictures')).toEqual({
      key: 'computer:/home/me/Pictures',
      name: 'Pictures',
    });
    expect(backupOriginOf('desktop', '')).toBeNull();
  });

  it('leaves photos of hidden folders out unless everything is shown', () => {
    const items = [item('a', CAMERA), item('b', WHATSAPP), item('c', null)];
    const hidden = new Set([WHATSAPP?.key ?? '']);
    const ids = (shown: readonly LocalMediaItem[]): readonly string[] => shown.map((x) => x.id);
    expect(ids(shownLocalItems(items, { filter: 'all' }, hidden, false))).toEqual(['a', 'c']);
    expect(ids(shownLocalItems(items, { filter: 'all' }, hidden, true))).toEqual(['a', 'b', 'c']);
    expect(
      ids(shownLocalItems(items, { filter: 'all', folder: WHATSAPP?.key ?? '' }, hidden, false)),
    ).toEqual(['b']);
  });
});
