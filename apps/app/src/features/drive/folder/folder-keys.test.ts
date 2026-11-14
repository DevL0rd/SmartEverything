import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID } from '../data/fixtures';
import {
  folderKeyFor,
  keyCommandsOf,
  keyHintsOf,
  type FolderKeyPress,
  type KeyTargets,
} from './folder-keys';
import { NO_SELECTION, selectOne, type FolderSelection } from './folder-model';

function press(key: string, change: Partial<FolderKeyPress> = {}): FolderKeyPress {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...change };
}

describe('folderKeyFor', () => {
  it('maps the folder keys', () => {
    expect(folderKeyFor(press('ArrowDown'), false)).toBe('next');
    expect(folderKeyFor(press('ArrowUp', { shiftKey: true }), false)).toBe('extendPrevious');
    expect(folderKeyFor(press('ArrowRight'), false)).toBe('forward');
    expect(folderKeyFor(press('ArrowLeft', { shiftKey: true }), false)).toBe('extendBack');
    expect(folderKeyFor(press('Enter'), false)).toBe('open');
    expect(folderKeyFor(press('Delete'), false)).toBe('trash');
    expect(folderKeyFor(press('F2'), false)).toBe('rename');
    expect(folderKeyFor(press('i'), false)).toBe('details');
    expect(folderKeyFor(press(' '), false)).toBe('quickLook');
    expect(folderKeyFor(press('/'), false)).toBe('filter');
    expect(folderKeyFor(press('a', { ctrlKey: true }), false)).toBe('selectAll');
    expect(folderKeyFor(press('A', { metaKey: true }), false)).toBe('selectAll');
  });

  it('leaves typing in a field alone except Escape', () => {
    expect(folderKeyFor(press('i'), true)).toBeNull();
    expect(folderKeyFor(press('a', { ctrlKey: true }), true)).toBeNull();
    expect(folderKeyFor(press('Delete'), true)).toBeNull();
    expect(folderKeyFor(press('Escape'), true)).toBe('clear');
  });

  it('ignores other chords and letters', () => {
    expect(folderKeyFor(press('i', { altKey: true }), false)).toBeNull();
    expect(folderKeyFor(press('c', { ctrlKey: true }), false)).toBeNull();
    expect(folderKeyFor(press('x'), false)).toBeNull();
    expect(folderKeyFor(press('Delete', { shiftKey: true }), false)).toBeNull();
  });
});

function targets(change: Partial<KeyTargets> = {}): KeyTargets {
  return {
    order: ['a', 'b', 'c'],
    grid: false,
    columns: () => 1,
    focused: null,
    picked: [],
    writable: true,
    select: () => undefined,
    open: () => undefined,
    trash: () => undefined,
    rename: () => undefined,
    toggleDetails: null,
    toggleQuickLook: null,
    focusFilter: () => undefined,
    ...change,
  };
}

describe('keyCommandsOf', () => {
  it('moves and extends the selection through the order', () => {
    let selection: FolderSelection = selectOne('a');
    const select = (change: (current: FolderSelection) => FolderSelection): void => {
      selection = change(selection);
    };
    const commands = keyCommandsOf(targets({ select }));
    commands.extendNext?.();
    expect([...selection.ids]).toEqual(['a', 'b']);
    commands.last?.();
    expect([...selection.ids]).toEqual(['c']);
    commands.clear?.();
    expect(selection).toBe(NO_SELECTION);
  });

  it('moves by a whole row in the cards view and sideways only there', () => {
    let selection: FolderSelection = selectOne('a');
    const select = (change: (current: FolderSelection) => FolderSelection): void => {
      selection = change(selection);
    };
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const cards = keyCommandsOf(targets({ order, select, grid: true, columns: () => 3 }));
    cards.next?.();
    expect(selection.focus).toBe('d');
    cards.forward?.();
    expect(selection.focus).toBe('e');
    cards.extendBack?.();
    expect([...selection.ids]).toEqual(['d', 'e']);
    cards.next?.();
    expect(selection.focus).toBe('g');
    cards.previous?.();
    expect(selection.focus).toBe('d');
    const rows = keyCommandsOf(targets({ order, select }));
    expect(rows.forward).toBeUndefined();
    expect(rows.back).toBeUndefined();
  });

  it('offers only what the folder and its slots allow', () => {
    const none = keyCommandsOf(targets());
    expect(none.open).toBeUndefined();
    expect(none.details).toBeUndefined();
    const readOnly = keyCommandsOf(targets({ writable: false, focused: null }));
    expect(readOnly.trash).toBeUndefined();
    expect(readOnly.rename).toBeUndefined();
  });

  it('opens, renames and trashes the focused rows', () => {
    const item = DRIVE_ITEM.parse({
      id: FOLDER_ID,
      rootId: ROOT_ID,
      parentId: null,
      relPath: 'Quotes',
      name: 'Quotes',
      modifiedAt: '2026-11-07T10:00:00.000Z',
      addedAt: '2026-11-07T10:00:00.000Z',
      openedAt: null,
      starred: false,
      shared: false,
      rev: 1,
      etag: 'etag',
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
    });
    const open = vi.fn();
    const rename = vi.fn();
    const trash = vi.fn();
    const toggleDetails = vi.fn();
    const commands = keyCommandsOf(
      targets({ focused: item, picked: [item], open, rename, trash, toggleDetails }),
    );
    commands.open?.();
    commands.rename?.();
    commands.trash?.();
    commands.details?.();
    expect(commands.filter).toBeDefined();
    expect(open).toHaveBeenCalledWith(item);
    expect(rename).toHaveBeenCalledWith(item);
    expect(trash).toHaveBeenCalledWith([item]);
    expect(toggleDetails).toHaveBeenCalledTimes(1);
  });
});

describe('keyHintsOf', () => {
  it('shows a hint only for what works here, and always the filter key', () => {
    expect(keyHintsOf({ quickLook: false, details: true, writable: false })).toEqual([
      { keys: 'I', action: 'details' },
      { keys: '/', action: 'filter' },
    ]);
  });
});
