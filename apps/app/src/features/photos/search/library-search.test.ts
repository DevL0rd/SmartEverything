import { describe, expect, it } from 'vitest';
import { panelOpenOf, unusedNoteOf } from './library-search';
import { initialSearch, searchReducer } from './search-state';
import type { SearchToken } from './tokens';

const LISBON: SearchToken = { kind: 'place', placeId: 4, label: 'Lisbon, Portugal' };
const CANON: SearchToken = { kind: 'camera', label: 'Canon R6' };

describe('the Library search panel', () => {
  it('opens while words are typed and not yet searched', () => {
    const typing = searchReducer(initialSearch(''), { type: 'type', value: 'lis' });
    expect(panelOpenOf(typing, false, false, false)).toBe(true);
    const committed = searchReducer(typing, { type: 'commit' });
    expect(panelOpenOf(committed, false, true, false)).toBe(false);
  });

  it('opens on focus only when it has recent searches, try chips or the offline note to show', () => {
    const empty = initialSearch('');
    expect(panelOpenOf(empty, true, true, false)).toBe(true);
    expect(panelOpenOf(empty, true, false, false)).toBe(false);
    expect(panelOpenOf(empty, true, false, true)).toBe(true);
    expect(panelOpenOf(empty, false, true, true)).toBe(false);
  });

  it('starts searched when the Library opens with words from the address', () => {
    const opened = initialSearch(' harbour ');
    expect(opened.words).toBe('harbour');
    expect(panelOpenOf(opened, false, true, false)).toBe(false);
  });

  it('lists the filters a tab cannot use', () => {
    expect(unusedNoteOf([])).toBeNull();
    expect(unusedNoteOf([LISBON, CANON])).toBe('Not used on this tab: Lisbon, Portugal, Canon R6');
  });
});
