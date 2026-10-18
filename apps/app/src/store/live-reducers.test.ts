import { DEVICE_ROW, type JsonValue, type RowChange } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyChange } from './live-reducers';
import { emptyState } from './state';

function stateChange(value: number, observedAt: string): RowChange {
  const row = { device_id: 'd1', capability: 'level', value, observed_at: observedAt };
  return {
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    record: row,
    oldRecord: null,
  };
}

describe('applyChange identity', () => {
  it('keeps the whole state when a device value repeats exactly', () => {
    const first = applyChange(emptyState(), stateChange(5, '2026-10-11T00:00:00.000Z'));
    const again = applyChange(first, stateChange(5, '2026-10-11T00:00:00.000Z'));
    expect(again).toBe(first);
  });

  it('changes only the touched device when a value moves', () => {
    const first = applyChange(emptyState(), stateChange(5, '2026-10-11T00:00:00.000Z'));
    const other = applyChange(first, {
      type: 'change',
      table: 'device_state',
      operation: 'UPDATE',
      record: { device_id: 'd2', capability: 'level', value: 1, observed_at: 'x' },
      oldRecord: null,
    });
    const moved = applyChange(other, stateChange(6, '2026-10-11T00:00:01.000Z'));
    expect(moved.deviceValues.get('d2')).toBe(other.deviceValues.get('d2'));
    expect(moved.deviceValues.get('d1')).not.toBe(other.deviceValues.get('d1'));
  });
});

describe('applyChange plugin streams', () => {
  const stream = (at: string, value: JsonValue): RowChange => ({
    type: 'change',
    table: 'plugin_streams',
    operation: 'UPDATE',
    record: { plugin_id: 'shelly-presence', stream: 'inventory', value, at },
    oldRecord: null,
  });

  it('reuses the value object when only the timestamp moved', () => {
    const first = applyChange(emptyState(), stream('2026-10-11T00:00:00.000Z', { a: [1, 2] }));
    const second = applyChange(first, stream('2026-10-11T00:00:01.000Z', { a: [1, 2] }));
    const before = first.tables.plugin_streams.rows[0];
    const after = second.tables.plugin_streams.rows[0];
    expect(after?.at).toBe('2026-10-11T00:00:01.000Z');
    expect(after?.value).toBe(before?.value);
  });
});

describe('applyChange device labels', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const ROOM = '33333333-3333-4333-8333-333333333333';
  const device = (id: string, name: string, updatedAt: string, position = 0): RowChange => ({
    type: 'change',
    table: 'devices',
    operation: 'UPDATE',
    record: DEVICE_ROW.parse({
      id,
      provider: 'xiaomi',
      external_id: id,
      parent_id: null,
      kind: 'light',
      name,
      display_name: null,
      model: 'm',
      manufacturer: 'x',
      provider_room: null,
      room_id: ROOM,
      online: true,
      capabilities: [],
      details: {},
      hidden: false,
      favourite: false,
      position,
      created_at: '2026-10-11T00:00:00.000Z',
      updated_at: updatedAt,
    }),
    oldRecord: null,
  });

  it('shows the exact display name without the room or a twin number', () => {
    const named = (id: string, position: number): RowChange => {
      const change = device(id, 'Lamp', '2026-10-11T00:00:00.000Z', position);
      return change.table === 'devices' && change.record !== null
        ? { ...change, record: { ...change.record, display_name: 'Light 3' } }
        : change;
    };
    const state = applyChange(applyChange(emptyState(), named(A, 0)), named(B, 1));
    expect(state.tables.devices.byId[A]?.label).toBe('Light 3');
    expect(state.tables.devices.byId[B]?.label).toBe('Light 3');
  });

  it('keeps the stored name when there is no display name', () => {
    const state = applyChange(emptyState(), device(A, 'Lamp', '2026-10-11T00:00:00.000Z'));
    expect(state.tables.devices.byId[A]?.label).toBe('Lamp');
  });

  it('relabels only the renamed device', () => {
    let state = applyChange(emptyState(), device(A, 'Lamp', '2026-10-11T00:00:00.000Z', 0));
    state = applyChange(state, device(B, 'Lamp', '2026-10-11T00:00:00.000Z', 1));
    const renamed = applyChange(state, device(B, 'Desk', '2026-10-11T00:00:01.000Z', 1));
    expect(renamed.tables.devices.byId[A]?.label).toBe('Lamp');
    expect(renamed.tables.devices.byId[B]?.label).toBe('Desk');
    expect(renamed.tables.devices.byId[A]).toBe(state.tables.devices.byId[A]);
  });
});
