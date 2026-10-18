import { describe, expect, it } from 'vitest';
import {
  MAX_COLUMNS,
  VIRTUAL_MEMBERS_FROM,
  columnsFor,
  groupKeyOf,
  isVirtual,
  rowGroups,
  sameGroup,
} from './member-rows';

const members = (count: number): readonly { readonly id: string }[] =>
  Array.from({ length: count }, (_, index) => ({ id: `m${String(index)}` }));

describe('member rows of a long group', () => {
  it('virtualises a list only above thirty members', () => {
    expect(isVirtual(VIRTUAL_MEMBERS_FROM)).toBe(false);
    expect(isVirtual(VIRTUAL_MEMBERS_FROM + 1)).toBe(true);
  });

  it('fits one to three columns from the content width', () => {
    expect(columnsFor(358)).toBe(1);
    expect(columnsFor(700)).toBe(2);
    expect(columnsFor(1036)).toBe(MAX_COLUMNS);
    expect(columnsFor(3000)).toBe(MAX_COLUMNS);
    expect(columnsFor(100)).toBe(1);
  });

  it('splits members into rows keyed by their first member, keeping the order', () => {
    const groups = rowGroups(members(7), 3);
    expect(groups.map((group) => group.key)).toStrictEqual(['m0', 'm3', 'm6']);
    expect(groups.map((group) => group.members.length)).toStrictEqual([3, 3, 1]);
    expect(rowGroups([], 2)).toStrictEqual([]);
  });

  it('finds the row that holds a member', () => {
    const groups = rowGroups(members(5), 2);
    expect(groupKeyOf(groups, 'm3')).toBe('m2');
    expect(groupKeyOf(groups, 'gone')).toBeNull();
  });

  it('calls two rows the same only when they hold the same member objects', () => {
    const all = members(4);
    const [first] = rowGroups(all, 2);
    const [again] = rowGroups(all, 2);
    const [other] = rowGroups(members(4), 2);
    expect(first && again && sameGroup(first, again)).toBe(true);
    expect(first && other && sameGroup(first, other)).toBe(false);
    const [shorter] = rowGroups(all, 1);
    expect(first && shorter && sameGroup(first, shorter)).toBe(false);
  });
});
