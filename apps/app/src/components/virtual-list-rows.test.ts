import { describe, expect, it } from 'vitest';
import {
  flattenSections,
  headerIndices,
  indexOfItem,
  type VirtualSection,
} from './virtual-list-rows';

interface Entry {
  readonly key: string;
  readonly row: { readonly slots: readonly string[] };
}

const entry = (key: string): Entry => ({ key, row: { slots: [key] } });

const sections: readonly VirtualSection<Entry>[] = [
  { key: 'living', title: 'Living room', data: [entry('lights'), entry('r1')] },
  { key: 'kitchen', title: 'Kitchen', data: [entry('r2')] },
];

const keyOf = (item: Entry): string => item.key;

describe('flattened list rows', () => {
  it('gives a section without a title no header row and so nothing to stick', () => {
    const rows = flattenSections([{ key: 'bare', title: null, data: [entry('r1')] }], keyOf);
    expect(rows.map((row) => row.kind)).toEqual(['item']);
    expect(headerIndices(rows)).toEqual([]);
  });

  it('gives every item row its own item and never a section in its place', () => {
    const rows = flattenSections(sections, keyOf);
    const items = rows.flatMap((row) => (row.kind === 'item' ? [row.item] : []));
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.row.slots.length === 1)).toBe(true);
  });

  it('keeps each item row bound to the item it was built from after the sections change', () => {
    const before = flattenSections(sections, keyOf);
    const grown = flattenSections(
      [
        { key: 'living', title: 'Living room', data: [entry('lights'), entry('r1'), entry('r3')] },
        { key: 'kitchen', title: 'Kitchen', data: [entry('r2')] },
      ],
      keyOf,
    );
    const second = before[2];
    expect(second?.kind === 'item' ? second.item.key : null).toBe('r1');
    const moved = grown[3];
    expect(moved?.kind === 'item' ? moved.item.key : null).toBe('r3');
    expect(grown[4]?.kind).toBe('header');
  });

  it('keys rows as section and item so visibility tracking and cells agree', () => {
    expect(flattenSections(sections, keyOf).map((row) => row.key)).toEqual([
      'living:header',
      'living:lights',
      'living:r1',
      'kitchen:header',
      'kitchen:r2',
    ]);
  });

  it('marks exactly the header rows sticky, by their index in the data', () => {
    expect(headerIndices(flattenSections(sections, keyOf))).toEqual([0, 3]);
  });
});

describe('finding an item row to scroll to', () => {
  it('returns the position of the row that holds the item, counting section headers', () => {
    const rows = flattenSections(sections, keyOf);
    expect(indexOfItem(rows, keyOf, 'lights')).toBe(1);
    expect(indexOfItem(rows, keyOf, 'r2')).toBe(4);
  });

  it('returns -1 for an item that is not in the list', () => {
    expect(indexOfItem(flattenSections(sections, keyOf), keyOf, 'gone')).toBe(-1);
  });
});
