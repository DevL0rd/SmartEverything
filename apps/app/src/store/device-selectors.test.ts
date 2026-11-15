import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from './command-ledger';
import { deviceFixture } from './device-fixture';
import { EntityStore } from './entity-store';
import {
  useDeviceIds,
  useDeviceNames,
  useDevices,
  useFirstDevice,
  useHasDevice,
  useMatchingDevices,
} from './selectors';
import { makeTable, type Device } from './state';
import { StoreProvider } from './store-context';

const renders = { list: 0, names: 0, ids: 0, first: 0, has: 0, matching: 0 };
const seen: { names: ReadonlyMap<string, string> | null; first: Device | null } = {
  names: null,
  first: null,
};

let frames: (() => void)[] = [];

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

const VACUUM = deviceFixture(0, { id: 'vacuum', kind: 'vacuum', name: 'Robot' });
const LAMP = deviceFixture(1, { id: 'lamp', name: 'Lamp' });
const PLUG = deviceFixture(2, { id: 'plug', name: 'Plug' });

function isVacuum(device: Device): boolean {
  return device.kind === 'vacuum';
}

function useRenderCount(name: keyof typeof renders): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function List(): ReactNode {
  useRenderCount('list');
  useDevices();
  return null;
}

function Names(): ReactNode {
  useRenderCount('names');
  const names = useDeviceNames('label');
  useEffect(() => {
    seen.names = names;
  });
  return null;
}

function Ids(): ReactNode {
  useRenderCount('ids');
  useDeviceIds(isVacuum, { includeHidden: true });
  return null;
}

function First(): ReactNode {
  useRenderCount('first');
  const first = useFirstDevice(isVacuum);
  useEffect(() => {
    seen.first = first;
  });
  return null;
}

function Has(): ReactNode {
  useRenderCount('has');
  useHasDevice(isVacuum);
  return null;
}

function Matching(): ReactNode {
  useRenderCount('matching');
  useMatchingDevices(isVacuum);
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(List),
  createElement(Names),
  createElement(Ids),
  createElement(First),
  createElement(Has),
  createElement(Matching),
);

function Root({ store }: { readonly store: EntityStore }): ReactNode {
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
    flushFrames();
    await Promise.resolve();
  });
}

async function mount(): Promise<EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({ ...state, loaded: true }));
  await setDevices(store, [VACUUM, LAMP, PLUG]);
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
  Object.assign(renders, { list: 0, names: 0, ids: 0, first: 0, has: 0, matching: 0 });
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
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

describe('narrow device selectors', () => {
  it('stay still while unrelated device rows change, unlike the whole list', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const names = seen.names;
    for (let tick = 0; tick < 20; tick += 1) {
      await setDevices(store, [VACUUM, { ...LAMP, online: tick % 2 === 0 }, PLUG]);
    }
    expect(renders.list - mounted.list).toBe(20);
    expect(renders.names).toBe(mounted.names);
    expect(renders.ids).toBe(mounted.ids);
    expect(renders.first).toBe(mounted.first);
    expect(renders.has).toBe(mounted.has);
    expect(renders.matching).toBe(mounted.matching);
    expect(seen.names).toBe(names);
  });

  it('follow the rows they read', async () => {
    const store = await mount();
    const mounted = { ...renders };
    await setDevices(store, [VACUUM, deviceFixture(1, { id: 'lamp', name: 'Desk lamp' }), PLUG]);
    expect(renders.names - mounted.names).toBe(1);
    expect(seen.names?.get('lamp')).toBe('Desk lamp');
    expect(renders.first).toBe(mounted.first);
    const moved = { ...VACUUM, online: false };
    await setDevices(store, [moved, LAMP, PLUG]);
    expect(renders.first - mounted.first).toBe(1);
    expect(seen.first).toBe(moved);
    expect(renders.ids).toBe(mounted.ids);
    expect(renders.has).toBe(mounted.has);
    await setDevices(store, [LAMP, PLUG]);
    expect(seen.first).toBeNull();
    expect(renders.ids - mounted.ids).toBe(1);
    expect(renders.has - mounted.has).toBe(1);
  });
});
