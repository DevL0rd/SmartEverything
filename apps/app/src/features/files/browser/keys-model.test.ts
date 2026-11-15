import { describe, expect, it, vi } from 'vitest';
import { nodeOfEntry } from '../source/fixture-tree';
import {
  browserKeyFor,
  keyCommandsOf,
  keyHintsOf,
  toggleOf,
  type KeyPress,
  type KeyTargets,
} from './keys-model';
import { NO_SELECTION, selectOne, type FileSelection } from './selection-model';

function press(key: string, change: Partial<KeyPress> = {}): KeyPress {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...change };
}

describe('browserKeyFor', () => {
  it('maps the browser keys', () => {
    expect(browserKeyFor(press('ArrowDown'), false)).toBe('next');
    expect(browserKeyFor(press('ArrowUp', { shiftKey: true }), false)).toBe('extendPrevious');
    expect(browserKeyFor(press('ArrowRight'), false)).toBe('forward');
    expect(browserKeyFor(press('ArrowLeft', { shiftKey: true }), false)).toBe('extendBack');
    expect(browserKeyFor(press('Enter'), false)).toBe('open');
    expect(browserKeyFor(press('Delete'), false)).toBe('trash');
    expect(browserKeyFor(press('F2'), false)).toBe('rename');
    expect(browserKeyFor(press('i'), false)).toBe('details');
    expect(browserKeyFor(press(' '), false)).toBe('quickLook');
    expect(browserKeyFor(press('/'), false)).toBe('filter');
    expect(browserKeyFor(press('a', { ctrlKey: true }), false)).toBe('selectAll');
    expect(browserKeyFor(press('A', { metaKey: true }), false)).toBe('selectAll');
  });

  it('leaves typing in a field alone except Escape', () => {
    expect(browserKeyFor(press('i'), true)).toBeNull();
    expect(browserKeyFor(press('a', { ctrlKey: true }), true)).toBeNull();
    expect(browserKeyFor(press('Delete'), true)).toBeNull();
    expect(browserKeyFor(press('Escape'), true)).toBe('clear');
  });

  it('ignores other chords and letters', () => {
    expect(browserKeyFor(press('i', { altKey: true }), false)).toBeNull();
    expect(browserKeyFor(press('c', { ctrlKey: true }), false)).toBeNull();
    expect(browserKeyFor(press('x'), false)).toBeNull();
    expect(browserKeyFor(press('Delete', { shiftKey: true }), false)).toBeNull();
  });
});

function targets(change: Partial<KeyTargets> = {}): KeyTargets {
  return {
    order: ['a', 'b', 'c'],
    grid: false,
    columns: () => 1,
    focused: null,
    picked: [],
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

function selecting(start: FileSelection): {
  readonly select: KeyTargets['select'];
  readonly now: () => FileSelection;
} {
  let selection = start;
  return {
    select: (change): void => {
      selection = change(selection);
    },
    now: () => selection,
  };
}

describe('keyCommandsOf', () => {
  it('moves and extends the selection through the order', () => {
    const rig = selecting(selectOne('a'));
    const commands = keyCommandsOf(targets({ select: rig.select }));
    commands.extendNext?.();
    expect([...rig.now().keys]).toEqual(['a', 'b']);
    commands.last?.();
    expect([...rig.now().keys]).toEqual(['c']);
    commands.clear?.();
    expect(rig.now()).toBe(NO_SELECTION);
  });

  it('moves by a whole row in the cards view and sideways only there', () => {
    const rig = selecting(selectOne('a'));
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const cards = keyCommandsOf(
      targets({ order, select: rig.select, grid: true, columns: () => 3 }),
    );
    cards.next?.();
    expect(rig.now().focus).toBe('d');
    cards.forward?.();
    expect(rig.now().focus).toBe('e');
    cards.extendBack?.();
    expect([...rig.now().keys]).toEqual(['d', 'e']);
    const rows = keyCommandsOf(targets({ order, select: rig.select }));
    expect(rows.forward).toBeUndefined();
    expect(rows.back).toBeUndefined();
  });

  it('opens, renames and trashes the focused writable rows', () => {
    const node = nodeOfEntry({ key: 'n', parentKey: 'p', name: 'Quotes', kind: 'folder' });
    const open = vi.fn();
    const rename = vi.fn();
    const trash = vi.fn();
    const toggleDetails = vi.fn();
    const commands = keyCommandsOf(
      targets({ focused: node, picked: [node], open, rename, trash, toggleDetails }),
    );
    commands.open?.();
    commands.rename?.();
    commands.trash?.();
    commands.details?.();
    expect(open).toHaveBeenCalledWith(node);
    expect(rename).toHaveBeenCalledWith(node);
    expect(trash).toHaveBeenCalledWith([node]);
    expect(toggleDetails).toHaveBeenCalledTimes(1);
  });

  it('leaves rename and trash off for read-only rows or when the source has none', () => {
    const node = nodeOfEntry({ key: 'n', parentKey: 'p', name: 'a.txt', writable: false });
    const readOnly = keyCommandsOf(targets({ focused: node, picked: [node] }));
    expect(readOnly.rename).toBeUndefined();
    expect(readOnly.trash).toBeUndefined();
    const writable = nodeOfEntry({ key: 'w', parentKey: 'p', name: 'b.txt' });
    const none = keyCommandsOf(
      targets({ focused: writable, picked: [writable], rename: null, trash: null }),
    );
    expect(none.rename).toBeUndefined();
    expect(none.trash).toBeUndefined();
    expect(keyCommandsOf(targets()).open).toBeUndefined();
  });

  it('toggles a panel only when it exists', () => {
    const set = vi.fn();
    expect(toggleOf(false, false, set)).toBeNull();
    toggleOf(true, true, set)?.();
    expect(set).toHaveBeenCalledWith(false);
  });
});

describe('keyHintsOf', () => {
  it('shows a hint only for what works here, and always the filter key', () => {
    expect(keyHintsOf({ quickLook: false, details: true, rename: false })).toEqual([
      { keys: 'I', action: 'details' },
      { keys: '/', action: 'filter' },
    ]);
  });
});
