import { describe, expect, it } from 'vitest';
import { abilitiesOf } from '../source/abilities';
import { nodeOfEntry, type FixtureEntry } from '../source/fixture-tree';
import type { FileNode, SearchMatch } from '../source/types';
import {
  HIT_CHIP,
  asksSource,
  contentHitsOf,
  countLabelOf,
  filterCountOf,
  filterMatchesOf,
  filterTotalOf,
  filterWordsOf,
  hiddenLineOf,
  highlightOf,
  hitLineOf,
  isFinal,
  kindChipsOf,
  matchRangesOf,
  mergeMatches,
  narrowNodes,
  nodesOfKind,
  plainSnippetOf,
  scannedLineOf,
  searchAllLabelOf,
  searchStateOf,
  shownNodes,
  snippetPartsOf,
  statusLineOf,
  typedCharOf,
  type ContentHit,
} from './filter-model';

type Change = Omit<FixtureEntry, 'key' | 'parentKey' | 'name'>;

const file = (key: string, name: string, change: Change = {}): FileNode =>
  nodeOfEntry({ key, parentKey: 'p', name, ...change });

const names = (nodes: readonly FileNode[]): readonly string[] => nodes.map((node) => node.name);

const NO_HITS = new Map<string, ContentHit>();

describe('filter matching', () => {
  const nodes = [
    file('1', 'Budget 2026.xlsx'),
    file('2', 'Holiday budget.pdf'),
    file('3', 'rosebud.txt'),
    file('4', 'Café menu.pdf'),
    file('5', 'notes_budget-final.md'),
  ];

  it('matches the start of any word in the name, ignoring case and accents', () => {
    expect(names(narrowNodes(nodes, filterWordsOf('BUD'), NO_HITS))).toEqual([
      'Budget 2026.xlsx',
      'Holiday budget.pdf',
      'notes_budget-final.md',
    ]);
    expect(names(narrowNodes(nodes, filterWordsOf('cafe'), NO_HITS))).toEqual(['Café menu.pdf']);
  });

  it('needs every typed word to match and keeps everything without words', () => {
    expect(names(narrowNodes(nodes, filterWordsOf('budget hol'), NO_HITS))).toEqual([
      'Holiday budget.pdf',
    ]);
    expect(narrowNodes(nodes, filterWordsOf('  '), NO_HITS)).toBe(nodes);
  });

  it('marks and merges the matched ranges in the original name', () => {
    expect(highlightOf('Holiday budget.pdf', filterWordsOf('bud'))).toEqual({ start: 8, end: 11 });
    expect(matchRangesOf('Résumé école', filterWordsOf('ecol'))).toEqual([{ start: 7, end: 11 }]);
    expect(matchRangesOf('Budget 2026 budget', filterWordsOf('20 bud budg'))).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 9 },
    ]);
    expect(matchRangesOf('Budget', filterWordsOf('bud x'))).toBeNull();
  });
});

describe('content hits', () => {
  const budget = file('1', 'Budget 2026.xlsx');
  const letter = file('2', 'Letter.pdf');
  const scan = file('3', 'IMG_0042.jpg');
  const matches: readonly SearchMatch[] = [
    {
      node: budget,
      hit: { where: 'name', snippet: null, line: null, ranges: [{ start: 0, end: 3 }] },
    },
    {
      node: letter,
      hit: { where: 'text', snippet: 'the heating plan', line: 4, ranges: [{ start: 4, end: 11 }] },
    },
    {
      node: scan,
      hit: {
        where: 'image_text',
        snippet: 'Total heating oil',
        line: null,
        ranges: [{ start: 6, end: 13 }],
      },
    },
  ];
  const hits = contentHitsOf(matches);

  it('keeps only the hits found inside files and lets them through the name filter', () => {
    expect([...hits.keys()]).toEqual(['2', '3']);
    expect(names(narrowNodes([budget, letter, scan], filterWordsOf('heat'), hits))).toEqual([
      'Letter.pdf',
      'IMG_0042.jpg',
    ]);
    expect(HIT_CHIP.image_text).toBe('In image text');
  });

  it('names the line of a text hit', () => {
    const text = hits.get('2');
    const image = hits.get('3');
    expect(text === undefined ? null : hitLineOf(text)).toBe('In text · line 4');
    expect(image === undefined ? null : hitLineOf(image)).toBe('In image text');
  });

  it('splits a snippet by its ranges and folds white space', () => {
    expect(
      snippetPartsOf('… agreed the\nbudget for  the winter', [
        { start: 13, end: 19 },
        { start: 29, end: 35 },
      ]),
    ).toEqual([
      { text: '… agreed the ', marked: false },
      { text: 'budget', marked: true },
      { text: ' for the ', marked: false },
      { text: 'winter', marked: true },
    ]);
    expect(snippetPartsOf('all', [{ start: 0, end: 3 }])).toEqual([{ text: 'all', marked: true }]);
  });

  it('turns a marked snippet into plain text with ranges', () => {
    expect(plainSnippetOf('a [b] c [dd]', '[', ']')).toEqual({
      snippet: 'a b c dd',
      ranges: [
        { start: 2, end: 3 },
        { start: 6, end: 8 },
      ],
    });
  });

  it('adds found matches after the loaded window without duplicates', () => {
    expect(names(mergeMatches([budget], matches))).toEqual([
      'Budget 2026.xlsx',
      'Letter.pdf',
      'IMG_0042.jpg',
    ]);
    expect(mergeMatches([budget, letter, scan], matches)).toHaveLength(3);
  });

  it('offers the contents toggle only when the source searches inside files', () => {
    expect(filterMatchesOf(abilitiesOf(['searchNames']))).toEqual([]);
    expect(
      filterMatchesOf(abilitiesOf(['searchNames', 'searchContents'])).map((option) => option.value),
    ).toEqual(['names', 'contents']);
  });
});

describe('kinds and hidden names', () => {
  const nodes = [
    file('1', 'Docs', { kind: 'folder' }),
    file('2', 'a.jpg', { mime: 'image/jpeg' }),
    file('3', 'b.png'),
    file('4', '.bashrc'),
  ];

  it('counts kinds only once the folder is fully loaded', () => {
    expect(kindChipsOf(nodes, true).map((chip) => [chip.kind, chip.count])).toEqual([
      ['all', 4],
      ['folder', 1],
      ['image', 2],
      ['other', 1],
    ]);
    expect(kindChipsOf(nodes, false).every((chip) => chip.count === null)).toBe(true);
    expect(names(nodesOfKind(nodes, 'image'))).toEqual(['a.jpg', 'b.png']);
  });

  it('hides dot names until the hidden toggle is on', () => {
    expect(names(shownNodes(nodes, false))).toEqual(['Docs', 'a.jpg', 'b.png']);
    expect(shownNodes(nodes, true)).toBe(nodes);
  });
});

describe('search state and lines', () => {
  it('asks the source only while the folder is not fully loaded, or always for contents', () => {
    expect(asksSource(['a'], true, 'names')).toBe(false);
    expect(asksSource(['a'], false, 'names')).toBe(true);
    expect(asksSource(['a'], true, 'contents')).toBe(true);
    expect(asksSource([], false, 'contents')).toBe(false);
  });

  it('reads the search state in order of importance', () => {
    const base = { asked: true, online: true, running: true, failed: true, more: true };
    expect(searchStateOf({ ...base, asked: false })).toBe('unasked');
    expect(searchStateOf({ ...base, online: false })).toBe('offline');
    expect(searchStateOf(base)).toBe('failed');
    expect(searchStateOf({ ...base, failed: false })).toBe('looking');
    expect(searchStateOf({ ...base, failed: false, running: false })).toBe('more');
    expect(searchStateOf({ ...base, failed: false, running: false, more: false })).toBe('done');
    expect(isFinal(false, 'done')).toBe(true);
    expect(isFinal(false, 'more')).toBe(false);
  });

  it('counts, says what the filter hides and prefers the search line', () => {
    expect(filterTotalOf(null, [file('1', 'a')], true)).toBe(1);
    expect(filterTotalOf(file('f', 'F', { kind: 'folder' }), [], false)).toBeNull();
    expect(countLabelOf({ shown: 3, total: 48, final: false })).toBe('3+ of 48');
    expect(countLabelOf({ shown: 3, total: null, final: true })).toBe('3 found');
    expect(hiddenLineOf({ shown: 3, total: 4, final: true })).toBe(
      '1 more item hidden by the filter.',
    );
    expect(statusLineOf('done', { shown: 3, total: 4, final: true }, 'names')).toBe(
      '1 more item hidden by the filter.',
    );
    expect(statusLineOf('looking', { shown: 3, total: 4, final: false }, 'contents')).toMatch(
      /inside the files/,
    );
    expect(searchAllLabelOf('Workstation', ' invoice ')).toBe(
      'Search all of Workstation for “invoice”',
    );
  });

  it('counts search results on their own, not against the folder', () => {
    const searched = { shown: 1, asked: true, complete: true, folderTotal: 15 };
    const done = filterCountOf({ ...searched, search: 'done' });
    expect(countLabelOf(done)).toBe('1 found');
    expect(statusLineOf('done', done, 'contents')).toBeNull();
    expect(countLabelOf(filterCountOf({ ...searched, search: 'more' }))).toBe('1+ found');
    const local = filterCountOf({ ...searched, asked: false, search: 'unasked' });
    expect(countLabelOf(local)).toBe('1 of 15');
  });

  it('counts the kind chips over the results', () => {
    const results = [file('1', 'plan.txt', { kind: 'document' })];
    expect(kindChipsOf(results, true).map((chip) => [chip.label, chip.count])).toEqual([
      ['All', 1],
      ['Documents', 1],
    ]);
  });

  it('says how many files a streaming search has read', () => {
    expect(scannedLineOf(null, true)).toBeNull();
    expect(scannedLineOf(1, false)).toBe('Searched 1 file');
    expect(scannedLineOf(1200, true)).toBe('Searched 1,200 files so far');
  });

  it('takes printable characters typed outside fields only', () => {
    const press = { key: 'b', ctrlKey: false, metaKey: false, altKey: false };
    expect(typedCharOf(press, false, false)).toBe('b');
    expect(typedCharOf(press, true, false)).toBeNull();
    expect(typedCharOf(press, false, true)).toBeNull();
    expect(typedCharOf({ ...press, key: 'ArrowDown' }, false, false)).toBeNull();
    expect(typedCharOf({ ...press, ctrlKey: true }, false, false)).toBeNull();
  });
});
