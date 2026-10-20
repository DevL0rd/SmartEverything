import { describe, expect, it, vi } from 'vitest';
import type { NavEdits } from './nav-edit-actions';
import { navMenuItems, type NavMenuInput } from './nav-item-menu';
import type { NavEntry, NavFolderView } from './nav-model';
import type { NavRow } from './nav-rows';

const DEVICE = '11111111-1111-4111-8111-111111111111';

function section(name: 'home' | 'assistant'): NavEntry {
  return {
    kind: 'section',
    key: `section:${name}`,
    node: { kind: 'section', key: `section:${name}`, section: name },
    title: name,
    shortTitle: name,
    icon: 'home',
    href: '/',
    tab: name,
    active: false,
    badge: null,
    count: 0,
    missing: false,
  };
}

function pin(id: string): NavEntry {
  return {
    kind: 'pin',
    key: id,
    node: {
      kind: 'pin',
      key: id,
      missing: false,
      pin: {
        kind: 'pin',
        id,
        target: { kind: 'device', deviceId: DEVICE, focus: null },
        title: null,
        icon: null,
      },
    },
    title: id,
    shortTitle: id,
    icon: 'bulb',
    href: null,
    tab: null,
    active: false,
    badge: null,
    count: 0,
    missing: false,
  };
}

const FOLDER: NavFolderView = {
  kind: 'folder',
  key: 'f',
  title: 'Rooms',
  icon: 'folder',
  items: [],
  open: true,
  active: false,
};

const entryRow = (entry: NavEntry, parent: string | null = null): NavRow => ({
  kind: 'entry',
  key: entry.key,
  parent,
  entry,
});

const folderRow: NavRow = { kind: 'folder', key: 'f', parent: null, folder: FOLDER };

function edits(): NavEdits {
  return {
    isPinned: vi.fn(() => false),
    pin: vi.fn(),
    unpin: vi.fn(),
    move: vi.fn(),
    place: vi.fn(),
    foldInto: vi.fn(),
    newFolder: vi.fn(),
    rename: vi.fn(),
    setIcon: vi.fn(),
    ungroup: vi.fn(),
    remove: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    reset: vi.fn(),
    switchScope: vi.fn(),
  };
}

function input(row: NavRow, rows: readonly NavRow[]): NavMenuInput {
  return {
    row,
    rows,
    folders: [{ key: 'f', title: 'Rooms' }],
    edits: edits(),
    openEditor: vi.fn(),
  };
}

const labels = (menu: ReturnType<typeof navMenuItems>): readonly string[] =>
  menu.map((item) => item.label);

describe('the menu of a navigation row', () => {
  const lamp = entryRow(pin('lamp'));
  const home = entryRow(section('home'));
  const rows = [home, lamp, folderRow];

  it('lets a pin be renamed, re-iconed, moved and unpinned', () => {
    expect(labels(navMenuItems(input(lamp, rows)))).toEqual([
      'Rename',
      'Change icon',
      'Move up',
      'Move down',
      'Move to Rooms',
      'Move to a new folder',
      'Unpin',
    ]);
  });

  it('lets a section be hidden but not renamed, and never hides the assistant', () => {
    const menu = labels(navMenuItems(input(home, rows)));
    expect(menu).toContain('Hide');
    expect(menu).not.toContain('Rename');
    const assistant = entryRow(section('assistant'));
    expect(labels(navMenuItems(input(assistant, [assistant])))).not.toContain('Hide');
  });

  it('offers to move a member out of its folder and not into its own folder', () => {
    const member = entryRow(pin('m'), 'f');
    const menu = labels(navMenuItems(input(member, [folderRow, member])));
    expect(menu).toContain('Move out of folder');
    expect(menu).not.toContain('Move to Rooms');
  });

  it('lets a folder be ungrouped or deleted with its pins and never nested', () => {
    const menu = labels(navMenuItems(input(folderRow, rows)));
    expect(menu).toEqual([
      'Rename',
      'Change icon',
      'Move up',
      'Ungroup',
      'Delete folder and its pins',
    ]);
  });

  it('runs the matching edit for each item', () => {
    const request = input(lamp, rows);
    const run = (label: string): void => {
      navMenuItems(request)
        .find((item) => item.label === label)
        ?.onPress();
    };
    run('Move to Rooms');
    run('Unpin');
    run('Rename');
    expect(request.edits.place).toHaveBeenCalledWith('lamp', { parent: 'f', before: null });
    expect(request.edits.remove).toHaveBeenCalledWith('lamp');
    expect(request.openEditor).toHaveBeenCalledWith({ kind: 'rename', key: 'lamp' });
  });
});
