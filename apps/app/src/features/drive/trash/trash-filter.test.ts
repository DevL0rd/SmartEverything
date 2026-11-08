import { describe, expect, it } from 'vitest';
import {
  chipCountsOf,
  filterTrash,
  isFiltered,
  NO_FILTER,
  shownText,
  trashChipsOf,
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

describe('Trash filter', () => {
  it('shows everything when nothing is typed or picked', () => {
    expect(filterTrash(ITEMS, NO_FILTER)).toBe(ITEMS);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ chip: 'everything', query: '   ' })).toBe(false);
  });

  it('narrows by name without caring about case or surrounding spaces', () => {
    const filter = { chip: 'everything', query: '  quote ' } as const;
    expect(filterTrash(ITEMS, filter)).toEqual([QUOTE, QUOTES]);
    expect(isFiltered(filter)).toBe(true);
  });

  it('keeps only what you deleted or only folders, combined with the typed name', () => {
    expect(filterTrash(ITEMS, { chip: 'mine', query: '' })).toEqual([QUOTE]);
    expect(filterTrash(ITEMS, { chip: 'folders', query: '' })).toEqual([QUOTES]);
    expect(filterTrash(ITEMS, { chip: 'folders', query: 'lease' })).toEqual([]);
  });

  it('counts each chip within the typed name', () => {
    expect(chipCountsOf(ITEMS, '')).toEqual({ everything: 3, mine: 1, folders: 1 });
    expect(chipCountsOf(ITEMS, 'quote')).toEqual({ everything: 2, mine: 1, folders: 1 });
  });

  it('offers Deleted by you only to the owner, since members only see their own', () => {
    expect(trashChipsOf(true).map((chip) => chip.label)).toEqual([
      'Everything',
      'Deleted by you',
      'Folders',
    ]);
    expect(trashChipsOf(false).map((chip) => chip.label)).toEqual(['Everything', 'Folders']);
  });

  it('says how many of the whole trash are shown', () => {
    expect(shownText(2, 1200)).toBe('2 of 1,200');
  });
});
