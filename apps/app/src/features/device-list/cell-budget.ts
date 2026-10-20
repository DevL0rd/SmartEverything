import { act, createElement, Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LIVE_CHANGE,
  type DeviceCapability,
  type DeviceKind,
  type DeviceRow,
  type LiveChange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandLedger,
  DeviceSpotlightWidget,
  DeviceVisual,
  EntityStore,
  LIGHTING,
  LightingContext,
  PALETTE,
  PaletteContext,
  StoreProvider,
  deviceFixture,
  cellNodes as nodes,
  stateFixture,
  visualStateOf,
} from './cell-mocks';
import type { VisualState } from '../device-visuals';
import type { StoreState } from '../../store/state';
import { startClock } from '../../store/clock';
import type { WidgetFrameBox } from '../../components/widget-board';
import { treeOf } from './cell-tree';

const DEVICE = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const STAMP = '2026-10-16T08:00:00.000Z';
const LATER = '2026-10-16T08:05:00.000Z';

export type Spec = readonly [DeviceCapability['key'], DeviceCapability['value']];

export interface Face {
  readonly name: string;
  readonly kind: DeviceKind;
  readonly model?: string;
  readonly specs: readonly Spec[];
  readonly values: Readonly<Record<string, number | boolean | string>>;
  readonly shown: readonly [string, number | boolean | string];
  readonly details?: DeviceRow['details'];
  readonly seed?: (state: StoreState) => StoreState;
}

export interface Budget {
  readonly nodes: number;
  readonly hooks: number;
  readonly subscriptions: number;
}

const FRAMES = {
  S: { width: 144, height: 190, idiom: 'touch' },
  M: { width: 300, height: 190, idiom: 'touch' },
} as const;

const SIGNAL: Spec = ['signal_strength', { kind: 'number', min: 0, max: 100, step: 1 }];

function capabilities(specs: readonly Spec[]): DeviceCapability[] {
  return [...specs, SIGNAL].map(([key, value]) => ({
    key,
    label: key,
    access: key === 'pm25' || key === 'battery' || key === 'temperature' ? 'read' : 'read_write',
    value,
  }));
}

function stateChange(deviceId: string, capability: string, value: unknown, at: string): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq: Math.floor(Date.parse(at) / 1000),
    record: { device_id: deviceId, capability, value, observed_at: at },
    oldRecord: null,
  });
}

function valuesOf(
  face: Face,
): Record<string, { value: number | boolean | string; observedAt: string }> {
  return Object.fromEntries(
    Object.entries({ ...face.values, signal_strength: 40 }).map(([key, value]) => [
      key,
      { value, observedAt: STAMP },
    ]),
  );
}

export interface Mounted {
  readonly store: InstanceType<typeof EntityStore>;
  readonly mountNodes: number;
  readonly firstHooks: number;
  readonly mountMs: number;
  readonly unmount: () => void;
  readonly tree: () => string;
}

let frames: (() => void)[] = [];
let hookCalls: Readonly<Record<string, number>> = {};
let breakdown: Readonly<Record<string, number>> = {};

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

function storeOf(face: Face): {
  readonly id: string;
  readonly store: InstanceType<typeof EntityStore>;
} {
  const device = deviceFixture(0, {
    id: DEVICE,
    kind: face.kind,
    ...(face.model === undefined ? {} : { model: face.model }),
    capabilities: capabilities(face.specs),
    ...(face.details === undefined ? {} : { details: face.details }),
    room_id: 'room-0',
  });
  const other = deviceFixture(1, { id: OTHER, room_id: 'room-0' });
  const store = new EntityStore();
  const base = {
    ...stateFixture([device, other], { [device.id]: valuesOf(face), [other.id]: {} }),
    loaded: true,
  };
  store.update(() => (face.seed === undefined ? base : face.seed(base)));
  return { id: device.id, store };
}

function containerOf(): object {
  return {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  };
}

function elementOf(
  { id, store }: ReturnType<typeof storeOf>,
  size: 'S' | 'M' | WidgetFrameBox,
  onRender: (id: string, phase: string, actual: number) => void,
): ReactNode {
  const cell = createElement(DeviceSpotlightWidget, {
    deviceId: id,
    size: 'M',
    editing: false,
    frame: typeof size === 'string' ? FRAMES[size] : size,
  });
  const palette = createElement(
    PaletteContext,
    { value: PALETTE },
    createElement(
      LightingContext,
      { value: LIGHTING.light },
      createElement(Profiler, { id: 'cell', onRender }, cell),
    ),
  );
  return createElement((): ReactNode =>
    StoreProvider({
      runtime: { store, ledger: new CommandLedger(store) },
      children: palette,
    }),
  );
}

export function mountFace(face: Face, size: 'S' | 'M' | WidgetFrameBox): Mounted {
  const placed = storeOf(face);
  let duration = 0;
  nodes.count = 0;
  nodes.by = {};
  nodes.hooks = {};
  const container = containerOf();
  const root = createRoot(container);
  act(() => {
    root.render(
      elementOf(placed, size, (_id, _phase, actual): void => {
        duration += actual;
      }),
    );
  });
  flushFrames();
  const mountNodes = nodes.count;
  breakdown = { ...nodes.by };
  hookCalls = { ...nodes.hooks };
  return {
    store: placed.store,
    mountNodes,
    firstHooks: Object.values(nodes.hooks).reduce((sum, count) => sum + count, 0),
    mountMs: duration,
    tree: (): string => treeOf(container),
    unmount: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function rendersAfter(mounted: Mounted, change: LiveChange): number {
  nodes.count = 0;
  act(() => {
    mounted.store.apply([change]);
    flushFrames();
  });
  return nodes.count;
}

interface Row {
  readonly face: string;
  readonly size: string;
  readonly nodes: number;
  readonly firstHooks: number;
  readonly ms: number;
  readonly shown: number;
  readonly restamp: number;
  readonly unrelated: number;
  readonly other: number;
  readonly by: Readonly<Record<string, number>>;
  readonly hooks: Readonly<Record<string, number>>;
}

let stopClock = (): void => undefined;

export function useCellEnvironment(at?: number): void {
  beforeEach(() => {
    frames = [];
    vi.useFakeTimers();
    if (at !== undefined) {
      vi.setSystemTime(at);
      stopClock = startClock();
    }
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
  });

  afterEach(() => {
    stopClock();
    stopClock = (): void => undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}

function rowLine(row: Row): string {
  const by = Object.entries(row.by)
    .map(([name, count]) => `${name}=${String(count)}`)
    .join(' ');
  const hooks = Object.entries(row.hooks)
    .map(([name, count]) => `${name}=${String(count)}`)
    .join(' ');
  return `${row.face.padEnd(16)} ${row.size} nodes=${String(row.nodes).padStart(4)} firstHooks=${String(row.firstHooks).padStart(4)} mountMs=${String(row.ms).padStart(6)} shown=${String(row.shown).padStart(3)} restamp=${String(row.restamp).padStart(3)} unrelated=${String(row.unrelated).padStart(3)} other=${String(row.other).padStart(3)}\n  ${by}\n  ${hooks}\n`;
}

async function measureCase(face: Face, size: 'S' | 'M'): Promise<Row> {
  const mounted = mountFace(face, size);
  const file = `__snapshots__/cell-trees/${face.name.replaceAll(' ', '-')}-${size}`;
  await expect(mounted.tree()).toMatchFileSnapshot(`${file}.txt`);
  const [shownKey, shownValue] = face.shown;
  const shown = rendersAfter(mounted, stateChange(DEVICE, shownKey, shownValue, LATER));
  await expect(mounted.tree()).toMatchFileSnapshot(`${file}-shown.txt`);
  const restamp = rendersAfter(
    mounted,
    stateChange(DEVICE, shownKey, shownValue, '2026-10-16T08:06:00.000Z'),
  );
  const unrelated = rendersAfter(
    mounted,
    stateChange(DEVICE, 'signal_strength', 41, '2026-10-16T08:06:30.000Z'),
  );
  const other = rendersAfter(
    mounted,
    stateChange(OTHER, 'power', true, '2026-10-16T08:07:00.000Z'),
  );
  const row: Row = {
    face: face.name,
    size,
    nodes: mounted.mountNodes,
    firstHooks: mounted.firstHooks,
    ms: Math.round(mounted.mountMs * 10) / 10,
    shown,
    restamp,
    unrelated,
    other,
    by: breakdown,
    hooks: hookCalls,
  };
  mounted.unmount();
  return row;
}

export function budgetCase(
  kind: string,
  face: Face,
  max: Readonly<Record<'S' | 'M', Budget>>,
  at?: number,
): void {
  describe(`${kind} cell render counts`, () => {
    useCellEnvironment(at);
    for (const size of ['S', 'M'] as const) {
      it(`${face.name} ${size}`, async () => {
        const row = await measureCase(face, size);
        process.stdout.write(`\n${rowLine(row)}`);
        const budget = max[size];
        expect(row.nodes).toBeLessThanOrEqual(budget.nodes);
        expect(row.firstHooks).toBeLessThanOrEqual(budget.hooks);
        expect(row.hooks['useSyncExternalStore'] ?? 0).toBeLessThanOrEqual(budget.subscriptions);
        expect(row.other).toBe(0);
        expect(row.unrelated).toBe(0);
        if (face.kind !== 'sensor') expect(row.restamp).toBe(0);
      });
    }
  });
}

export interface VisualCase {
  readonly kind: DeviceKind;
  readonly model?: string;
  readonly specs: readonly Spec[];
  readonly facts?: Partial<VisualState>;
}

export function renderVisual(
  visual: VisualCase,
  values: Readonly<Record<string, number | boolean | string>>,
  size: 'tile' | 'card' | 'hero',
  px: 48 | 96 | 220,
): { readonly count: number; readonly tree: string } {
  const device = deviceFixture(0, {
    id: DEVICE,
    kind: visual.kind,
    model: visual.model ?? 'test.model',
    capabilities: capabilities(visual.specs),
  });
  const observed = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value, observedAt: STAMP }]),
  );
  const container = containerOf();
  const root = createRoot(container);
  nodes.count = 0;
  act(() => {
    root.render(
      createElement(
        PaletteContext,
        { value: PALETTE },
        createElement(
          LightingContext,
          { value: LIGHTING.light },
          createElement(DeviceVisual, {
            device,
            size,
            px,
            state: { ...visualStateOf({ ...device, online: true }, observed), ...visual.facts },
          }),
        ),
      ),
    );
  });
  flushFrames();
  const count = nodes.count;
  const tree = treeOf(container);
  act(() => {
    root.unmount();
  });
  return { count, tree };
}
