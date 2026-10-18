import { DeviceValueIndex } from '../../../store/device-values';
import { describe, expect, it } from 'vitest';
import {
  deviceOf,
  emptyState,
  makeTable,
  type Device,
  type StoreState,
} from '../../../store/state';
import { powerOf, samePower } from './power';

function plug(id: string, online = true, hidden = false): Device {
  return deviceOf({
    id,
    provider: 'xiaomi',
    external_id: id,
    parent_id: null,
    kind: 'plug',
    name: id,
    display_name: null,
    model: 'test.plug',
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online,
    capabilities: [
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      {
        key: 'power_draw',
        label: 'Power draw',
        access: 'read',
        value: { kind: 'number', min: 0, max: 4000, step: 1, unit: 'W' },
      },
    ],
    details: {},
    hidden,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
  });
}

function stateOf(
  devices: readonly Device[],
  draws: Readonly<Record<string, number | string>>,
): StoreState {
  const base = emptyState();
  return {
    ...base,
    tables: {
      ...base.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((device) => [device.id, device])),
        devices.map((device) => device.id),
        1,
      ),
    },
    deviceValues: DeviceValueIndex.from(
      Object.entries(draws).map(([id, value]) => [
        id,
        { power_draw: { value, observedAt: '2026-10-16T08:00:00.000Z' } },
      ]),
    ),
  };
}

describe('the home power draw', () => {
  it('is empty when no device reports a draw', () => {
    expect(powerOf(stateOf([plug('a')], {}))).toBeNull();
  });

  it('adds the draw of every online visible device', () => {
    const state = stateOf([plug('a'), plug('b')], { a: 120, b: 30.5 });
    const power = powerOf(state);
    expect(power?.watts).toBe(150.5);
    expect(power?.unit).toBe('W');
    expect(power?.keys).toEqual(['power_draw']);
    expect(power?.sources.map((device) => device.id)).toEqual(['a', 'b']);
  });

  it('ignores offline devices, hidden devices and readings that are not numbers', () => {
    const state = stateOf([plug('a'), plug('off', false), plug('hid', true, true), plug('bad')], {
      a: 40,
      off: 500,
      hid: 700,
      bad: 'n/a',
    });
    const power = powerOf(state);
    expect(power?.watts).toBe(40);
    expect(power?.sources.map((device) => device.id)).toEqual(['a']);
  });
});

describe('comparing two power readings', () => {
  const state = stateOf([plug('a'), plug('b')], { a: 10, b: 20 });

  it('is equal for the same watts and devices', () => {
    expect(samePower(powerOf(state), powerOf(state))).toBe(true);
    expect(samePower(null, null)).toBe(true);
  });

  it('differs when the total moves or one side is missing', () => {
    const moved = stateOf([plug('a'), plug('b')], { a: 10, b: 25 });
    expect(samePower(powerOf(state), powerOf(moved))).toBe(false);
    expect(samePower(powerOf(state), null)).toBe(false);
    expect(samePower(null, powerOf(state))).toBe(false);
  });

  it('differs when a different device now contributes the same total', () => {
    const swapped = stateOf([plug('c'), plug('d')], { c: 10, d: 20 });
    expect(samePower(powerOf(state), powerOf(swapped))).toBe(false);
  });
});
