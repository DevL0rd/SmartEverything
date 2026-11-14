import { describe, expect, it } from 'vitest';
import { DRIVE_ACTIVITY_ENTRY, type DriveActivityEntry } from '@smarteverything/domain';
import {
  MEMBER_ID,
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  personalRootRow,
  rootRow,
} from '../data/fixtures';
import { driveChipsOf } from '../model/drive-chip';
import {
  NO_FILTER,
  activityItemOf,
  filteredItems,
  isFiltered,
  type ActivityNames,
} from './activity-filters';

const THEIR_ROOT = 'a1b2c3d4-0000-4000-8000-000000000020';

const NAMES: ActivityNames = {
  chipOf: driveChipsOf({
    roots: [rootRow(ROOT_ID, 'ready'), personalRootRow(OTHER_ROOT_ID, OWNER_ID)],
    viewerId: OWNER_ID,
    sharerOfRoot: new Map([[THEIR_ROOT, MEMBER_ID]]),
    names: new Map([[MEMBER_ID, 'Anna']]),
  }),
  people: new Map(),
  devices: new Map(),
};

function feedOf(seq: number, rootId: string, relPath: string): DriveActivityEntry {
  return DRIVE_ACTIVITY_ENTRY.parse({
    row: {
      seq,
      rootId,
      itemId: `a1b2c3d4-0000-4000-8000-0000000001${String(seq).padStart(2, '0')}`,
      op: 'update',
      rev: 1,
      at: '2026-11-07T09:00:00.000Z',
      actorProfileId: null,
      via: 'app',
      deviceId: null,
    },
    item: { kind: 'document', name: relPath.split('/').at(-1), parentId: null, relPath },
  });
}

const ITEMS = [
  activityItemOf(feedOf(1, OTHER_ROOT_ID, 'Home/Taxes/Return.pdf'), NAMES),
  activityItemOf(feedOf(2, ROOT_ID, 'Recipes/Soup.md'), NAMES),
  activityItemOf(feedOf(3, THEIR_ROOT, 'Private/Plans/Trip.md'), NAMES),
];

describe('activity drive filter', () => {
  it('names where each change happened by drive and hides the folders above a shared item', () => {
    expect(ITEMS.map((item) => [item.drive, item.entry.folderPath])).toEqual([
      ['mine', 'My Drive › Home › Taxes'],
      ['shared-drive', 'Shared Drive › Recipes'],
      ['with-me', 'Shared by Anna'],
    ]);
  });

  it('keeps only the changes of the chosen drive and counts as a filter', () => {
    const only = (drive: typeof NO_FILTER.drive): readonly number[] =>
      filteredItems(ITEMS, { ...NO_FILTER, drive }, OWNER_ID).map((item) => item.entry.row.seq);
    expect(only('all')).toEqual([1, 2, 3]);
    expect(only('mine')).toEqual([1]);
    expect(only('shared-drive')).toEqual([2]);
    expect(only('with-me')).toEqual([3]);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, drive: 'with-me' })).toBe(true);
  });
});
