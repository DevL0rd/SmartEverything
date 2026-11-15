import { describe, expect, it } from 'vitest';
import type { DriveTrashEntry } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { deletedByLabel, deletedByOf, personToneOf } from './deleted-by';
import { leavingLabel, leavingMonthsOf, leavingShapes, leavingTotalOf } from './leaving-bars';
import {
  SUMMARY_SIDE_BY_SIDE_MIN,
  TABLE_MIN_WIDTH,
  summaryWideOf,
  trashLayoutOf,
  trashSnap,
} from './trash-layout';
import { pickStateOf } from './selection';
import {
  deleterOf,
  leavesText,
  sizeText,
  totalsText,
  trashItemsOf,
  wasInOf,
  type TrashPeople,
} from './trash-model';

const ME = '00000000-0000-4000-8000-0000000000a1';
const SAM = '00000000-0000-4000-8000-0000000000a2';
const ALEX = '00000000-0000-4000-8000-0000000000a3';
const GONE = '00000000-0000-4000-8000-0000000000a9';
const ROOT = '00000000-0000-4000-8000-0000000000b1';

const PEOPLE: TrashPeople = {
  me: ME,
  names: new Map([
    [ME, 'Dana'],
    [SAM, 'Sam'],
    [ALEX, 'Alex'],
  ]),
};

let serial = 0;

function entry(change: Partial<DriveTrashEntry>): DriveTrashEntry {
  serial += 1;
  return {
    itemId: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    rootId: ROOT,
    name: 'Quote.pdf',
    originalRelPath: 'Home/Kitchen remodel/Quote.pdf',
    trashRelPath: '.trash/Quote.pdf',
    isFolder: false,
    bytes: 220_000,
    deletedAt: '2026-11-01T10:00:00Z',
    purgeAt: '2027-11-01T10:00:00Z',
    deletedBy: ME,
    addedByProfileId: ME,
    ...change,
  };
}

const TODAY = '2026-11-07';

describe('trash items', () => {
  it('names the deleter as you, a known person or someone', () => {
    expect(deleterOf(ME, PEOPLE)).toEqual({ kind: 'you' });
    expect(deleterOf(SAM, PEOPLE)).toEqual({ kind: 'person', id: SAM, name: 'Sam' });
    expect(deleterOf(GONE, PEOPLE)).toEqual({ kind: 'unknown' });
    expect(deleterOf(null, PEOPLE)).toEqual({ kind: 'unknown' });
  });

  it('sorts newest deleted first and counts the days left against the purge day', () => {
    const items = trashItemsOf(
      [
        entry({
          name: 'old.txt',
          deletedAt: '2026-01-01T10:00:00Z',
          purgeAt: '2027-01-01T10:00:00Z',
        }),
        entry({ name: 'new.txt' }),
      ],
      TODAY,
      PEOPLE,
    );
    expect(items.map((item) => item.name)).toEqual(['new.txt', 'old.txt']);
    expect(items[0]?.daysLeft).toBe(359);
    expect(items[0]?.kept).toBeCloseTo(359 / 365);
    expect(items[1]?.daysLeft).toBe(55);
  });

  it('says where an item was, with the drive first', () => {
    const [item] = trashItemsOf([entry({})], TODAY, PEOPLE);
    if (item === undefined) throw new Error('no item');
    expect(wasInOf(item, 'Projects')).toBe('Projects › Home › Kitchen remodel');
    expect(wasInOf(item, null)).toBe('Home › Kitchen remodel');
    expect(sizeText(item)).toBe(bytes(220_000));
  });

  it('shows a folder’s size and totals the bytes', () => {
    const items = trashItemsOf(
      [entry({ isFolder: true, name: 'Quotes', bytes: 1_400_000_000 }), entry({})],
      TODAY,
      PEOPLE,
    );
    const folder = items.find((item) => item.isFolder);
    if (folder === undefined) throw new Error('no folder');
    expect(sizeText(folder)).toBe(bytes(1_400_000_000));
    expect(totalsText({ count: 2, bytes: 440_000 })).toBe(`2 items · ${bytes(440_000)}`);
  });

  it('writes the time left in days, weeks or months', () => {
    expect(leavesText(0, false)).toBe('Today');
    expect(leavesText(1, false)).toBe('1 day');
    expect(leavesText(4, true)).toBe('4 days');
    expect(leavesText(15, false)).toBe('2 weeks');
    expect(leavesText(15, true)).toBe('2 wk');
    expect(leavesText(335, false)).toBe('11 months');
    expect(leavesText(335, true)).toBe('11 mo');
  });
});

describe('deleted by', () => {
  it('puts you first, then people by count, then someone, with people tones', () => {
    const items = trashItemsOf(
      [
        entry({ deletedBy: ALEX }),
        entry({ deletedBy: SAM }),
        entry({ deletedBy: SAM }),
        entry({ deletedBy: ME }),
        entry({ deletedBy: null }),
      ],
      TODAY,
      PEOPLE,
    );
    const shares = deletedByOf(items);
    expect(shares.map((share) => [share.label, share.count])).toEqual([
      ['You', 1],
      ['Sam', 2],
      ['Alex', 1],
      ['Someone', 1],
    ]);
    expect(shares.map((share) => share.tone.colour)).toEqual([
      'viz-blue',
      'viz-magenta',
      'viz-magenta',
      'on-surface-faint',
    ]);
    expect(deletedByLabel(shares)).toBe('Deleted by: You 1, Sam 2, Alex 1, Someone 1');
  });

  it('steps each further person toward the text colour, then the background', () => {
    expect(personToneOf(0)).toEqual({ colour: 'viz-magenta', toward: null, share: 1 });
    expect(personToneOf(1)).toEqual({ colour: 'viz-magenta', toward: 'on-surface', share: 0.55 });
    expect(personToneOf(2)).toEqual({ colour: 'viz-magenta', toward: 'bg', share: 0.55 });
    expect(personToneOf(3).toward).toBe('on-surface');
    expect(personToneOf(3).share).toBeCloseTo(0.3025);
  });
});

describe('leaving each month', () => {
  const items = [
    { purgeMonth: '2026-11', bytes: 1000 },
    { purgeMonth: '2027-01', bytes: 500 },
    { purgeMonth: '2027-01', bytes: 250 },
  ];

  it('sums the listed items by the month they leave, from this month on', () => {
    expect(leavingMonthsOf(items, TODAY)).toEqual([
      { month: '2026-11', bytes: 1000 },
      { month: '2026-12', bytes: 0 },
      { month: '2027-01', bytes: 750 },
    ]);
    expect(leavingMonthsOf([], TODAY)).toEqual([]);
    expect(leavingMonthsOf([{ purgeMonth: '2026-10', bytes: 5 }], TODAY)).toEqual([
      { month: '2026-11', bytes: 5 },
    ]);
  });

  it('draws one bar per month with items and skips empty months', () => {
    const shapes = leavingShapes(leavingMonthsOf(items, TODAY), 300, 'grey');
    expect(shapes.map((shape) => [shape.key, shape.fill])).toEqual([
      ['2026-11', 'grey'],
      ['2027-01', 'grey'],
    ]);
  });

  it('totals and describes the months', () => {
    const months = leavingMonthsOf(items, TODAY);
    expect(leavingTotalOf(months)).toBe(1750);
    expect(leavingLabel(months)).toContain(bytes(750));
    expect(leavingLabel([])).toBe('Nothing leaves for good in the coming months');
  });
});

describe('selection', () => {
  it('reports none, mixed and all of the shown rows', () => {
    expect(pickStateOf(0, 3)).toBe(false);
    expect(pickStateOf(1, 3)).toBe('mixed');
    expect(pickStateOf(3, 3)).toBe(true);
  });
});

describe('row layout', () => {
  it('uses the phone rows when compact and the full table only when every column fits', () => {
    expect(trashLayoutOf(true, 2000)).toBe('compact');
    expect(trashLayoutOf(false, TABLE_MIN_WIDTH)).toBe('table');
    expect(trashLayoutOf(false, TABLE_MIN_WIDTH - 1)).toBe('list');
    expect(trashLayoutOf(false, 0)).toBe('list');
  });

  it('fits the full table in about 850 px of list width', () => {
    expect(TABLE_MIN_WIDTH).toBeLessThanOrEqual(850);
  });

  it('snaps the measured width so rows only re-render when the layout changes', () => {
    expect(trashSnap(TABLE_MIN_WIDTH + 300)).toBe(TABLE_MIN_WIDTH);
    expect(trashSnap(TABLE_MIN_WIDTH - 1)).toBe(SUMMARY_SIDE_BY_SIDE_MIN);
    expect(trashSnap(SUMMARY_SIDE_BY_SIDE_MIN - 1)).toBe(0);
  });

  it('puts the summary cards side by side only when the list is wide enough', () => {
    expect(summaryWideOf('list', SUMMARY_SIDE_BY_SIDE_MIN)).toBe(true);
    expect(summaryWideOf('list', SUMMARY_SIDE_BY_SIDE_MIN - 1)).toBe(false);
    expect(summaryWideOf('compact', 2000)).toBe(false);
  });
});
