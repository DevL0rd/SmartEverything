import { act, createElement, Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LIVE_CHANGE,
  PLUGIN_STREAM_ROW,
  pluginStreamKey,
  type LiveChange,
  type PluginStreamRow,
} from '@smarteverything/domain';
import {
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS_STREAM,
} from '@smarteverything/shelly';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCellEnvironment } from './cell-budget';
import {
  CommandLedger,
  DeviceSpotlightWidget,
  EntityStore,
  LIGHTING,
  LightingContext,
  PALETTE,
  PaletteContext,
  StoreProvider,
  deviceFixture,
  cellNodes as nodes,
  stateFixture,
} from './cell-mocks';
import { presenceFixture } from '../../plugins/shelly-presence/presence-fixture';
import { makeTable } from '../../store/state';

const calls = vi.hoisted((): { list: { enabled: boolean; holder: string }[] } => ({ list: [] }));

vi.mock('../../api/plugins', () => ({
  callPluginTool: (
    _plugin: string,
    _tool: string,
    input: { enabled: boolean; holder: string },
  ): Promise<{ result: { enabled: boolean } }> => {
    calls.list.push({ enabled: input.enabled, holder: input.holder });
    return Promise.resolve({ result: { enabled: input.enabled } });
  },
}));

vi.mock('../../queries/history', () => ({
  readDeviceRows: (): Promise<[]> => Promise.resolve([]),
}));

const SENSOR_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ID = '00000000-0000-4000-8000-0000000000a2';
const EXTERNAL = 'shelly-presence:radar-1';
const STAMP = '2026-10-18T08:00:00.000Z';
const FRAMES = {
  M: { width: 300, height: 190, idiom: 'touch' },
  W: { width: 600, height: 190, idiom: 'touch' },
  L: { width: 300, height: 380, idiom: 'touch' },
} as const;
const BUDGETS = {
  M: { nodes: 73, hooks: 152 },
  W: { nodes: 73, hooks: 152 },
  L: { nodes: 82, hooks: 168 },
} as const;

function sensorValue(): unknown {
  return JSON.parse(JSON.stringify(presenceFixture({ actions: ['live_track'] })));
}

function streamRow(stream: string, value: unknown): [string, PluginStreamRow] {
  const key = pluginStreamKey(SHELLY_PLUGIN_ID, stream);
  return [key, PLUGIN_STREAM_ROW.parse({ plugin_id: SHELLY_PLUGIN_ID, stream, value, at: STAMP })];
}

function storeOf(): InstanceType<typeof EntityStore> {
  const sensor = deviceFixture(0, {
    id: SENSOR_ID,
    external_id: EXTERNAL,
    kind: 'sensor',
    name: 'Hall radar',
    capabilities: [],
    room_id: 'room-0',
  });
  const other = deviceFixture(1, { id: OTHER_ID, room_id: 'room-0' });
  const base = stateFixture([sensor, other], { [SENSOR_ID]: {}, [OTHER_ID]: {} });
  const [key, row] = streamRow(SHELLY_SNAPSHOT_STREAM, { at: STAMP, devices: [sensorValue()] });
  const store = new EntityStore();
  store.update(() => ({
    ...base,
    loaded: true,
    tables: {
      ...base.tables,
      plugin_streams: makeTable({ [key]: row }, [key], 1),
    },
  }));
  return store;
}

let queued: (() => void)[] = [];

function flushFrames(): void {
  const due = queued;
  queued = [];
  for (const callback of due) callback();
}

function tracksChange(x: number): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'plugin_streams',
    operation: 'UPDATE',
    seq: 10 + x,
    record: {
      plugin_id: SHELLY_PLUGIN_ID,
      stream: SHELLY_TRACKS_STREAM,
      value: {
        devices: [
          {
            id: 'radar-1',
            tracks: [{ id: 1, x, y: 2, z: 0.5 }],
            tracksAt: `2026-10-18T08:00:0${String(x)}.000Z`,
          },
        ],
      },
      at: STAMP,
    },
    oldRecord: null,
  });
}

interface Mounted {
  readonly root: { unmount: () => void };
  readonly mountNodes: number;
  readonly mountHooks: number;
}

function mount(store: InstanceType<typeof EntityStore>, size: keyof typeof FRAMES): Mounted {
  nodes.count = 0;
  nodes.hooks = {};
  const container = {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  };
  const root = createRoot(container);
  const cell = (): ReactNode =>
    createElement(DeviceSpotlightWidget, {
      deviceId: SENSOR_ID,
      size: 'M',
      editing: false,
      frame: FRAMES[size],
    });
  const tree = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(
        LightingContext,
        { value: LIGHTING.light },
        createElement(Profiler, { id: 'cell', onRender: (): void => undefined }, cell()),
      ),
    ),
  );
  act(() => {
    root.render(
      createElement((): ReactNode =>
        StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: tree }),
      ),
    );
  });
  return {
    root,
    mountNodes: nodes.count,
    mountHooks: Object.values(nodes.hooks).reduce((sum, count) => sum + count, 0),
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function release(root: { unmount: () => void }): Promise<void> {
  act(() => {
    root.unmount();
  });
  await settle();
}

function unrelatedChange(): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq: 1,
    record: { device_id: OTHER_ID, capability: 'power', value: true, observed_at: STAMP },
    oldRecord: null,
  });
}

describe('presence cell render counts', () => {
  useCellEnvironment();

  beforeEach(() => {
    queued = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
      queued.push(callback);
      return queued.length;
    });
  });

  for (const size of ['M', 'W', 'L'] as const) {
    it(`draws the ${size} card within its node and hook budget`, async () => {
      calls.list.length = 0;
      const store = storeOf();
      const mounted = mount(store, size);
      await settle();
      expect(mounted.mountNodes).toBeLessThanOrEqual(BUDGETS[size].nodes);
      expect(mounted.mountHooks).toBeLessThanOrEqual(BUDGETS[size].hooks);
      await release(mounted.root);
    });
  }

  it('holds the live view once for two visible cards and releases it with the last', async () => {
    calls.list.length = 0;
    const store = storeOf();
    const first = mount(store, 'M');
    await settle();
    const second = mount(store, 'W');
    await settle();
    const enabledOf = (flag: boolean): { enabled: boolean; holder: string }[] =>
      calls.list.filter((call) => call.enabled === flag);
    expect(enabledOf(true)).toStrictEqual([{ enabled: true, holder: 'view' }]);
    await release(first.root);
    expect(enabledOf(false)).toHaveLength(0);
    await release(second.root);
    expect(enabledOf(false)).toHaveLength(1);
  });

  it('does not render for another device and renders for new tracks', async () => {
    const store = storeOf();
    const mounted = mount(store, 'M');
    await settle();
    nodes.count = 0;
    act(() => {
      store.apply([unrelatedChange()]);
      flushFrames();
    });
    expect(nodes.count).toBe(0);
    act(() => {
      store.apply([tracksChange(1)]);
      flushFrames();
    });
    expect(nodes.count).toBeGreaterThan(0);
    nodes.count = 0;
    act(() => {
      store.apply([tracksChange(1)]);
      flushFrames();
    });
    expect(nodes.count).toBe(0);
    await release(mounted.root);
  });
});
