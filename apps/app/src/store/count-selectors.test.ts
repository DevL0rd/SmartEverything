import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { RoomRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from './command-ledger';
import { deviceFixture } from './device-fixture';
import { EntityStore } from './entity-store';
import { useDeviceCount, useDevices, useRoomCount, useRooms } from './selectors';
import { makeTable, type Device, type ListTable, type RowOf } from './state';
import { StoreProvider } from './store-context';

const renders = { lists: 0, counts: 0 };
const seen = { devices: -1, rooms: -1 };

const LAMP = deviceFixture(0, { id: 'lamp', name: 'Lamp' });
const PLUG = deviceFixture(1, { id: 'plug', name: 'Plug' });
const KITCHEN: RoomRow = { id: 'kitchen', name: 'Kitchen', position: 0 };
const HALL: RoomRow = { id: 'hall', name: 'Hall', position: 1 };

function Lists(): ReactNode {
  useEffect(() => {
    renders.lists += 1;
  });
  useDevices();
  useRooms();
  return null;
}

function Counts(): ReactNode {
  const devices = useDeviceCount();
  const rooms = useRoomCount();
  useEffect(() => {
    renders.counts += 1;
    seen.devices = devices;
    seen.rooms = rooms;
  });
  return null;
}

const SUBTREE = createElement(Fragment, null, createElement(Lists), createElement(Counts));

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: SUBTREE });
}

async function setRows<T extends ListTable>(
  store: EntityStore,
  table: T,
  rows: readonly (RowOf<T> & { readonly id: string })[],
): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        [table]: makeTable(
          Object.fromEntries(rows.map((row) => [row.id, row])),
          rows.map((row) => row.id),
          state.tables[table].version + 1,
        ),
      },
    }));
    await Promise.resolve();
  });
}

async function mount(): Promise<EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({ ...state, loaded: true }));
  await setRows(store, 'devices', [LAMP, PLUG]);
  await setRows(store, 'rooms', [KITCHEN, HALL]);
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Root, { store }));
  });
  return store;
}

beforeEach(() => {
  renders.lists = 0;
  renders.counts = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 0;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('device and room counts', () => {
  it('stay still while device rows and room names change', async () => {
    const store = await mount();
    const mounted = { ...renders };
    for (let tick = 1; tick <= 20; tick += 1) {
      const lamp: Device = { ...LAMP, online: tick % 2 === 0 };
      await setRows(store, 'devices', [lamp, PLUG]);
      await setRows(store, 'rooms', [{ ...KITCHEN, name: `Kitchen ${String(tick)}` }, HALL]);
    }
    expect(renders.lists - mounted.lists).toBe(40);
    expect(renders.counts - mounted.counts).toBe(0);
    expect(seen).toEqual({ devices: 2, rooms: 2 });
  });

  it('follow added, removed and hidden rows', async () => {
    const store = await mount();
    const mounted = renders.counts;
    await setRows(store, 'devices', [LAMP, PLUG, deviceFixture(2, { id: 'fan' })]);
    expect(seen.devices).toBe(3);
    await setRows(store, 'devices', [
      LAMP,
      { ...PLUG, hidden: true },
      deviceFixture(2, { id: 'fan' }),
    ]);
    expect(seen.devices).toBe(2);
    await setRows(store, 'rooms', [KITCHEN]);
    expect(seen.rooms).toBe(1);
    expect(renders.counts - mounted).toBe(3);
  });
});
