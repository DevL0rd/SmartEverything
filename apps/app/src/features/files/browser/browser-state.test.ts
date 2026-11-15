import { describe, expect, it } from 'vitest';
import { locationKeyOf } from '../source/types';
import {
  initialStateOf,
  reduceBrowser,
  type BrowserAction,
  type BrowserState,
} from './browser-state';
import { nodeOfEntry } from '../source/fixture-tree';
import {
  focusedOf,
  NO_KEYS,
  pickedOf,
  pressModeOf,
  selectAllOf,
  selectOne,
} from './selection-model';

const HOME = { place: '/home/dana', folder: null };
const PROJECTS = { place: '/home/dana', folder: '/home/dana/Projects' };

function act(state: BrowserState, action: BrowserAction, at = locationKeyOf(HOME)): BrowserState {
  return reduceBrowser(state, { at, action });
}

describe('browser state', () => {
  it('starts in the list view sorted by name with nothing selected', () => {
    const state = initialStateOf(HOME);
    expect([state.view, state.sort, state.showHidden, state.selection.keys.size]).toEqual([
      'list',
      { field: 'name', direction: 'asc' },
      false,
      0,
    ]);
  });

  it('keeps sort, view and hidden but clears filter, selection and Quick Look on a new folder', () => {
    let state = initialStateOf(HOME);
    state = act(state, { kind: 'view', view: 'cards' });
    state = act(state, { kind: 'sort', sort: { field: 'size', direction: 'desc' } });
    state = act(state, { kind: 'showHidden', show: true });
    state = act(state, { kind: 'filter', change: { text: 'inv', match: 'contents' } });
    state = act(state, { kind: 'select', change: () => selectOne('a') });
    state = act(state, { kind: 'panel', panel: 'quickLook', open: true });
    state = act(state, { kind: 'panel', panel: 'details', open: true });
    const moved = act(state, { kind: 'view', view: 'cards' }, locationKeyOf(PROJECTS));
    expect([moved.view, moved.sort.field, moved.showHidden]).toEqual(['cards', 'size', true]);
    expect([moved.filter.text, moved.selection.keys.size]).toEqual(['', 0]);
    expect([...moved.panels]).toEqual(['details']);
  });

  it('leaves selection mode when the selection empties and clears it when leaving', () => {
    let state = act(initialStateOf(HOME), { kind: 'selecting', on: true });
    state = act(state, { kind: 'select', change: () => selectAllOf(['a', 'b']) });
    expect(state.selecting).toBe(true);
    state = act(state, { kind: 'keep', order: [] });
    expect([state.selecting, state.selection.keys.size]).toEqual([false, 0]);
    state = act(act(state, { kind: 'selecting', on: true }), {
      kind: 'select',
      change: () => selectOne('a'),
    });
    expect(act(state, { kind: 'selecting', on: false }).selection.keys.size).toBe(0);
  });

  it('focuses an opened file without selecting it, so the next press opens', () => {
    const nodes = ['a', 'b'].map((key) => nodeOfEntry({ key, parentKey: 'p', name: `${key}.txt` }));
    let state = act(initialStateOf(HOME), { kind: 'focus', key: 'a' });
    state = act(state, { kind: 'panel', panel: 'quickLook', open: true });
    expect(pickedOf(nodes, state.selection)).toEqual([]);
    expect(focusedOf(nodes, state.selection)?.key).toBe('a');
    expect([state.selecting, pressModeOf(nodes, state.selection, NO_KEYS)]).toEqual([
      false,
      'open',
    ]);
    expect(pressModeOf(nodes, state.selection, { shift: false, toggle: true })).toBe('pick');
    expect(pressModeOf(nodes, state.selection, { shift: true, toggle: false })).toBe('pick');
    state = act(state, { kind: 'panel', panel: 'quickLook', open: false });
    expect([state.selection.keys.size, pressModeOf(nodes, state.selection, NO_KEYS)]).toEqual([
      0,
      'open',
    ]);
  });

  it('moves focus inside a selection without changing the picked rows', () => {
    const state = act(act(initialStateOf(HOME), { kind: 'select', change: () => selectOne('a') }), {
      kind: 'focus',
      key: 'b',
    });
    expect([[...state.selection.keys], state.selection.focus]).toEqual([['a'], 'b']);
  });

  it('keeps the same state when the listing still holds the selection', () => {
    const state = act(initialStateOf(HOME), { kind: 'select', change: () => selectOne('a') });
    expect(act(state, { kind: 'keep', order: ['a', 'b'] })).toBe(state);
  });

  it('clears the filter on request and merges filter changes', () => {
    let state = act(initialStateOf(HOME), { kind: 'filter', change: { text: 'a' } });
    state = act(state, { kind: 'filter', change: { kind: 'image' } });
    expect(state.filter).toEqual({ text: 'a', match: 'names', kind: 'image' });
    expect(act(state, { kind: 'clearFilter' }).filter.text).toBe('');
  });
});
