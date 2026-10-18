import { describe, expect, it } from 'vitest';
import { flattenSections, reuseRows, type VirtualSection } from './virtual-list-rows';

interface Entry {
  readonly key: string;
  readonly value: number;
}

const keyOf = (item: Entry): string => item.key;
const same = (left: Entry, right: Entry): boolean =>
  left.key === right.key && left.value === right.value;

function sections(values: readonly number[]): readonly VirtualSection<Entry>[] {
  return [
    {
      key: 'room',
      title: 'Room',
      data: values.map((value, index) => ({ key: `r${String(index)}`, value })),
    },
  ];
}

describe('row reuse', () => {
  it('keeps the same row objects when every item is equal', () => {
    const before = flattenSections(sections([1, 2, 3]), keyOf);
    const after = reuseRows(before, flattenSections(sections([1, 2, 3]), keyOf), same);
    expect(after).toBe(before);
  });

  it('replaces only the rows whose item changed', () => {
    const before = flattenSections(sections([1, 2, 3]), keyOf);
    const after = reuseRows(before, flattenSections(sections([1, 9, 3]), keyOf), same);
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it('keeps rows after an inserted row and follows removals', () => {
    const before = flattenSections(sections([1, 2, 3]), keyOf);
    const shorter = reuseRows(before, flattenSections(sections([1, 2]), keyOf), same);
    expect(shorter).toHaveLength(3);
    expect(shorter[1]).toBe(before[1]);
    expect(shorter[2]).toBe(before[2]);
  });

  it('renews a header whose title changed', () => {
    const before = flattenSections(sections([1]), keyOf);
    const renamed: readonly VirtualSection<Entry>[] = [
      { key: 'room', title: 'Den', data: [{ key: 'r0', value: 1 }] },
    ];
    const after = reuseRows(before, flattenSections(renamed, keyOf), same);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
