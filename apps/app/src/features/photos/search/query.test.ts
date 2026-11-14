import { describe, expect, it } from 'vitest';
import { isSearching, smartRuleOf, typedTextOf } from './query';
import { initialSearch, isTyping, queryInputOf, searchMoved, searchReducer } from './search-state';
import { addToken, removeLastToken, searchTitleOf, type SearchToken } from './tokens';

const PORTUGAL: SearchToken = { kind: 'country', countryCode: 'PT', label: 'Portugal' };
const YEAR: SearchToken = { kind: 'date', from: '2026-01-01', to: '2026-12-31', label: '2026' };
const VIDEOS: SearchToken = { kind: 'media', media: 'video', label: 'Videos' };
const PHOTOS: SearchToken = { kind: 'media', media: 'image', label: 'Photos' };
const SONY: SearchToken = { kind: 'camera', label: 'Sony A7 IV' };
const FAVOURITES: SearchToken = { kind: 'favourites', label: 'Favourites' };

describe('photo search tokens', () => {
  it('adds a token once and keeps one date and one kind at a time', () => {
    const once = addToken(addToken([PORTUGAL], PORTUGAL), YEAR);
    expect(once).toStrictEqual([PORTUGAL, YEAR]);
    const may: SearchToken = {
      kind: 'date',
      from: '2025-05-01',
      to: '2025-05-31',
      label: 'May 2025',
    };
    expect(addToken(once, may)).toStrictEqual([PORTUGAL, may]);
    expect(addToken(addToken([], VIDEOS), PHOTOS)).toStrictEqual([PHOTOS]);
  });

  it('removes the last token on Backspace in an empty field and nothing while text is typed', () => {
    expect(removeLastToken([PORTUGAL, YEAR])).toStrictEqual([PORTUGAL]);
    const held = searchReducer(
      searchReducer(initialSearch(''), { type: 'pick', token: PORTUGAL }),
      {
        type: 'pick',
        token: YEAR,
      },
    );
    expect(searchReducer(held, { type: 'backspace' }).tokens).toStrictEqual([PORTUGAL]);
    const typing = searchReducer(held, { type: 'type', value: 'si' });
    expect(searchReducer(typing, { type: 'backspace' }).tokens).toStrictEqual([PORTUGAL, YEAR]);
  });

  it('searches typed words only after Enter and clears them with the text', () => {
    const typed = searchReducer(initialSearch(''), { type: 'type', value: 'sunset' });
    expect(isTyping(typed)).toBe(true);
    expect(isSearching(queryInputOf(typed))).toBe(false);
    const committed = searchReducer(typed, { type: 'commit' });
    expect(isTyping(committed)).toBe(false);
    expect(queryInputOf(committed).text).toBe('sunset');
    expect(queryInputOf(searchReducer(committed, { type: 'type', value: '' })).text).toBe('');
  });

  it('names a search by its tokens and words', () => {
    expect(searchTitleOf([PORTUGAL, YEAR], ' sunset ')).toBe('Portugal · 2026 · sunset');
  });
});

describe('the typed search words', () => {
  it('keeps only the typed words, trimmed, and none when the field is empty', () => {
    expect(typedTextOf({ tokens: [PORTUGAL, YEAR], text: '  beach ' })).toBe('beach');
    expect(typedTextOf({ tokens: [PORTUGAL], text: '   ' })).toBeNull();
    expect(typedTextOf({ tokens: [], text: '' })).toBeNull();
  });
});

describe('save as smart album', () => {
  it('turns dates, kinds, favourites and cameras into rules', () => {
    expect(smartRuleOf({ tokens: [YEAR, VIDEOS, FAVOURITES, SONY], text: '' })).toStrictEqual({
      match: 'all',
      rules: [
        { kind: 'date_range', field: 'takenAt', from: '2026-01-01', to: '2026-12-31' },
        { kind: 'item_kind', itemKinds: ['video'] },
        { kind: 'starred', starred: true },
        { kind: 'text', field: 'camera', contains: 'Sony A7 IV' },
      ],
    });
  });

  it('keeps a smart album to photos and videos when no kind is chosen', () => {
    expect(smartRuleOf({ tokens: [YEAR], text: '' })?.rules).toContainEqual({
      kind: 'item_kind',
      itemKinds: ['image', 'video'],
    });
  });

  it('offers no smart album for places, albums, typed words or an empty search', () => {
    expect(smartRuleOf({ tokens: [PORTUGAL, YEAR], text: '' })).toBeNull();
    expect(smartRuleOf({ tokens: [YEAR], text: 'sunset' })).toBeNull();
    expect(smartRuleOf({ tokens: [], text: '' })).toBeNull();
  });

  it('moves on, clearing a selection, when the filters or words change or typing starts', () => {
    const held = searchReducer(initialSearch(''), { type: 'pick', token: PORTUGAL });
    expect(searchMoved(held, searchReducer(held, { type: 'pick', token: YEAR }))).toBe(true);
    expect(searchMoved(held, searchReducer(held, { type: 'remove', token: PORTUGAL }))).toBe(true);
    expect(searchMoved(held, searchReducer(held, { type: 'type', value: 'li' }))).toBe(true);
    expect(searchMoved(held, searchReducer(held, { type: 'pick', token: PORTUGAL }))).toBe(false);
    expect(searchMoved(held, searchReducer(held, { type: 'commit' }))).toBe(false);
  });
});
