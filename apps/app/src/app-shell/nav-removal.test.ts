import { describe, expect, it, vi, type Mock } from 'vitest';
import type { NavFolderView, NavPinEntry, NavSectionEntry } from './nav-model';
import { removalMenuItem, removalOf, removeNavNode, type NavRemovalEdits } from './nav-removal';

const face = {
  title: 'Item',
  shortTitle: 'Item',
  icon: 'home',
  active: false,
  badge: null,
  count: 0,
  missing: false,
} as const;

const section = (name: 'home' | 'assistant', hasNode = true): NavSectionEntry => ({
  ...face,
  kind: 'section',
  key: `section:${name}`,
  node: hasNode ? { kind: 'section', key: `section:${name}`, section: name } : null,
  href: '/',
  tab: name,
});

const pin: NavPinEntry = {
  ...face,
  kind: 'pin',
  key: 'pin1',
  node: {
    kind: 'pin',
    key: 'pin1',
    missing: false,
    pin: {
      kind: 'pin',
      id: 'pin1',
      target: { kind: 'section', section: 'home' },
      title: null,
      icon: null,
    },
  },
  href: null,
  tab: null,
};

const folder: NavFolderView = {
  kind: 'folder',
  key: 'folder1',
  title: 'Folder',
  icon: 'folder',
  items: [],
  open: false,
  active: false,
};

function edits(): NavRemovalEdits & {
  readonly ungroup: Mock<NavRemovalEdits['ungroup']>;
  readonly remove: Mock<NavRemovalEdits['remove']>;
  readonly hide: Mock<NavRemovalEdits['hide']>;
} {
  return {
    ungroup: vi.fn<NavRemovalEdits['ungroup']>(),
    remove: vi.fn<NavRemovalEdits['remove']>(),
    hide: vi.fn<NavRemovalEdits['hide']>(),
  };
}

describe('removing a navigation node', () => {
  it('ungroups a folder, unpins a pin and hides a page', () => {
    expect(removalOf(folder)).toEqual({ kind: 'ungroup' });
    expect(removalOf(pin)).toEqual({ kind: 'unpin' });
    expect(removalOf(section('home'))).toEqual({ kind: 'hide', section: 'home' });
  });

  it('cannot remove the assistant or a section that has no node of its own', () => {
    expect(removalOf(section('assistant'))).toBeNull();
    expect(removalOf(section('home', false))).toBeNull();
  });

  it('keeps pins when ungrouping and edits the matching layer for each kind', () => {
    const calls = edits();
    removeNavNode({ kind: 'ungroup' }, 'folder1', calls);
    removeNavNode({ kind: 'unpin' }, 'pin1', calls);
    removeNavNode({ kind: 'hide', section: 'home' }, 'section:home', calls);
    expect(calls.ungroup).toHaveBeenCalledWith('folder1', true);
    expect(calls.remove).toHaveBeenCalledWith('pin1');
    expect(calls.hide).toHaveBeenCalledWith('home');
  });

  it('words each kind as a menu item and marks unpinning destructive', () => {
    const calls = edits();
    const unpin = removalMenuItem({ kind: 'unpin' }, 'pin1', calls);
    expect(unpin).toMatchObject({ label: 'Unpin', destructive: true });
    unpin.onPress();
    expect(calls.remove).toHaveBeenCalledWith('pin1');
    expect(removalMenuItem({ kind: 'hide', section: 'home' }, 'section:home', calls)).toMatchObject(
      { label: 'Hide', icon: 'eyeOff' },
    );
  });
});
