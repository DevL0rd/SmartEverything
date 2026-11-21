import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { deviceFixture, stateFixture } from './device-fixture';
import { DeviceValueIndex } from './device-values';
import { emptyState, makeTable, type Device, type DeviceValues, type StoreState } from './state';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '4.2.0' } } }));

const { slotsOf, rowKey, CACHED_SHARED_LISTS, SHARED_LISTS, OWNER_LISTS } =
  await import('./persistence-slots');

const BASE = 'https://hub.test';
const LIST_SLOT = /\.[to]\.([a-z_]+)$/u;

function devicesSlot(): ReturnType<typeof slotsOf>[number] {
  const slot = slotsOf(BASE).find((candidate) => candidate.key === `${BASE}.t.devices`);
  if (slot === undefined) throw new Error('The devices table has no persisted slot.');
  return slot;
}

function withDevices(state: StoreState, devices: readonly Device[]): StoreState {
  return {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((device) => [device.id, device])),
        devices.map((device) => device.id),
        state.tables.devices.version + 1,
      ),
    },
  };
}

describe('persisted list slots', () => {
  it('writes every listed table from the tables the store always holds', () => {
    const state = emptyState();
    const listed = slotsOf(BASE).filter((slot) => LIST_SLOT.test(slot.key));
    expect(listed.length).toBe(CACHED_SHARED_LISTS.length + OWNER_LISTS.length);
    for (const slot of listed) {
      const write = slot.write(state, 1, undefined);
      expect(write.set, slot.key).toEqual([[slot.key, '[]']]);
      expect(write.del, slot.key).toEqual([]);
    }
  });

  it('lists only tables that the store declares', () => {
    const stored = Object.keys(emptyState().tables);
    for (const name of [...SHARED_LISTS, ...OWNER_LISTS]) {
      expect(stored).toContain(name);
    }
  });

  it('writes every row under its own key and the id order once', () => {
    const devices = Array.from({ length: 50 }, (_, index) => deviceFixture(index));
    const slot = devicesSlot();
    const write = slot.write(stateFixture(devices, {}), 1, undefined);
    expect(write.set).toHaveLength(51);
    expect(write.set.at(-1)).toEqual([slot.key, JSON.stringify(devices.map(({ id }) => id))]);
    const [key, text] = write.set[0] ?? ['', ''];
    expect(key).toBe(rowKey(slot.key, 'dev-0'));
    expect(JSON.parse(text)).not.toHaveProperty('label');
  });

  it('writes only the one device row that changed, not the table', () => {
    const devices = Array.from({ length: 50 }, (_, index) => deviceFixture(index));
    const slot = devicesSlot();
    const before = stateFixture(devices, {});
    const first = slot.write(before, 1, undefined);
    const changed = devices.map((device, index) =>
      index === 7 ? deviceFixture(7, { online: false }) : device,
    );
    const second = slot.write(withDevices(before, changed), 2, first.memo);
    expect(second.set.map(([key]) => key)).toEqual([rowKey(slot.key, 'dev-7')]);
    expect(second.del).toEqual([]);
    expect(JSON.parse(second.set[0]?.[1] ?? 'null')).toMatchObject({ id: 'dev-7', online: false });
  });

  it('removes the key of a row that left the table and rewrites only the order', () => {
    const devices = Array.from({ length: 5 }, (_, index) => deviceFixture(index));
    const slot = devicesSlot();
    const before = stateFixture(devices, {});
    const first = slot.write(before, 1, undefined);
    const second = slot.write(withDevices(before, devices.slice(1)), 2, first.memo);
    expect(second.set).toEqual([[slot.key, JSON.stringify(['dev-1', 'dev-2', 'dev-3', 'dev-4'])]]);
    expect(second.del).toEqual([rowKey(slot.key, 'dev-0')]);
  });
});

function stateSlot(): ReturnType<typeof slotsOf>[number] {
  const slot = slotsOf(BASE).find((candidate) => candidate.key === `${BASE}.device_state`);
  if (slot === undefined) throw new Error('The device readings have no persisted slot.');
  return slot;
}

function reading(index: number, power: boolean): DeviceValues {
  return {
    power: { value: power, observedAt: '2026-10-16T08:00:00.000Z' },
    power_draw: { value: index * 3.5, observedAt: '2026-10-16T08:00:00.000Z' },
    temperature: { value: 21.5, observedAt: '2026-10-16T08:00:00.000Z' },
  };
}

function withValues(state: StoreState, values: DeviceValueIndex): StoreState {
  return { ...state, deviceValues: values };
}

describe('persisted device readings', () => {
  const ids = Array.from({ length: 200 }, (_, index) => `dev-${String(index)}`);
  const all = DeviceValueIndex.from(ids.map((id, index) => [id, reading(index, true)]));

  it('writes each device under its own key and the device order once', () => {
    const slot = stateSlot();
    const write = slot.write(withValues(emptyState(), all), 1, undefined);
    expect(write.set).toHaveLength(201);
    const order = write.set.find(([key]) => key === slot.key)?.[1] ?? '[]';
    expect(z.array(z.string()).parse(JSON.parse(order)).sort()).toEqual([...ids].sort());
    const row = write.set.find(([key]) => key === rowKey(slot.key, 'dev-7'))?.[1] ?? 'null';
    expect(JSON.parse(row)).toEqual([
      {
        device_id: 'dev-7',
        capability: 'power',
        value: true,
        observed_at: '2026-10-16T08:00:00.000Z',
      },
      {
        device_id: 'dev-7',
        capability: 'power_draw',
        value: 24.5,
        observed_at: '2026-10-16T08:00:00.000Z',
      },
      {
        device_id: 'dev-7',
        capability: 'temperature',
        value: 21.5,
        observed_at: '2026-10-16T08:00:00.000Z',
      },
    ]);
  });

  it('writes only the one device whose reading changed, a few hundred characters', () => {
    const slot = stateSlot();
    const first = slot.write(withValues(emptyState(), all), 1, undefined);
    const fullChars = first.set.reduce((sum, [, text]) => sum + text.length, 0);
    const second = slot.write(
      withValues(emptyState(), all.set('dev-42', reading(42, false))),
      2,
      first.memo,
    );
    expect(second.set.map(([key]) => key)).toEqual([rowKey(slot.key, 'dev-42')]);
    expect(second.del).toEqual([]);
    const chars = second.set.reduce((sum, [, text]) => sum + text.length, 0);
    expect(chars).toBeLessThan(400);
    expect(chars * 100).toBeLessThan(fullChars);
  });

  it('writes nothing when the readings are unchanged', () => {
    const slot = stateSlot();
    const state = withValues(emptyState(), all);
    const first = slot.write(state, 1, undefined);
    const second = slot.write(state, 2, first.memo);
    expect(second.set).toEqual([]);
    expect(second.del).toEqual([]);
  });

  it('deletes the key of a device that left and rewrites the order', () => {
    const slot = stateSlot();
    const few = DeviceValueIndex.from(
      ids.slice(0, 3).map((id, index) => [id, reading(index, true)]),
    );
    const first = slot.write(withValues(emptyState(), few), 1, undefined);
    const fewer = DeviceValueIndex.from(
      ids.slice(1, 3).map((id): [string, DeviceValues] => {
        const values = few.get(id);
        if (values === undefined) throw new Error(`No reading for ${id}.`);
        return [id, values];
      }),
    );
    const second = slot.write(withValues(emptyState(), fewer), 2, first.memo);
    expect(second.set.map(([key]) => key)).toEqual([slot.key]);
    expect(second.del).toEqual([rowKey(slot.key, 'dev-0')]);
  });
});
