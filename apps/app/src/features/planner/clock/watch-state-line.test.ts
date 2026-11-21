import { act, createElement, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../../../store/command-ledger';
import { deviceFixture } from '../../../store/device-fixture';
import { EntityStore } from '../../../store/entity-store';
import { makeTable, type Device } from '../../../store/state';
import { StoreProvider } from '../../../store/store-context';
import { useWatchName } from './watch-state-line';

const STAMP = '2026-11-14T09:00:00.000Z';
const WATCH = deviceFixture(0, { id: 'watch', name: 'Band 9', kind: 'other' });

const seen: { renders: number; name: string | null | undefined } = {
  renders: 0,
  name: undefined,
};

function Probe(): ReactNode {
  const name = useWatchName(WATCH.id);
  useEffect(() => {
    seen.renders += 1;
    seen.name = name;
  });
  return null;
}

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: createElement(Probe) });
}

async function setDevices(store: EntityStore, devices: readonly Device[]): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        devices: makeTable(
          Object.fromEntries(devices.map((device) => [device.id, device])),
          devices.map((device) => device.id),
          state.tables.devices.version + 1,
        ),
      },
    }));
    await Promise.resolve();
  });
}

async function mount(): Promise<EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({ ...state, loaded: true }));
  await setDevices(store, [WATCH]);
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
  seen.renders = 0;
  seen.name = undefined;
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

describe('useWatchName', () => {
  it('stays still while the watch row is rewritten with sync times', async () => {
    const store = await mount();
    const mounted = seen.renders;
    for (let tick = 1; tick <= 20; tick += 1) {
      const at = new Date(Date.parse(STAMP) + tick * 1000).toISOString();
      await setDevices(store, [
        deviceFixture(0, {
          id: WATCH.id,
          name: 'Band 9',
          kind: 'other',
          details: { lastSyncAt: at, reportedAt: at },
          updated_at: at,
        }),
      ]);
    }
    expect(seen.renders - mounted).toBe(0);
    expect(seen.name).toBe(WATCH.label);
  });

  it('follows a rename and reports a removed watch as missing', async () => {
    const store = await mount();
    const mounted = seen.renders;
    const renamed = deviceFixture(0, { id: WATCH.id, name: 'Wrist', kind: 'other' });
    await setDevices(store, [renamed]);
    expect(seen.name).toBe(renamed.label);
    await setDevices(store, []);
    expect(seen.name).toBeNull();
    expect(seen.renders - mounted).toBe(2);
  });
});
