import { describe, expect, it } from 'vitest';
import { DRIVE_QUERY, type DriveItem } from '@smarteverything/domain';
import {
  STARRED_CHIPS,
  chipCountsOf,
  chipOf,
  starredQueryOf,
  starredSubtitleOf,
} from './starred-model';

function kind(value: DriveItem['kind']): Pick<DriveItem, 'kind'> {
  return { kind: value };
}

describe('the starred list', () => {
  it('asks the hub for starred items of each chip with a valid query', () => {
    for (const { chip } of STARRED_CHIPS) {
      const query = DRIVE_QUERY.parse({ ...starredQueryOf(chip), cursor: null });
      expect(query.starred).toBe(true);
    }
    expect(starredQueryOf('all').kinds).toBeNull();
    expect(starredQueryOf('folders').kinds).toEqual(['folder']);
    expect(starredQueryOf('photos').kinds).toEqual(['image', 'video']);
    expect(starredQueryOf('files').kinds).toEqual(['document', 'audio', 'other']);
  });

  it('puts every kind in exactly one chip', () => {
    expect(chipOf(kind('folder'))).toBe('folders');
    expect(chipOf(kind('image'))).toBe('photos');
    expect(chipOf(kind('video'))).toBe('photos');
    expect(chipOf(kind('document'))).toBe('files');
    expect(chipOf(kind('audio'))).toBe('files');
    expect(chipOf(kind('other'))).toBe('files');
  });

  it('shows counts only for lists that are fully loaded', () => {
    const items = [kind('folder'), kind('image'), kind('document'), kind('video')];
    expect(
      chipCountsOf({
        chip: 'all',
        all: { items, complete: true },
        shown: { items, complete: true },
      }),
    ).toEqual({ all: 4, folders: 1, files: 1, photos: 2 });
    expect(
      chipCountsOf({
        chip: 'photos',
        all: { items, complete: false },
        shown: { items: [kind('image')], complete: true },
      }),
    ).toEqual({ all: null, folders: null, files: null, photos: 1 });
    expect(
      chipCountsOf({
        chip: 'all',
        all: { items, complete: false },
        shown: { items, complete: false },
      }),
    ).toEqual({ all: null, folders: null, files: null, photos: null });
  });

  it('says how many are starred and how many smart folders there are', () => {
    expect(starredSubtitleOf(23, 3)).toBe('23 starred · 3 smart folders');
    expect(starredSubtitleOf(1, 0)).toBe('1 starred');
    expect(starredSubtitleOf(null, 0)).toBe('');
  });

  it('orders the chips as the design does', () => {
    expect(STARRED_CHIPS.map((entry) => entry.label)).toEqual([
      'All',
      'Files',
      'Folders',
      'Photos',
    ]);
  });
});
