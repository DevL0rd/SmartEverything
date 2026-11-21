import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrivePlacement } from '@smarteverything/domain';
import { CommandLedger } from '../../../store/command-ledger';
import { deviceFixture } from '../../../store/device-fixture';
import { EntityStore } from '../../../store/entity-store';
import { makeTable, type Device, type ListTable, type RowOf } from '../../../store/state';
import { StoreProvider } from '../../../store/store-context';
import { ComputersScreen } from './computers-screen';
import { computer, LAPTOP, placement, WORKSTATION } from './placement-fixture';

const seen = vi.hoisted(() => ({
  frame: 0,
  cards: new Map<string, number>(),
  placements: new Map<string, readonly unknown[]>(),
}));

vi.mock('react-native', async () => ({
  ...(await vi.importActual('react-native')),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../data', async () => await vi.importActual('../data/tables'));
vi.mock('../../computers', async () => ({
  ...(await vi.importActual('../../computers/model/computer-list')),
  PairComputerSheet: (): null => null,
}));
vi.mock('./this-computer', () => ({
  useThisComputer: (): null => null,
  useDesktopDrive: (): null => null,
}));
vi.mock('./conflicts-card', () => ({ ConflictsCard: (): null => null }));
vi.mock('./mount-panel', () => ({ MountPanel: (): null => null }));
vi.mock('./computer-card', () => ({
  ComputerCard: ({
    device,
    placements,
  }: {
    readonly device: Device;
    readonly placements: readonly unknown[];
  }): null => {
    seen.cards.set(device.id, (seen.cards.get(device.id) ?? 0) + 1);
    seen.placements.set(device.id, placements);
    return null;
  },
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: ({ children }: { readonly children: ReactNode }): ReactNode => {
    seen.frame += 1;
    return children;
  },
}));

const STAMP = '2026-11-14T09:00:00.000Z';
const WATCH = deviceFixture(5, { id: 'd0000000-0000-4000-8000-000000000005', kind: 'other' });
const DESK = computer(WORKSTATION, 'Workstation');
const LAP = computer(LAPTOP, 'Laptop');
const ON_DESK = placement();
const ON_LAP = placement({ id: 'e0000000-0000-4000-8000-000000000002', deviceId: LAPTOP });

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: createElement(ComputersScreen) });
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
  await setRows(store, 'devices', [WATCH, DESK, LAP]);
  await setRows(store, 'drive_placements', [ON_DESK, ON_LAP]);
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

function synced(row: DrivePlacement, tick: number): DrivePlacement {
  return { ...row, status: { ...row.status, cacheBytes: tick } };
}

beforeEach(() => {
  seen.frame = 0;
  seen.cards.clear();
  seen.placements.clear();
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

describe('Drive Computers renders', () => {
  it('stays still while a device that is not a computer changes', async () => {
    const store = await mount();
    const mounted = seen.frame;
    expect(seen.cards.get(WORKSTATION)).toBe(1);
    for (let tick = 1; tick <= 20; tick += 1) {
      const at = new Date(Date.parse(STAMP) + tick * 1000).toISOString();
      await setRows(store, 'devices', [{ ...WATCH, updated_at: at }, DESK, LAP]);
    }
    expect(seen.frame - mounted).toBe(0);
    expect(seen.cards.get(WORKSTATION)).toBe(1);
  });

  it('hands a card the same placements while only another computer’s placements change', async () => {
    const store = await mount();
    const desk = seen.placements.get(WORKSTATION);
    expect(desk).toEqual([ON_DESK]);
    for (let tick = 1; tick <= 5; tick += 1) {
      await setRows(store, 'drive_placements', [ON_DESK, synced(ON_LAP, tick)]);
    }
    expect(seen.placements.get(WORKSTATION)).toBe(desk);
    expect(seen.placements.get(LAPTOP)).toEqual([synced(ON_LAP, 5)]);
  });

  it('follows a change to a computer row', async () => {
    const store = await mount();
    const mounted = seen.frame;
    await setRows(store, 'devices', [WATCH, { ...DESK, online: false }, LAP]);
    expect(seen.frame - mounted).toBe(1);
    expect(seen.cards.get(WORKSTATION)).toBe(2);
  });
});
