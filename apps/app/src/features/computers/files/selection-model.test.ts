import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@smarteverything/domain';
import { NOTHING_PICKED, pickedAll, selectionLabel, toggled } from './selection-model';

function entry(name: string): FileEntry {
  return {
    name,
    path: `/home/dana/${name}`,
    kind: 'file',
    size: 1,
    modifiedAt: '2026-10-15T10:00:00Z',
    hidden: false,
  };
}

describe('selection', () => {
  it('adds an item the first time and removes it the second', () => {
    const one = toggled(NOTHING_PICKED, entry('a'));
    expect([...one.keys()]).toEqual(['/home/dana/a']);
    const two = toggled(one, entry('b'));
    expect([...two.keys()]).toEqual(['/home/dana/a', '/home/dana/b']);
    expect([...toggled(two, entry('a')).keys()]).toEqual(['/home/dana/b']);
  });

  it('picks every item of a folder at once', () => {
    expect([...pickedAll([entry('a'), entry('b')]).keys()]).toEqual([
      '/home/dana/a',
      '/home/dana/b',
    ]);
    expect(pickedAll([]).size).toBe(0);
  });

  it('never changes the selection it was given', () => {
    const one = toggled(NOTHING_PICKED, entry('a'));
    toggled(one, entry('b'));
    expect(one.size).toBe(1);
    expect(NOTHING_PICKED.size).toBe(0);
  });

  it('says how many are selected', () => {
    expect(selectionLabel(1)).toBe('1 item selected');
    expect(selectionLabel(3)).toBe('3 items selected');
  });
});
