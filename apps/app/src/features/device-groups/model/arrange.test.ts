import { describe, expect, it } from 'vitest';
import type { Device } from '../../../store/state';
import { arrangeItems, reordered } from './arrange';

function device(id: string, kind: Device['kind'], online: boolean, roomId: string | null): Device {
  return {
    id,
    provider: 'tuya',
    external_id: id,
    parent_id: null,
    kind,
    name: id,
    display_name: null,
    model: 'test',
    manufacturer: 'Test',
    provider_room: null,
    room_id: roomId,
    online,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    label: id,
  };
}

describe('arrangeItems', () => {
  const devices = [device('a', 'light', true, 'r1'), device('b', 'fan', false, null)];

  it('keeps the chosen order and names the room and offline state', () => {
    const items = arrangeItems(devices, [{ id: 'r1', name: 'Hall' }], ['b', 'a']);
    expect(items.map((item) => [item.id, item.caption, item.light])).toStrictEqual([
      ['b', 'No room · Offline', false],
      ['a', 'Hall', true],
    ]);
  });

  it('keeps a removed device in its place so it can be dropped', () => {
    expect(arrangeItems(devices, [], ['gone'])[0]).toStrictEqual({
      id: 'gone',
      name: 'Removed device',
      caption: 'No longer exists',
      light: false,
    });
  });
});

describe('reordered', () => {
  it('takes the new order and ignores keys that are not members', () => {
    expect(reordered(['a', 'b'], ['b', 'x', 'a'])).toStrictEqual(['b', 'a']);
  });
});
