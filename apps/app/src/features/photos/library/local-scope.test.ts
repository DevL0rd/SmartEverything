import { describe, expect, it } from 'vitest';
import type { LocalLibraryState, LocalMediaItem } from '../local/types';
import { deviceCountOf, deviceViewOf, pickedLocalItems, pickedLocalText } from './local-scope';

const ITEM: LocalMediaItem = {
  id: 'a1',
  name: 'IMG_0001.jpg',
  takenAt: Date.parse('2026-11-01T10:00:00Z'),
  modificationTime: 1,
  width: 4000,
  height: 3000,
  durationMs: null,
  video: false,
};

function stateOf(patch: Partial<LocalLibraryState>): LocalLibraryState {
  return { state: 'ready', access: 'all', items: [ITEM], error: null, ...patch };
}

describe('the On this device tab', () => {
  it('shows skeletons only while nothing has loaded yet', () => {
    expect(deviceViewOf(stateOf({ state: 'loading', items: [] }), false)).toEqual({
      kind: 'loading',
    });
    expect(deviceViewOf(stateOf({ state: 'loading' }), false).kind).toBe('ready');
  });

  it('asks for access first and points to the system settings once asked', () => {
    const denied = stateOf({ state: 'denied', access: 'none', items: [] });
    expect(deviceViewOf(denied, false)).toEqual({ kind: 'ask' });
    expect(deviceViewOf(denied, true)).toEqual({ kind: 'settings' });
  });

  it('shows an error card without items and a warning above the items it has', () => {
    expect(deviceViewOf(stateOf({ items: [], error: 'Storage unreadable' }), false)).toEqual({
      kind: 'error',
      message: 'Storage unreadable',
    });
    expect(deviceViewOf(stateOf({ error: 'One album unreadable' }), false)).toEqual({
      kind: 'ready',
      limited: false,
      issue: 'One album unreadable',
    });
  });

  it('marks limited access and an empty device', () => {
    expect(deviceViewOf(stateOf({ access: 'limited' }), false)).toEqual({
      kind: 'ready',
      limited: true,
      issue: null,
    });
    expect(deviceViewOf(stateOf({ items: [] }), false)).toEqual({ kind: 'empty' });
  });

  it('counts the device items once they are known', () => {
    expect(deviceCountOf(stateOf({}))).toBe(1);
    expect(deviceCountOf(stateOf({ state: 'loading', items: [] }))).toBeUndefined();
    expect(deviceCountOf(stateOf({ state: 'denied', access: 'none', items: [] }))).toBeUndefined();
  });

  it('maps the selected tiles back to the device items', () => {
    const other = { ...ITEM, id: 'b2', name: 'IMG_0002.jpg' };
    const picked = pickedLocalItems(new Set(['local:b2', 'hub-item']), [ITEM, other]);
    expect(picked.map((item) => item.id)).toEqual(['b2']);
    expect(pickedLocalText(1)).toBe('1 selected on this device');
  });
});
