import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, DRIVE_QUERY, SMART_RULE, type DriveItem } from '@smarteverything/domain';
import { FOLDER_ID, OTHER_FOLDER_ID, OTHER_ROOT_ID, ROOT_ID } from '../data/fixtures';
import {
  asksHub,
  childrenOf,
  countLabelOf,
  filterTotalOf,
  filterWordsOf,
  hiddenLineOf,
  highlightOf,
  hubQueryOf,
  hubStateOf,
  isFinal,
  matchRangesOf,
  mergeMatches,
  narrowItems,
  searchAllLabelOf,
  smartRuleOf,
  statusLineOf,
  typedCharOf,
} from './filter-model';

const AT = '2026-11-07T10:00:00.000Z';

function idOf(index: number): string {
  return `d1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

interface Place {
  readonly rootId?: string;
  readonly parentId?: string | null;
}

function base(index: number, name: string, place: Place): object {
  return {
    id: idOf(index),
    rootId: place.rootId ?? ROOT_ID,
    parentId: place.parentId === undefined ? FOLDER_ID : place.parentId,
    relPath: `Projects/${name}`,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'etag',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

function file(index: number, name: string, place: Place = {}): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name, place),
    kind: 'document',
    mime: 'application/pdf',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  });
}

function folder(childCount: number): DriveItem {
  return DRIVE_ITEM.parse({ ...base(99, 'Projects', {}), kind: 'folder', childCount, bytes: 10 });
}

const names = (items: readonly DriveItem[]): readonly string[] => items.map((item) => item.name);

const PLACE = { rootId: ROOT_ID, folderId: FOLDER_ID };

describe('filter matching', () => {
  const items = [
    file(1, 'Budget 2026.xlsx'),
    file(2, 'Holiday budget.pdf'),
    file(3, 'rosebud.txt'),
    file(4, 'Café menu.pdf'),
    file(5, 'notes_budget-final.md'),
  ];

  it('matches the start of any word in the name, ignoring case', () => {
    expect(names(narrowItems(items, filterWordsOf('BUD')))).toEqual([
      'Budget 2026.xlsx',
      'Holiday budget.pdf',
      'notes_budget-final.md',
    ]);
  });

  it('does not match inside a word, as the hub search does not', () => {
    expect(names(narrowItems(items, filterWordsOf('ebud')))).toEqual([]);
  });

  it('needs every typed word to match', () => {
    expect(names(narrowItems(items, filterWordsOf('bud 20')))).toEqual(['Budget 2026.xlsx']);
  });

  it('ignores accents on both sides', () => {
    expect(names(narrowItems(items, filterWordsOf('cafe')))).toEqual(['Café menu.pdf']);
    expect(names(narrowItems(items, filterWordsOf('CAFÉ')))).toEqual(['Café menu.pdf']);
  });

  it('keeps every item when the text has no words', () => {
    expect(filterWordsOf('  ·  ')).toEqual([]);
    expect(narrowItems(items, [])).toBe(items);
  });
});

describe('filter highlight ranges', () => {
  it('marks the matched start of the word in the original name', () => {
    expect(matchRangesOf('Holiday budget.pdf', filterWordsOf('bud'))).toEqual([
      { start: 8, end: 11 },
    ]);
    expect(highlightOf('Holiday budget.pdf', filterWordsOf('bud'))).toEqual({ start: 8, end: 11 });
  });

  it('maps ranges back through accented letters', () => {
    expect(matchRangesOf('Résumé école', filterWordsOf('ecol'))).toEqual([{ start: 7, end: 11 }]);
    expect(matchRangesOf('Café menu', filterWordsOf('cafe'))).toEqual([{ start: 0, end: 4 }]);
  });

  it('orders and merges the ranges of several words', () => {
    expect(matchRangesOf('Budget 2026 budget', filterWordsOf('20 bud budg'))).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 9 },
    ]);
  });

  it('has no range when a word does not match', () => {
    expect(matchRangesOf('Budget', filterWordsOf('bud x'))).toBeNull();
    expect(highlightOf('Budget', [])).toBeNull();
  });
});

describe('filter window versus hub query', () => {
  it('asks the hub only while the folder is not fully loaded and text is typed', () => {
    expect(asksHub(filterWordsOf('bud'), false)).toBe(true);
    expect(asksHub(filterWordsOf('bud'), true)).toBe(false);
    expect(asksHub([], false)).toBe(false);
  });

  it('sends the same text to the hub, scoped to this folder', () => {
    const query = hubQueryOf('  bud ', PLACE);
    expect(query).toEqual({
      text: 'bud',
      rootId: ROOT_ID,
      folderId: FOLDER_ID,
      kinds: null,
      starred: null,
      duration: null,
      taken: null,
      sort: { field: 'name', direction: 'asc' },
    });
    expect(DRIVE_QUERY.parse({ ...query, cursor: null })).toEqual({ ...query, cursor: null });
    expect(hubQueryOf('  ', PLACE).text).toBeNull();
  });

  it('keeps only hub results that sit directly in this folder', () => {
    const found = [
      file(1, 'bud.txt'),
      file(2, 'deep bud.txt', { parentId: OTHER_FOLDER_ID }),
      file(3, 'other root bud.txt', { rootId: OTHER_ROOT_ID }),
    ];
    expect(names(childrenOf(found, PLACE))).toEqual(['bud.txt']);
    const top = [file(4, 'top.txt', { parentId: null }), file(5, 'inner.txt')];
    expect(names(childrenOf(top, { rootId: ROOT_ID, folderId: null }))).toEqual(['top.txt']);
  });

  it('adds hub matches after the loaded window without duplicates', () => {
    const loaded = [file(1, 'a'), file(2, 'b')];
    expect(mergeMatches(loaded, [])).toBe(loaded);
    expect(names(mergeMatches(loaded, [file(2, 'b'), file(3, 'c')]))).toEqual(['a', 'b', 'c']);
  });

  it('reads the hub state in order of importance', () => {
    const quiet = { asked: true, online: true, fetching: false, failed: false, more: false };
    expect(hubStateOf({ ...quiet, asked: false, online: false })).toBe('unasked');
    expect(hubStateOf({ ...quiet, online: false, failed: true })).toBe('offline');
    expect(hubStateOf({ ...quiet, failed: true, fetching: true })).toBe('failed');
    expect(hubStateOf({ ...quiet, fetching: true, more: true })).toBe('looking');
    expect(hubStateOf({ ...quiet, more: true })).toBe('more');
    expect(hubStateOf(quiet)).toBe('done');
  });

  it('knows the match count is final only for a full window or a finished hub search', () => {
    expect(isFinal(true, 'unasked')).toBe(true);
    expect(isFinal(false, 'done')).toBe(true);
    expect(isFinal(false, 'more')).toBe(false);
    expect(isFinal(false, 'offline')).toBe(false);
  });
});

describe('filter counts and lines', () => {
  it('counts against the loaded items when the folder is fully loaded', () => {
    expect(filterTotalOf(folder(48), [file(1, 'a')], true)).toBe(1);
    expect(filterTotalOf(folder(48), [file(1, 'a')], false)).toBe(48);
    expect(filterTotalOf(null, [file(1, 'a')], false)).toBeNull();
  });

  it('says 3 of 48, with a plus while more may match', () => {
    expect(countLabelOf({ shown: 3, total: 48, final: true })).toBe('3 of 48');
    expect(countLabelOf({ shown: 3, total: 48, final: false })).toBe('3+ of 48');
    expect(countLabelOf({ shown: 3, total: null, final: true })).toBe('3 found');
    expect(countLabelOf({ shown: 1200, total: 4800, final: true })).toBe('1,200 of 4,800');
  });

  it('tells how many items the filter hides', () => {
    expect(hiddenLineOf({ shown: 3, total: 48, final: true })).toBe(
      '45 more items hidden by the filter.',
    );
    expect(hiddenLineOf({ shown: 47, total: 48, final: true })).toBe(
      '1 more item hidden by the filter.',
    );
    expect(hiddenLineOf({ shown: 3, total: 48, final: false })).toBeNull();
    expect(hiddenLineOf({ shown: 48, total: 48, final: true })).toBeNull();
  });

  it('offers Search all of Drive with the same text', () => {
    expect(searchAllLabelOf('  plan ')).toBe('Search all of Drive for “plan”');
  });

  it('prefers the hub line over the hidden count', () => {
    const done = { shown: 3, total: 48, final: true };
    expect(statusLineOf('looking', done)).toBe('Looking through the rest of this folder…');
    expect(statusLineOf('unasked', done)).toBe('45 more items hidden by the filter.');
  });
});

describe('filter smart folder rule', () => {
  it('saves the text as a name rule in this folder', () => {
    const rule = smartRuleOf(' bud ', PLACE);
    expect(SMART_RULE.parse(rule)).toEqual({
      match: 'all',
      rules: [
        { kind: 'text', field: 'name', contains: 'bud' },
        { kind: 'in_folder', folderId: FOLDER_ID },
      ],
    });
  });

  it('uses the drive at its top level', () => {
    const rule = smartRuleOf('bud', { rootId: ROOT_ID, folderId: null });
    expect(SMART_RULE.parse(rule).rules[1]).toEqual({ kind: 'in_root', rootId: ROOT_ID });
  });
});

describe('typing anywhere starts the filter', () => {
  const press = { ctrlKey: false, metaKey: false, altKey: false };

  it('takes printable characters', () => {
    expect(typedCharOf({ ...press, key: 'b' }, false, false)).toBe('b');
    expect(typedCharOf({ ...press, key: 'É' }, false, false)).toBe('É');
    expect(typedCharOf({ ...press, key: '2' }, false, false)).toBe('2');
  });

  it('leaves folder shortcuts, chords, named keys and text fields alone', () => {
    expect(typedCharOf({ ...press, key: 'i' }, true, false)).toBeNull();
    expect(typedCharOf({ ...press, key: 'a', ctrlKey: true }, false, false)).toBeNull();
    expect(typedCharOf({ ...press, key: 'a', altKey: true }, false, false)).toBeNull();
    expect(typedCharOf({ ...press, key: 'Tab' }, false, false)).toBeNull();
    expect(typedCharOf({ ...press, key: ' ' }, false, false)).toBeNull();
    expect(typedCharOf({ ...press, key: 'b' }, false, true)).toBeNull();
  });
});
