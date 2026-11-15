import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShellyDevice } from '@smarteverything/shelly';
import type { HomeMapSceneLive } from '../../components/house-map/adapters/home-map-scene';
import type { RenderFloor, RenderScene } from '../../components/house-map/render-scene';
import type { SensorMapView } from './presence-map';

const SENSOR = 'dev-0';

const scenes = vi.hoisted(() => ({ built: 0 }));

vi.mock('../../features/home-map/data/home-map-query', () => ({
  useHomeMap: (): object => ({
    map: MAP,
    loading: false,
    failure: null,
    retry: (): void => undefined,
  }),
}));

vi.mock('../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: ({ live }: { readonly live: HomeMapSceneLive }): RenderScene => {
    scenes.built += 1;
    return { key: 'home', source: 'home_map', bounds: null, floors: [floorFor(live)], issues: [] };
  },
}));

const MAP = vi.hoisted(() => ({
  id: 'home',
  floors: [{ id: 'ground', rooms: [{ id: 'living' }] }],
}));

const floorFor = vi.hoisted(() => (live: HomeMapSceneLive): RenderFloor => {
  const device = live.device?.('dev-0') ?? null;
  return {
    id: 'ground',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    bounds: { minX: 0, minY: 0, maxX: 8, maxY: 4 },
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [
      {
        deviceId: 'dev-0',
        name: device?.name ?? null,
        kind: device?.kind ?? null,
        at: { x: 0, y: 2 },
        rotationDeg: 0,
        height: 2,
        tiltDeg: 0,
        mount: 'wall',
        auto: false,
        camera: null,
        roomId: null,
        wall: null,
      },
    ],
    carpets: [],
    markers: [],
    measures: [],
    vacuum: null,
  };
});

const { EntityStore } = await import('../../store/entity-store');
const { CommandLedger } = await import('../../store/command-ledger');
const { StoreProvider } = await import('../../store/store-context');
const { deviceFixture, stateFixture } = await import('../../store/device-fixture');
const { makeTable } = await import('../../store/state');
const { presenceFixture } = await import('./presence-fixture');
const { useSensorView } = await import('./presence-map');

type Store = InstanceType<typeof EntityStore>;
type Device = ReturnType<typeof deviceFixture>;

const open = new Set<ReturnType<typeof createRoot>>();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of open) {
    act(() => {
      root.unmount();
    });
  }
  open.clear();
  vi.unstubAllGlobals();
});

function devices(): readonly Device[] {
  return [
    deviceFixture(0, { id: SENSOR, name: 'Radar' }),
    deviceFixture(1, { name: 'Lamp' }),
    deviceFixture(2, { name: 'Fan' }),
  ];
}

function sensorWith(occupied: boolean, objects: number, tracksAt: string | null): ShellyDevice {
  const base = presenceFixture();
  return {
    ...base,
    tracksAt,
    zones: [
      {
        key: 'main',
        externalId: 'shelly-presence:radar-1:main',
        generation: 0,
        main: true,
        config: { id: 200, enable: true, area: [[0, 0, 2, 4]] },
        status: { id: 200, value: occupied, num_objects: objects },
      },
    ],
  };
}

interface Mounted {
  readonly store: Store;
  readonly views: (SensorMapView | null)[];
  readonly show: (sensor: ShellyDevice) => void;
}

function mount(): Mounted {
  const store = new EntityStore();
  store.update(() => stateFixture(devices(), {}));
  const views: (SensorMapView | null)[] = [];
  function Probe({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
    views.push(useSensorView(sensor, SENSOR));
    return null;
  }
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  open.add(root);
  const show = (sensor: ShellyDevice): void => {
    act(() => {
      root.render(
        StoreProvider({
          runtime: { store, ledger: new CommandLedger(store) },
          children: createElement(Probe, { sensor }),
        }),
      );
    });
  };
  show(sensorWith(false, 0, null));
  return { store, views, show };
}

async function change(store: Store, edit: (device: Device) => Device): Promise<void> {
  await act(async () => {
    store.update((state) => {
      const next = state.tables.devices.rows.map(edit);
      return {
        ...state,
        tables: {
          ...state.tables,
          devices: makeTable(
            Object.fromEntries(next.map((row) => [row.id, row])),
            next.map((row) => row.id),
            state.tables.devices.version + 1,
          ),
        },
      };
    });
    await Promise.resolve();
  });
}

describe('useSensorView', () => {
  it('keeps the same view when a device changes state or details but not its name or kind', async () => {
    const { store, views } = mount();
    const first = views.at(-1);
    expect(first?.spot.placement.name).toBe('Radar');
    const built = scenes.built;
    await change(store, (device) =>
      device.id === 'dev-1'
        ? {
            ...device,
            online: false,
            details: { heartbeat: 2 },
            updated_at: '2026-11-15T00:00:00Z',
          }
        : { ...device },
    );
    expect(scenes.built).toBe(built);
    expect(views.at(-1)).toBe(first);
  });

  it('rebuilds the view when a device is renamed', async () => {
    const { store, views } = mount();
    const first = views.at(-1);
    await change(store, (device) =>
      device.id === SENSOR ? { ...device, label: 'Hall radar' } : device,
    );
    const next = views.at(-1);
    expect(next).not.toBe(first);
    expect(next?.spot.placement.name).toBe('Hall radar');
  });

  it('keeps the same view when the sensor changes readings the map does not draw', () => {
    const { views, show } = mount();
    const first = views.at(-1);
    show(sensorWith(false, 2, '2026-11-15T10:00:00.000Z'));
    expect(views.at(-1)).toBe(first);
  });

  it('rebuilds the view when a zone becomes occupied', () => {
    const { views, show } = mount();
    expect(views.at(-1)?.zones[0]?.occupied).toBe(false);
    show(sensorWith(true, 1, null));
    expect(views.at(-1)?.zones[0]?.occupied).toBe(true);
  });
});
