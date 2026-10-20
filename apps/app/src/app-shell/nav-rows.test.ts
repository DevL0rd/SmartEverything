import { describe, expect, it } from 'vitest';
import type { NavEntry, NavFolderView, NavNodeView } from './nav-model';
import { navRows, topRows } from './nav-rows';

function entry(key: string): NavEntry {
  return {
    kind: 'section',
    key,
    node: null,
    title: key,
    shortTitle: key,
    icon: 'home',
    href: '/',
    tab: 'home',
    active: false,
    badge: null,
    count: 0,
    missing: false,
  };
}

function folder(key: string, open: boolean, members: readonly string[]): NavFolderView {
  return {
    kind: 'folder',
    key,
    title: key,
    icon: 'folder',
    items: members.map(entry),
    open,
    active: false,
  };
}

const NODES: readonly NavNodeView[] = [entry('a'), folder('f', false, ['m1', 'm2']), entry('b')];

describe('the rows of the sidebar list', () => {
  it('lists a closed folder as one row and an open folder with its members', () => {
    expect(navRows(NODES, false).map((row) => row.key)).toEqual(['a', 'f', 'b']);
    const open: readonly NavNodeView[] = [entry('a'), folder('f', true, ['m1', 'm2'])];
    expect(navRows(open, false).map((row) => `${row.parent ?? '-'}/${row.key}`)).toEqual([
      '-/a',
      '-/f',
      'f/m1',
      'f/m2',
    ]);
  });

  it('expands every folder while editing', () => {
    expect(navRows(NODES, true).map((row) => row.key)).toEqual(['a', 'f', 'm1', 'm2', 'b']);
  });
});

describe('topRows', () => {
  it('keeps only top-level rows even when a folder is open', () => {
    const open: readonly NavNodeView[] = [entry('a'), folder('f', true, ['m1', 'm2']), entry('b')];
    expect(topRows(open).map((row) => row.key)).toEqual(['a', 'f', 'b']);
  });
});
