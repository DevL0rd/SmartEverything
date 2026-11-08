import type { DriveChangeResult, DriveTrashEntry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DELETED_SUBTITLE,
  deleteAllConfirm,
  deleteNowConfirm,
  skippedDetail,
  skippedText,
  subtitleOf,
} from './copy';
import { leavingShapes } from './leaving-bars';
import {
  deletedDaysOf,
  deletedItemOf,
  deletedItemsOf,
  leavingLabel,
  leavingMonthsOf,
  leftText,
  monthLabel,
  pickedOf,
  tileLabelOf,
  totalsOf,
  whoOf,
  type DeletedPeople,
} from './model';
import { columnsOf, deletedRowsOf, tileWidthOf } from './rows';

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const ROOT = '00000000-0000-4000-8000-0000000000f0';
const TODAY = '2026-11-07';

const PEOPLE: DeletedPeople = {
  me: ME,
  names: new Map([
    [ME, 'Alex'],
    [SAM, 'Sam'],
  ]),
};

let serial = 0;

function entry(
  deleted: string,
  purge: string,
  extra: Partial<DriveTrashEntry> = {},
): DriveTrashEntry {
  serial += 1;
  return {
    itemId: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    rootId: ROOT,
    name: `IMG_${String(serial)}.jpg`,
    originalRelPath: `Camera roll/IMG_${String(serial)}.jpg`,
    trashRelPath: `.smarteverything/trash/${String(serial)}`,
    isFolder: false,
    bytes: 1_000_000,
    deletedAt: `${deleted}T12:00:00+00:00`,
    purgeAt: `${purge}T12:00:00+00:00`,
    deletedBy: ME,
    addedByProfileId: ME,
    ...extra,
  };
}

describe('recently deleted items', () => {
  it('counts the days left to the purge day and the share of the year kept', () => {
    const item = deletedItemOf(entry('2026-11-07', '2027-11-07'), TODAY, PEOPLE);
    expect(item.daysLeft).toBe(365);
    expect(item.kept).toBe(1);
    expect(item.critical).toBe(false);
    const late = deletedItemOf(entry('2025-11-28', '2026-11-28'), TODAY, PEOPLE);
    expect(late.daysLeft).toBe(21);
    expect(late.kept).toBeCloseTo(21 / 365, 5);
  });

  it('tints an item critical in the month it leaves for good, the first leaving bar', () => {
    expect(deletedItemOf(entry('2025-11-30', '2026-11-30'), TODAY, PEOPLE).critical).toBe(true);
    expect(deletedItemOf(entry('2025-12-01', '2026-12-01'), TODAY, PEOPLE).critical).toBe(false);
  });

  it('names who deleted an item: you, another person, or nobody when the hub removed it', () => {
    expect(whoOf(ME, PEOPLE)).toBe('You');
    expect(whoOf(SAM, PEOPLE)).toBe('Sam');
    expect(whoOf(null, PEOPLE)).toBeNull();
  });

  it('orders items newest first and groups them by the day they were deleted', () => {
    const items = deletedItemsOf(
      [
        entry('2026-10-01', '2027-10-01'),
        entry('2026-11-06', '2027-11-06'),
        entry('2026-11-06', '2027-11-06'),
      ],
      TODAY,
      PEOPLE,
    );
    expect(items.map((item) => item.day)).toEqual(['2026-11-06', '2026-11-06', '2026-10-01']);
    expect(deletedDaysOf(items).map((day) => [day.day, day.items.length])).toEqual([
      ['2026-11-06', 2],
      ['2026-10-01', 1],
    ]);
    expect(totalsOf(items)).toEqual({ count: 3, bytes: 3_000_000 });
  });

  it('buckets leaving per month from this month to the last purge month, gaps included', () => {
    const items = deletedItemsOf(
      [
        entry('2025-11-20', '2026-11-20'),
        entry('2026-01-02', '2027-01-02'),
        entry('2026-01-03', '2027-01-03'),
      ],
      TODAY,
      PEOPLE,
    );
    expect(leavingMonthsOf(items, TODAY)).toEqual([
      { key: '2026-11', count: 1, critical: true },
      { key: '2026-12', count: 0, critical: false },
      { key: '2027-01', count: 2, critical: false },
    ]);
    expect(leavingMonthsOf([], TODAY)).toEqual([]);
  });

  it('labels months with the year on January and describes the bars for screen readers', () => {
    expect(monthLabel('2027-01')).toContain('2027');
    expect(monthLabel('2026-12')).not.toContain('2026');
    const months = [
      { key: '2026-11', count: 3, critical: true },
      { key: '2026-12', count: 0, critical: false },
    ];
    expect(leavingLabel(months)).toBe(`Leaving for good per month: 3 in ${monthLabel('2026-11')}`);
  });

  it('shows the countdown and a spoken tile label', () => {
    expect(leftText(21)).toBe('21 d');
    expect(leftText(0)).toBe('Today');
    const item = deletedItemOf(
      entry('2025-11-28', '2026-11-28', { deletedBy: SAM }),
      TODAY,
      PEOPLE,
    );
    expect(tileLabelOf(item)).toBe(`${item.name}, deleted by Sam, leaves for good in 21 days`);
  });
});

describe('leaving bars', () => {
  it('draws the current month in the critical fill and skips empty months', () => {
    const shapes = leavingShapes(
      [
        { key: '2026-11', count: 2, critical: true },
        { key: '2026-12', count: 0, critical: false },
        { key: '2027-01', count: 4, critical: false },
      ],
      300,
      { critical: 'red', rest: 'grey' },
    );
    expect(shapes.map((shape) => [shape.key, shape.fill])).toEqual([
      ['2026-11', 'red'],
      ['2027-01', 'grey'],
    ]);
    expect(shapes[1]?.top).toBe(0);
  });
});

describe('picked items', () => {
  const items = deletedItemsOf(
    [entry('2026-11-06', '2027-11-06'), entry('2026-11-06', '2027-11-06')],
    TODAY,
    PEOPLE,
  );
  const ids = items.map((item) => item.id);

  it('keeps the picked items in list order', () => {
    const picked = pickedOf(items, new Set([ids[1] ?? '']));
    expect(picked.map((item) => item.id)).toEqual([ids[1]]);
    expect(pickedOf(items, new Set(ids))).toHaveLength(2);
    expect(pickedOf(items, new Set())).toHaveLength(0);
  });
});

describe('rows', () => {
  it('fills each row with as many tiles as fit and starts every day with its head', () => {
    const geometry = { width: 500, target: 160, gap: 3 };
    expect(columnsOf(geometry)).toBe(3);
    expect(tileWidthOf(geometry, 3)).toBeCloseTo(164.67, 1);
    const items = deletedItemsOf(
      [1, 2, 3, 4].map(() => entry('2026-11-06', '2027-11-06')),
      TODAY,
      PEOPLE,
    );
    const rows = deletedRowsOf(deletedDaysOf(items), geometry);
    expect(rows.map((row) => (row.kind === 'head' ? 'head' : row.items.length))).toEqual([
      'head',
      3,
      1,
    ]);
    expect(deletedRowsOf(deletedDaysOf(items), { ...geometry, width: 0 })).toEqual([]);
  });
});

describe('copy', () => {
  const RESULT: DriveChangeResult = { done: [], failed: [], conflicts: [] };

  it('asks before deleting for good and names the space freed', () => {
    expect(deleteNowConfirm({ count: 4, bytes: 58_000_000 })).toMatchObject({
      title: 'Delete 4 items now?',
      confirmLabel: 'Delete now',
      tone: 'destructive',
    });
    expect(deleteAllConfirm({ count: 1, bytes: 1 }).title).toBe('Delete all 1 item now?');
  });

  it('puts the count and size under the title on phones and the year rule on wide screens', () => {
    expect(subtitleOf({ count: 214, bytes: 3_100_000_000 }, true)).toMatch(
      /^214 items · .+ · kept a year$/,
    );
    expect(subtitleOf({ count: 214, bytes: 3_100_000_000 }, false)).toBe(DELETED_SUBTITLE);
    expect(subtitleOf({ count: 0, bytes: 0 }, true)).toBe(DELETED_SUBTITLE);
  });

  it('reports items the hub skipped', () => {
    expect(skippedText(RESULT, 'restored')).toBeNull();
    const failed = { ...RESULT, failed: [{ itemId: null, reason: 'Read-only library folder' }] };
    expect(skippedText(failed, 'restored')).toBe('1 item was not restored');
    expect(skippedDetail(failed)).toBe('Read-only library folder');
  });
});
