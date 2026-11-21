import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../../store/command-ledger';
import { deviceFixture } from '../../store/device-fixture';
import { EntityStore } from '../../store/entity-store';
import { useDevice, useDevices, useRow } from '../../store/selectors';
import { emptyState, makeTable, type Device } from '../../store/state';
import { StoreProvider } from '../../store/store-context';
import { deviceLinksIn, useDeviceIdOf, useDeviceLinks, type DeviceLink } from './zone-devices';

const PROBES = ['whole', 'links', 'idOf', 'parent', 'computer'] as const;

type Probe = (typeof PROBES)[number];

const SENSOR = deviceFixture(0, { id: 'sensor', external_id: 'shelly-1' });
const ZONE = deviceFixture(1, { id: 'zone', external_id: 'shelly-1:zone-1', parent_id: 'sensor' });
const PC = deviceFixture(2, { id: 'pc', kind: 'computer', external_id: 'pc-1' });
const WATCH = deviceFixture(3, { id: 'watch', external_id: 'watch-1' });

const renders: Record<Probe, number> = { whole: 0, links: 0, idOf: 0, parent: 0, computer: 0 };
const seen: {
  links: ReadonlyMap<string, DeviceLink> | null;
  idOf: string | null;
  parent: Device | null;
} = { links: null, idOf: null, parent: null };

let root: Root | null = null;

function useRenderCount(probe: Probe): void {
  useEffect(() => {
    renders[probe] += 1;
  });
}

function Whole(): ReactNode {
  useRenderCount('whole');
  useDevices({ includeHidden: true });
  return null;
}

function Links(): ReactNode {
  useRenderCount('links');
  const links = useDeviceLinks();
  useEffect(() => {
    seen.links = links;
  });
  return null;
}

function IdOf(): ReactNode {
  useRenderCount('idOf');
  const id = useDeviceIdOf('shelly-1:zone-1');
  useEffect(() => {
    seen.idOf = id;
  });
  return null;
}

function Parent(): ReactNode {
  useRenderCount('parent');
  const parent = useRow('devices', ZONE.parent_id);
  useEffect(() => {
    seen.parent = parent;
  });
  return null;
}

function Computer(): ReactNode {
  useRenderCount('computer');
  useDevice('pc');
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(Whole),
  createElement(Links),
  createElement(IdOf),
  createElement(Parent),
  createElement(Computer),
);

function App({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: SUBTREE });
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
  await setDevices(store, [SENSOR, ZONE, PC, WATCH]);
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(App, { store }));
  });
  return store;
}

function since(mounted: Readonly<Record<Probe, number>>): Record<Probe, number> {
  const delta = { ...renders };
  for (const probe of PROBES) delta[probe] -= mounted[probe];
  return delta;
}

beforeEach(() => {
  for (const probe of PROBES) renders[probe] = 0;
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
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('one device readers', () => {
  it('stay still while the watch loop rewrites an unrelated device row', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const links = seen.links;
    for (let tick = 1; tick <= 20; tick += 1) {
      await setDevices(store, [
        SENSOR,
        ZONE,
        PC,
        { ...WATCH, online: tick % 2 === 0, updated_at: new Date(tick * 1000).toISOString() },
      ]);
    }
    expect(since(mounted)).toEqual({ whole: 20, links: 0, idOf: 0, parent: 0, computer: 0 });
    expect(seen.links).toBe(links);
    expect(seen.idOf).toBe('zone');
    expect(seen.parent).toBe(SENSOR);
  });

  it('follow the rows and fields they read', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const renamedSensor = { ...SENSOR, name: 'Hall sensor' };
    await setDevices(store, [renamedSensor, ZONE, PC, WATCH]);
    expect(seen.parent).toBe(renamedSensor);
    expect(since(mounted)).toMatchObject({ links: 0, idOf: 0, parent: 1, computer: 0 });
    await setDevices(store, [renamedSensor, { ...ZONE, model: 'shelly.zone.v2' }, PC, WATCH]);
    expect(seen.links?.get('shelly-1:zone-1')?.model).toBe('shelly.zone.v2');
    expect(since(mounted)).toMatchObject({ links: 1, idOf: 0, computer: 0 });
    await setDevices(store, [renamedSensor, PC, WATCH]);
    expect(seen.idOf).toBeNull();
  });

  it('keep the first device for a shared external id', () => {
    const twin = deviceFixture(4, { id: 'twin', external_id: 'shelly-1' });
    const empty = emptyState();
    const state = {
      ...empty,
      tables: {
        ...empty.tables,
        devices: makeTable({ sensor: SENSOR, twin }, ['sensor', 'twin'], 1),
      },
    };
    expect(deviceLinksIn(state).get('shelly-1')?.id).toBe('sensor');
  });
});
