import { describe, expect, it, vi } from 'vitest';
import { deviceFixture, stateFixture } from './device-fixture';
import { emptyState, makeTable, type Device, type StoreState } from './state';

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
