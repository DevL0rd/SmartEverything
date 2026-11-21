import { act, createElement, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeMapSceneLive } from '../../../../components/house-map/adapters/home-map-scene';
import { CommandLedger } from '../../../../store/command-ledger';
import { deviceFixture } from '../../../../store/device-fixture';
import { EntityStore } from '../../../../store/entity-store';
import { makeTable, type Device } from '../../../../store/state';
import { StoreProvider } from '../../../../store/store-context';

interface Built {
  calls: number;
  live: HomeMapSceneLive | null;
}

const built = vi.hoisted((): Built => ({ calls: 0, live: null }));

vi.mock('../model/unified-map', () => ({
  unifiedPlaceOf: (map: unknown): { map: unknown } | null => (map === null ? null : { map }),
  unifiedMapOf: (_place: unknown, _scene: unknown, live: HomeMapSceneLive): { build: number } => {
    built.calls += 1;
    built.live = live;
    return { build: built.calls };
  },
}));

vi.mock('./scene-query', () => ({
  useVacuumScene: (): { scene: null } => ({ scene: null }),
}));

vi.mock('../../../home-map', async () => {
  const scene = await import('../../../home-map/data/map-scene');
  const map = { id: 'home' };
  return {
    useHomeMap: (): { map: { id: string } } => ({ map }),
    useAllHomeMapSceneLive: scene.useAllHomeMapSceneLive,
  };
});

const { useUnifiedMap } = await import('./use-unified-map');

const ROBOT = deviceFixture(0, { id: 'robot', name: 'Robot' });
const LAMP = deviceFixture(1, { id: 'lamp', name: 'Lamp' });

const seen = { renders: 0, maps: new Set<unknown>() };

function Probe(): ReactNode {
  const unified = useUnifiedMap(ROBOT.id, undefined);
  useEffect(() => {
    seen.renders += 1;
    seen.maps.add(unified);
  });
  return null;
}

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: createElement(Probe) });
}

async function setDevices(store: EntityStore, rows: readonly Device[]): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        devices: makeTable(
          Object.fromEntries(rows.map((row) => [row.id, row])),
          rows.map((row) => row.id),
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
  await setDevices(store, [ROBOT, LAMP]);
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
  built.calls = 0;
  built.live = null;
  seen.renders = 0;
  seen.maps.clear();
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

describe('the unified vacuum map hook', () => {
  it('keeps the built map while device state changes', async () => {
    const store = await mount();
    const calls = built.calls;
    const renders = seen.renders;
    for (let tick = 1; tick <= 20; tick += 1) {
      await setDevices(store, [
        { ...ROBOT, online: tick % 2 === 0 },
        { ...LAMP, online: tick % 2 === 1 },
      ]);
    }
    expect(built.calls - calls).toBe(0);
    expect(seen.renders - renders).toBe(0);
    expect(seen.maps.size).toBe(1);
    expect(built.live?.device?.(LAMP.id)).toEqual({ name: LAMP.label, kind: LAMP.kind });
  });

  it('rebuilds once when a device name changes', async () => {
    const store = await mount();
    const calls = built.calls;
    await setDevices(store, [ROBOT, { ...LAMP, label: 'Desk lamp' }]);
    expect(built.calls - calls).toBe(1);
    expect(built.live?.device?.(LAMP.id)).toEqual({ name: 'Desk lamp', kind: LAMP.kind });
  });
});
