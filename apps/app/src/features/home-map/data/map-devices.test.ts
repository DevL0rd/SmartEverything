import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HOME_MAP } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../../../store/command-ledger';
import { deviceFixture } from '../../../store/device-fixture';
import { EntityStore } from '../../../store/entity-store';
import { makeTable, type Device } from '../../../store/state';
import { StoreProvider } from '../../../store/store-context';

const built = vi.hoisted(() => ({ scenes: 0 }));

vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: (): object => {
    built.scenes += 1;
    return { floors: [] };
  },
}));

const { useHomeMapScene } = await import('./map-scene');
const { useRoomFlowDevices } = await import('./map-devices');
const { usePlacingDevices } = await import('../editor/tools/placing-devices');

const renders = { scene: 0, flow: 0, placing: 0 };
const seen: { scene: unknown; flow: readonly { readonly room_id: string | null }[] } = {
  scene: null,
  flow: [],
};
const MAP = HOME_MAP.parse({
  id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  schemaVersion: 1,
  revision: 1,
  name: 'Home',
  north: 0,
  updatedAt: '2026-11-21T10:00:00.000Z',
  sources: [],
  notices: [],
  floors: [],
});

let frames: (() => void)[] = [];

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

const LAMP = deviceFixture(1, { id: 'lamp', name: 'Lamp' });
const PLUG = deviceFixture(2, { id: 'plug', name: 'Plug' });

function useRenderCount(name: keyof typeof renders): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function Scene(): ReactNode {
  useRenderCount('scene');
  const scene = useHomeMapScene(MAP);
  useEffect(() => {
    seen.scene = scene;
  });
  return null;
}

function Flow(): ReactNode {
  useRenderCount('flow');
  const devices = useRoomFlowDevices();
  useEffect(() => {
    seen.flow = devices;
  });
  return null;
}

function Placing(): ReactNode {
  useRenderCount('placing');
  usePlacingDevices();
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(Scene),
  createElement(Flow),
  createElement(Placing),
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
  await setDevices(store, [LAMP, PLUG]);
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

function heartbeat(device: Device, tick: number): Device {
  const at = `2026-11-21T10:00:${String(tick).padStart(2, '0')}.000Z`;
  return {
    ...device,
    online: tick % 2 === 0,
    updated_at: at,
    details: { lastSeenAt: at, lastSyncAt: at, lastSyncOutcome: 'ok', link: { rssi: -40 - tick } },
  };
}

beforeEach(() => {
  Object.assign(renders, { scene: 0, flow: 0, placing: 0 });
  built.scenes = 0;
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

describe('home map device selectors', () => {
  it('keep the scene and the editor still through device heartbeats', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const scenes = built.scenes;
    const scene = seen.scene;
    for (let tick = 0; tick < 20; tick += 1) {
      await setDevices(store, [heartbeat(LAMP, tick), heartbeat(PLUG, tick + 1)]);
    }
    expect(built.scenes).toBe(scenes);
    expect(seen.scene).toBe(scene);
    expect(renders).toEqual(mounted);
  });

  it('rebuild the scene only for a name or kind change and follow a room move', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const scenes = built.scenes;
    await setDevices(store, [{ ...LAMP, label: 'Desk lamp' }, PLUG]);
    expect(built.scenes - scenes).toBe(1);
    expect(renders.flow - mounted.flow).toBe(1);
    expect(renders.placing - mounted.placing).toBe(1);
    await setDevices(store, [{ ...LAMP, label: 'Desk lamp', room_id: 'room-9' }, PLUG]);
    expect(built.scenes - scenes).toBe(1);
    expect(renders.scene - mounted.scene).toBe(1);
    expect(renders.flow - mounted.flow).toBe(2);
    expect(seen.flow[0]?.room_id).toBe('room-9');
    await setDevices(store, [{ ...LAMP, label: 'Desk lamp', room_id: 'room-9' }]);
    expect(built.scenes - scenes).toBe(2);
    expect(renders.placing - mounted.placing).toBe(3);
  });
});
