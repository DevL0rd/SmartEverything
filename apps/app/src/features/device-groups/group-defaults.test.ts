import { describe, expect, it } from 'vitest';
import type { DeviceGroupRow, DeviceKind, DeviceRow } from '@smarteverything/domain';
import { lightGroupDefaults, lightGroupWidgets, targetBoardWidget } from './group-defaults';

const STAMP = '2026-01-01T00:00:00.000Z';

function device(id: string, kind: DeviceKind): DeviceRow {
  return {
    id,
    provider: 'xiaomi',
    external_id: id,
    parent_id: null,
    kind,
    name: id,
    display_name: null,
    model: 'test.model',
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function group(id: string, deviceIds: readonly string[]): DeviceGroupRow {
  return { id, name: id, device_ids: [...deviceIds], created_at: STAMP, updated_at: STAMP };
}

const LIGHTS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => device(id, 'light'));
const DEVICES = [...LIGHTS, device('fan', 'fan')];

describe('lightGroupDefaults', () => {
  it('takes named groups whose members are all lights', () => {
    const found = lightGroupDefaults(DEVICES, [
      group('down', ['a', 'b', 'c']),
      group('mixed', ['a', 'fan']),
      group('single', ['a']),
    ]);
    expect(found).toEqual([{ groupId: 'down' }]);
  });

  it('keeps at most three groups, in saved order', () => {
    const groups = ['g1', 'g2', 'g3', 'g4'].map((id) => group(id, ['a', 'b']));
    expect(lightGroupDefaults(DEVICES, groups).map((item) => item.groupId)).toEqual([
      'g1',
      'g2',
      'g3',
    ]);
  });

  it('finds nothing without groups', () => {
    expect(lightGroupDefaults(DEVICES, [])).toEqual([]);
  });
});

describe('lightGroupWidgets', () => {
  const defaults = [{ groupId: 'few' }, { groupId: 'many' }];

  it('places each group as an extra large device-group widget keyed by its group', () => {
    expect(lightGroupWidgets(defaults)[0]).toEqual({
      key: 'group:few',
      type: 'device-group',
      size: 'XL',
      options: { target: { kind: 'group', groupId: 'few' } },
    });
    expect(lightGroupWidgets(defaults).map((item) => item.size)).toEqual(['XL', 'XL']);
  });
});

describe('targetBoardWidget', () => {
  it('keys a group widget like the default group widgets so it is never added twice', () => {
    const [fromDefault] = lightGroupWidgets([{ groupId: 'g1' }]);
    expect(targetBoardWidget({ kind: 'group', groupId: 'g1' })).toStrictEqual(fromDefault);
  });

  it('keys a room lights widget by the room and carries its target', () => {
    const widget = targetBoardWidget({ kind: 'room', roomId: 'r1', families: ['light'] });
    expect(widget.key).toBe('room-lights:r1');
    expect(widget.type).toBe('device-group');
    expect(widget.options).toStrictEqual({
      target: { kind: 'room', roomId: 'r1', families: ['light'] },
    });
  });
});
