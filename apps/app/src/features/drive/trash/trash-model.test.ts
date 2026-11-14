import { describe, expect, it } from 'vitest';
import type { DriveTrashEntry } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { deletedByLabel, deletedByOf, personToneOf } from './deleted-by';
import { leavingLabel, leavingShapes, leavingTotals, type LeavingMonth } from './leaving-bars';
import { TABLE_MIN_WIDTH, tableSnap, trashLayoutOf } from './trash-layout';
import { keptPicks, pickStateOf, toggleAll, togglePicked } from './selection';
import {
  deleterOf,
  leavesText,
  rowLabelOf,
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
    expect(rowLabelOf(item, 'Projects › Home')).toContain('deleted by you');
  });

  it('shows no size for a folder and totals the bytes', () => {
    const items = trashItemsOf(
      [entry({ isFolder: true, name: 'Quotes' }), entry({})],
      TODAY,
      PEOPLE,
    );
    const folder = items.find((item) => item.isFolder);
    if (folder === undefined) throw new Error('no folder');
    expect(sizeText(folder)).toBe('—');
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
  const months: readonly LeavingMonth[] = [
    { month: '2026-11', trashBytes: 1000, versionBytes: 0 },
    { month: '2026-12', trashBytes: 0, versionBytes: 0 },
    { month: '2027-01', trashBytes: 500, versionBytes: 500 },
  ];

  it('stacks trash under old versions and skips empty months', () => {
    const shapes = leavingShapes(months, 300, { trash: 'grey', versions: 'blue' });
    expect(shapes.map((shape) => [shape.key, shape.fill])).toEqual([
      ['2026-11-trash', 'grey'],
      ['2027-01-trash', 'grey'],
      ['2027-01-versions', 'blue'],
    ]);
    const versions = shapes.find((shape) => shape.key === '2027-01-versions');
    const trash = shapes.find((shape) => shape.key === '2027-01-trash');
    expect(versions?.bottom).toBeLessThan(trash?.top ?? 0);
  });

  it('totals and describes the months', () => {
    expect(leavingTotals(months)).toEqual({ trash: 1500, versions: 500 });
    expect(leavingLabel(months)).toContain(`trash ${bytes(500)}, versions ${bytes(500)}`);
    expect(leavingLabel([])).toBe('Nothing leaves for good in the coming months');
  });
});

describe('selection', () => {
  const items = trashItemsOf([entry({}), entry({})], TODAY, PEOPLE);

  it('ticks rows, reports mixed and toggles all', () => {
    const first = items[0]?.id ?? '';
    const one = togglePicked(new Set(), first);
    expect(pickStateOf(one, items)).toBe('mixed');
    const all = toggleAll(one, items);
    expect(pickStateOf(all, items)).toBe(true);
    expect(pickStateOf(toggleAll(all, items), items)).toBe(false);
    expect(pickStateOf(togglePicked(one, first), items)).toBe(false);
  });

  it('drops picks whose items left the trash', () => {
    const picks = new Set([items[0]?.id ?? '', 'gone']);
    expect([...keptPicks(picks, items)]).toEqual([items[0]?.id]);
    const whole = new Set(items.map((item) => item.id));
    expect(keptPicks(whole, items)).toBe(whole);
  });
});

describe('row layout', () => {
  it('uses the phone rows when compact and the full table only when every column fits', () => {
    expect(trashLayoutOf(true, 2000)).toBe('compact');
    expect(trashLayoutOf(false, TABLE_MIN_WIDTH)).toBe('table');
    expect(trashLayoutOf(false, TABLE_MIN_WIDTH - 1)).toBe('list');
    expect(trashLayoutOf(false, 0)).toBe('list');
  });

  it('snaps the measured width so rows only re-render when the layout changes', () => {
    expect(tableSnap(TABLE_MIN_WIDTH + 300)).toBe(TABLE_MIN_WIDTH);
    expect(tableSnap(TABLE_MIN_WIDTH - 300)).toBe(0);
  });
});
