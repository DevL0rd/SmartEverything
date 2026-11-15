import { describe, expect, it } from 'vitest';
import { abilitiesOf } from '../source/abilities';
import { nodeOfEntry } from '../source/fixture-tree';
import {
  DEFAULT_SORT,
  columnSort,
  sortLabelOf,
  sortNodes,
  sortOfValue,
  sortOptionsOf,
  sortValueOf,
  sortWithin,
} from './sort-model';

const nodes = [
  nodeOfEntry({
    key: '1',
    parentKey: 'p',
    name: 'file 10.txt',
    size: 5,
    modifiedAt: '2026-11-01T00:00:00Z',
    byProfileId: 'sam',
  }),
  nodeOfEntry({
    key: '2',
    parentKey: 'p',
    name: 'file 2.txt',
    size: 50,
    modifiedAt: '2026-11-03T00:00:00Z',
    byProfileId: 'alex',
  }),
  nodeOfEntry({ key: '3', parentKey: 'p', name: 'Zeta', kind: 'folder' }),
  nodeOfEntry({ key: '4', parentKey: 'p', name: 'alpha', kind: 'folder' }),
];

const names = (sorted: readonly { readonly name: string }[]): readonly string[] =>
  sorted.map((node) => node.name);

const byName = (id: string | null): string | null => id;

describe('sort', () => {
  it('keeps folders first and orders names naturally', () => {
    expect(names(sortNodes(nodes, DEFAULT_SORT, byName))).toEqual([
      'alpha',
      'Zeta',
      'file 2.txt',
      'file 10.txt',
    ]);
  });

  it('keeps folders first when sorting by size, largest first, and by modified and person', () => {
    expect(names(sortNodes(nodes, { field: 'size', direction: 'desc' }, byName)).slice(2)).toEqual([
      'file 2.txt',
      'file 10.txt',
    ]);
    expect(
      names(sortNodes(nodes, { field: 'modifiedAt', direction: 'asc' }, byName)).slice(2),
    ).toEqual(['file 10.txt', 'file 2.txt']);
    expect(names(sortNodes(nodes, { field: 'by', direction: 'asc' }, byName)).slice(2)).toEqual([
      'file 2.txt',
      'file 10.txt',
    ]);
  });

  it('flips a column on the second press and starts a new column at its natural direction', () => {
    expect(columnSort(DEFAULT_SORT, 'name')).toEqual({ field: 'name', direction: 'desc' });
    expect(columnSort(DEFAULT_SORT, 'size')).toEqual({ field: 'size', direction: 'desc' });
    expect(columnSort(DEFAULT_SORT, 'by')).toEqual({ field: 'by', direction: 'asc' });
  });

  it('offers only the fields the source sorts by and round trips the chip value', () => {
    const options = sortOptionsOf(['name', 'size']);
    expect(options.map((option) => option.value)).toEqual([
      'name:asc',
      'name:desc',
      'size:asc',
      'size:desc',
    ]);
    const sort = { field: 'size', direction: 'desc' } as const;
    expect(sortOfValue(sortValueOf(sort), ['name', 'size'])).toEqual(sort);
    expect(sortOfValue('by:asc', ['name', 'size'])).toBeNull();
    expect(sortOfValue('name:up', ['name'])).toBeNull();
    expect(sortLabelOf(sort)).toBe('Size, largest first');
  });

  it('falls back to name when the source cannot sort by the chosen field', () => {
    const abilities = abilitiesOf([], { sort: ['name', 'size'] });
    expect(sortWithin({ field: 'by', direction: 'asc' }, abilities)).toBe(DEFAULT_SORT);
    expect(sortWithin({ field: 'size', direction: 'asc' }, abilities)).toEqual({
      field: 'size',
      direction: 'asc',
    });
  });
});
