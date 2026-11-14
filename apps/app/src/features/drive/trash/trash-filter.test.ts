import { describe, expect, it } from 'vitest';
import {
  chipCountsOf,
  filterTrash,
  isFiltered,
  NO_FILTER,
  deletableNow,
  shownText,
  TRASH_CHIPS,
  type TrashDriveOf,
} from './trash-filter';
import type { TrashItem } from './trash-model';

function item(change: Partial<TrashItem> & Pick<TrashItem, 'id' | 'name'>): TrashItem {
  return {
    rootId: '00000000-0000-4000-8000-0000000000b1',
    isFolder: false,
    bytes: 1000,
    deletedAt: 0,
    daysLeft: 300,
    kept: 0.8,
    folders: [],
    deleter: { kind: 'you' },
    ...change,
  };
}

const QUOTE = item({ id: 'q', name: 'Old tile Quote.pdf' });
const QUOTES = item({
  id: 'f',
  name: 'Quotes',
  isFolder: true,
  deleter: { kind: 'person', id: 'sam', name: 'Sam' },
});
const LEASE = item({ id: 'l', name: 'Draft lease.docx', deleter: { kind: 'unknown' } });
const ITEMS = [QUOTE, QUOTES, LEASE];

const SHARED_ROOT = '00000000-0000-4000-8000-0000000000b2';

const driveOf: TrashDriveOf = (entry) => (entry.rootId === SHARED_ROOT ? 'shared-drive' : 'mine');

const NONE = { chip: 'everything', drive: 'all', query: '' } as const;

describe('Trash filter', () => {
  it('shows everything when nothing is typed or picked', () => {
    expect(filterTrash(ITEMS, NO_FILTER, driveOf)).toBe(ITEMS);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NONE, query: '   ' })).toBe(false);
  });

  it('narrows by name without caring about case or surrounding spaces', () => {
    const filter = { ...NONE, query: '  quote ' } as const;
    expect(filterTrash(ITEMS, filter, driveOf)).toEqual([QUOTE, QUOTES]);
    expect(isFiltered(filter)).toBe(true);
  });

  it('keeps only what you deleted or only folders, combined with the typed name', () => {
    expect(filterTrash(ITEMS, { ...NONE, chip: 'mine' }, driveOf)).toEqual([QUOTE]);
    expect(filterTrash(ITEMS, { ...NONE, chip: 'folders' }, driveOf)).toEqual([QUOTES]);
    expect(filterTrash(ITEMS, { ...NONE, chip: 'folders', query: 'lease' }, driveOf)).toEqual([]);
  });

  it('keeps only the trash of the chosen drive', () => {
    const shared = item({ id: 's', name: 'Soup.md', rootId: SHARED_ROOT });
    const all = [...ITEMS, shared];
    const filter = { ...NONE, drive: 'shared-drive' } as const;
    expect(filterTrash(all, filter, driveOf)).toEqual([shared]);
    expect(isFiltered(filter)).toBe(true);
    expect(chipCountsOf(all, filter, driveOf)).toEqual({ everything: 1, mine: 1, folders: 0 });
  });

  it('counts each chip within the typed name', () => {
    expect(chipCountsOf(ITEMS, NONE, driveOf)).toEqual({ everything: 3, mine: 1, folders: 1 });
    expect(chipCountsOf(ITEMS, { ...NONE, query: 'quote' }, driveOf)).toEqual({
      everything: 2,
      mine: 1,
      folders: 1,
    });
  });

  it('offers Deleted by you to everyone, since the Shared Drive trash holds everyone’s', () => {
    expect(TRASH_CHIPS.map((chip) => chip.label)).toEqual([
      'Everything',
      'Deleted by you',
      'Folders',
    ]);
  });

  it('lets a member delete for good only their own drive’s trash and what they deleted', () => {
    const sharedByOther = item({
      id: 'o',
      name: 'Other.md',
      rootId: SHARED_ROOT,
      deleter: { kind: 'person', id: 'sam', name: 'Sam' },
    });
    const sharedByYou = item({ id: 'y', name: 'Mine.md', rootId: SHARED_ROOT });
    expect(deletableNow(QUOTES, false, driveOf)).toBe(true);
    expect(deletableNow(sharedByYou, false, driveOf)).toBe(true);
    expect(deletableNow(sharedByOther, false, driveOf)).toBe(false);
    expect(deletableNow(sharedByOther, true, driveOf)).toBe(true);
  });

  it('says how many of the whole trash are shown', () => {
    expect(shownText(2, 1200)).toBe('2 of 1,200');
  });
});
