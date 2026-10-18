import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ComputerLiveNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../components/widget-board';
import type { Palette } from '../../design/colour-roles';
import type { Device } from '../../store/state';

interface Counters {
  count: number;
  by: Record<string, number>;
  hooks: Record<string, number>;
  make: (name: string) => (props: { children?: unknown }) => unknown;
}

const nodes = vi.hoisted((): Counters => {
  const state: Counters = {
    count: 0,
    by: {},
    hooks: {},
    make: (name: string) => (props: { children?: unknown }) => {
      state.count += 1;
      state.by[name] = (state.by[name] ?? 0) + 1;
      return elementsOf(props.children);
    },
  };
  return state;
});

const elementsOf = vi.hoisted(
  () =>
    function elementsOf(children: unknown): ReactNode {
      return Array.isArray(children)
        ? children.map(elementsOf)
        : isValidElement(children)
          ? children
          : null;
    },
);

vi.mock('react', async (importOriginal) => {
  const HOOKS = [
    'useState',
    'useReducer',
    'useEffect',
    'useLayoutEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useContext',
    'use',
    'useSyncExternalStore',
    'useId',
    'useImperativeHandle',
  ] as const;
  const original = await importOriginal<Record<string, unknown>>();
  const counted = Object.fromEntries(
    HOOKS.map((name) => {
      const hook = original[name];
      return [
        name,
        typeof hook === 'function'
          ? (...args: unknown[]): unknown => {
              nodes.hooks[name] = (nodes.hooks[name] ?? 0) + 1;
              return Reflect.apply(hook, undefined, args);
            }
          : hook,
      ];
    }),
  );
  return { ...original, ...counted };
});

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    AppState: {
      currentState: 'active',
      addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
    },
    View: nodes.make('View'),
    Text: nodes.make('Text'),
    Pressable: nodes.make('Pressable'),
  };
});

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const animated = {
    View: nodes.make('Anim.View'),
    createAnimatedComponent: (): ReturnType<typeof nodes.make> => nodes.make('Anim.created'),
  };
  const shared = (initial: unknown): object => ({
    get: () => initial,
    set: (): undefined => undefined,
  });
  return {
    ...original,
    default: animated,
    ...animated,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useAnimatedReaction: (): undefined => undefined,
    useDerivedValue: (compute: () => unknown): object => shared(compute()),
    useSharedValue: (initial: unknown): object => shared(initial),
    useReducedMotion: (): boolean => false,
    withSequence: (value: unknown): unknown => value,
    withTiming: (value: unknown): unknown => value,
    withSpring: (value: unknown): unknown => value,
  };
});

vi.mock('react-native-gesture-handler', () => {
  const chain: () => unknown = () => new Proxy(chain, { get: () => chain, apply: () => chain() });
  return {
    Gesture: chain(),
    GestureDetector: (props: { children?: ReactNode }): ReactNode => elementsOf(props.children),
  };
});

vi.mock('react-native-svg', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => [
      key,
      typeof value === 'function' ? nodes.make(`Svg.${key}`) : value,
    ]),
  );
});

const screen = vi.hoisted(() => ({ visible: true }));

vi.mock('../../design/visibility', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: screen.visible,
    onLayout: undefined,
  }),
  useOnScreenGate: (): { moving: boolean; reduced: boolean; onLayout: undefined } => ({
    moving: true,
    reduced: false,
    onLayout: undefined,
  }),
}));

vi.mock('../../design/motion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

vi.mock('../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIdiom: (): string => 'touch',
}));

vi.mock('../../platform/haptics', () => ({ selectionTick: (): undefined => undefined }));

vi.mock('../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: undefined } => ({
    width: 300,
    onLayout: undefined,
  }),
}));

vi.mock('../devices', () => ({ useLastSeen: (): null => null }));

vi.mock('./files/screenshot', () => ({
  useScreenshotToChat: (): { run: () => undefined; pending: boolean; reason: null } => ({
    run: (): undefined => undefined,
    pending: false,
    reason: null,
  }),
}));

const backfill = vi.hoisted(() => {
  const topics: (readonly string[] | undefined)[] = [];
  return { topics };
});

vi.mock('../../store/computer-backfill', () => ({
  useRingBackfill: (_device: string, _source: string, topics?: readonly string[]): undefined => {
    backfill.topics.push(topics);
  },
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../store/command-ledger');
const { EntityStore } = await import('../../store/entity-store');
const { StoreProvider } = await import('../../store/store-context');
const { deviceFixture, stateFixture } = await import('../../store/device-fixture');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../design/colour-roles');
const { computerLive } = await import('../../store/computer-live');
const { computerRings } = await import('../../store/computer-rings');
const { liveWatch } = await import('../../store/live-watch');
const { ScreenPause, ScreenPausedContext } = await import('../../design/screen-pause');
const { ComputerFace } = await import('./card/computer-faces');
const { ComputerHero } = await import('./overview/hero');
const { ComputerStrip } = await import('./overview/computer-strip');
const { OverviewCharts } = await import('./overview/chart-cards');
const { MemoryCard } = await import('./overview/memory-card');
const { NowPlayingCard, VolumeCard } = await import('./overview/sound-cards');
const { TopProcesses } = await import('./overview/top-processes');
const { CpuCard } = await import('./performance/cpu-card');
const { GpuCard } = await import('./performance/gpu-card');
const { PerformanceMemoryCard } = await import('./performance/memory-card');
const { TempsCard } = await import('./performance/temps-card');
const { PowerCard } = await import('./performance/power-card');
const { SensorsList } = await import('./performance/sensors-list');
const { statusOf } = await import('./model/computer-view');

const ROLES = Object.keys(COLOUR_VARIABLE);
const PALETTE: Palette = new Proxy(COLOUR_VARIABLE, {
  get: (_target, role): string =>
    `#${(0x102030 + ROLES.indexOf(String(role)) * 0x050403).toString(16).padStart(6, '0')}`,
});

const DEVICE = '00000000-0000-4000-8000-0000000000c1';
const START = Date.parse('2026-10-17T10:00:00.000Z');
const GB = 1_000_000_000;

interface Change {
  readonly cpu?: number;
  readonly uptime?: number;
}

function notice(tick: number, change: Change = {}): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: DEVICE,
    at: new Date(START + tick * 1000).toISOString(),
    parts: {
      summary: {
        cpuLoad: change.cpu ?? 21,
        cpuTemperature: 46,
        memoryPercent: 41,
        swapPercent: 3,
        gpuLoad: 60,
        gpuTemperature: 70,
        gpuMemoryPercent: 50,
        cpuWatts: 30,
        gpuWatts: 110,
        downloadRate: 4_400_000,
        uploadRate: 120_000,
        fullestDisk: { mount: '/home', percent: 63 },
        batteryLevel: 78,
        charging: false,
        totalWatts: 140,
        processCount: 412,
        uptimeSeconds: change.uptime ?? 1000,
      },
      cpu: {
        load: change.cpu ?? 21,
        cores: [10, 20, 30, 40],
        frequenciesGhz: [3, 3, 3, 3],
        performanceLoad: 25,
        efficiencyLoad: 15,
        frequencyGhz: 3,
        maxFrequencyGhz: 5.6,
        temperature: 46,
        powerWatts: 30,
        powerLimitWatts: 55,
        loadAverage: [1.2, 1.4, 1.6],
        throttled: false,
      },
      gpu: {
        gpus: [
          {
            id: '0',
            name: 'NVIDIA GeForce RTX 4090 Laptop',
            vendor: 'nvidia',
            load: 60,
            memoryUsedBytes: 9 * GB,
            memoryTotalBytes: 16 * GB,
            temperature: 70,
            powerWatts: 110,
            powerLimitWatts: 175,
            clockMhz: 2400,
            maxClockMhz: 2600,
            memoryClockMhz: 9000,
            fanPercent: 48,
            encoderLoad: 0,
            decoderLoad: 12,
          },
        ],
      },
      memory: {
        usedBytes: 13 * GB,
        totalBytes: 32 * GB,
        availableBytes: 19 * GB,
        cachedBytes: 9 * GB,
        buffersBytes: 1 * GB,
        freeBytes: 9 * GB,
        swapUsedBytes: 0.4 * GB,
        swapTotalBytes: 16 * GB,
        swapInRate: 0,
        swapOutRate: 0,
      },
      disks: {
        disks: [
          {
            mount: '/',
            device: 'nvme0n1',
            label: null,
            filesystem: 'ext4',
            usedBytes: 100 * GB,
            totalBytes: 500 * GB,
            readRate: 1000,
            writeRate: 2000,
            temperature: 44,
          },
        ],
      },
      sensors: {
        sensors: [
          {
            chip: 'coretemp',
            label: 'Package',
            celsius: 46,
            highCelsius: 90,
            criticalCelsius: 100,
          },
          { chip: 'nvme', label: 'Composite', celsius: 88, highCelsius: 80, criticalCelsius: 95 },
        ],
        fans: [{ label: 'CPU fan', rpm: 1800, maxRpm: 3500 }],
      },
      power: { totalWatts: 140, batteryWatts: null },
      processes: {
        total: 412,
        offset: 0,
        order: ['10:1'],
        rows: [
          {
            pid: 10,
            start: 1,
            ppid: 1,
            name: 'Firefox',
            command: 'firefox',
            user: 'dana',
            state: 'running',
            cpu: 6.8,
            memoryBytes: 2 * GB,
            gpu: null,
            diskRate: 0,
            threads: 40,
            descendants: 11,
            own: true,
          },
        ],
      },
      session: {
        at: new Date(START).toISOString(),
        user: 'dana',
        locked: false,
        focused: null,
        volume: 42,
        muted: false,
        media: {
          player: 'Spotify',
          title: 'Everything In Its Right Place',
          artist: 'Radiohead',
          status: 'playing',
        },
      },
    },
  };
}

interface Budget {
  readonly nodes: number;
  readonly hooks: number;
  readonly subscriptions: number;
}

const BUDGETS: Readonly<Record<FrameClass, Budget>> = {
  s: { nodes: 25, hooks: 37, subscriptions: 6 },
  xs: { nodes: 26, hooks: 37, subscriptions: 6 },
  m: { nodes: 78, hooks: 128, subscriptions: 15 },
  w: { nodes: 82, hooks: 114, subscriptions: 14 },
  l: { nodes: 114, hooks: 178, subscriptions: 19 },
  xl: { nodes: 128, hooks: 214, subscriptions: 23 },
};

const QUIET_RENDERS: Readonly<Record<FrameClass, number>> = {
  s: 6,
  xs: 11,
  m: 11,
  w: 30,
  l: 38,
  xl: 38,
};

const CLASSES: readonly FrameClass[] = ['s', 'xs', 'm', 'w', 'l', 'xl'];

interface Mounted {
  readonly nodes: number;
  readonly hooks: number;
  readonly subscriptions: number;
  readonly renders: (next: ComputerLiveNotice) => number;
  readonly unmount: () => void;
}

const open = new Set<ReturnType<typeof createRoot>>();

function computerDevice(): Device {
  return deviceFixture(0, {
    id: DEVICE,
    kind: 'computer',
    model: 'smarteverything.computer',
    capabilities: [
      {
        key: 'volume',
        label: 'Volume',
        access: 'read_write',
        value: { kind: 'number', min: 0, max: 100, step: 1 },
      },
      { key: 'mute', label: 'Mute', access: 'read_write', value: { kind: 'boolean' } },
      {
        key: 'playback',
        label: 'Playback',
        access: 'read_write',
        value: { kind: 'enum', options: ['playing', 'paused'] },
      },
      { key: 'lock_screen', label: 'Lock', access: 'write', value: { kind: 'action' } },
      { key: 'sleep', label: 'Sleep', access: 'write', value: { kind: 'action' } },
    ],
    details: { os: 'Linux', portable: true },
  });
}

function mountElement(build: (device: Device) => ReactNode, paused = false): Mounted {
  const device = computerDevice();
  const store = new EntityStore();
  store.update(() => ({ ...stateFixture([device], { [device.id]: {} }), loaded: true }));
  nodes.count = 0;
  nodes.by = {};
  nodes.hooks = {};
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  open.add(root);
  const pause = new ScreenPause(null);
  pause.setOwn(paused);
  const gated = createElement(ScreenPausedContext, { value: pause }, build(device));
  const palette = createElement(PaletteContext, { value: PALETTE }, gated);
  const client = new QueryClient();
  act(() => {
    root.render(
      createElement((): ReactNode =>
        createElement(
          QueryClientProvider,
          { client },
          StoreProvider({
            runtime: { store, ledger: new CommandLedger(store) },
            children: palette,
          }),
        ),
      ),
    );
  });
  const first = {
    nodes: nodes.count,
    hooks: Object.values(nodes.hooks).reduce((sum, count) => sum + count, 0),
    subscriptions: nodes.hooks['useSyncExternalStore'] ?? 0,
  };
  return {
    ...first,
    renders: (next): number => {
      nodes.count = 0;
      act(() => {
        computerLive.receive(next);
      });
      return nodes.count;
    },
    unmount: (): void => {
      if (!open.delete(root)) return;
      act(() => {
        root.unmount();
      });
    },
  };
}

function mount(cls: FrameClass, paused = false): Mounted {
  return mountElement((device) => createElement(ComputerFace, { device, cls }), paused);
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (): number => 1);
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  computerLive.receive(notice(0));
});

afterEach(() => {
  for (const root of open) {
    act(() => {
      root.unmount();
    });
  }
  open.clear();
  computerLive.store(DEVICE).set({ at: null, parts: {} });
  computerRings.drop(DEVICE);
  vi.unstubAllGlobals();
});

describe('computer face render counts', () => {
  it.each(CLASSES)('face %s stays inside its node, hook and subscription budget', (cls) => {
    const mounted = mount(cls);
    mounted.unmount();
    const budget = BUDGETS[cls];
    expect(mounted.nodes).toBeLessThanOrEqual(budget.nodes);
    expect(mounted.hooks).toBeLessThanOrEqual(budget.hooks);
    expect(mounted.subscriptions).toBeLessThanOrEqual(budget.subscriptions);
  });

  it.each(CLASSES)('face %s redraws only its charts when nothing visible changed', (cls) => {
    const mounted = mount(cls);
    const quiet = mounted.renders(notice(1, { uptime: 1001 }));
    const changed = mounted.renders(notice(2, { cpu: 55, uptime: 1002 }));
    mounted.unmount();
    expect(quiet).toBeLessThanOrEqual(QUIET_RENDERS[cls]);
    expect(quiet).toBeLessThan(changed);
  });
});

describe('computer face off screen', () => {
  afterEach(() => {
    screen.visible = true;
    backfill.topics.length = 0;
  });

  it.each(['w', 'l'] as const)('face %s redraws less when it is off screen', (cls) => {
    const shown = mount(cls);
    const on = shown.renders(notice(1, { cpu: 55 }));
    shown.unmount();
    screen.visible = false;
    const hidden = mount(cls);
    const off = hidden.renders(notice(2, { cpu: 56 }));
    hidden.unmount();
    expect(off).toBeLessThan(on);
  });

  it('backfills only the summary for a card', () => {
    mount('l').unmount();
    expect(backfill.topics).toStrictEqual([['summary']]);
  });
});

describe('computer face demand', () => {
  it('holds the summary while it is on screen and lets go when it is gone', () => {
    const mounted = mount('m');
    expect(liveWatch.topicsOf(DEVICE).has('summary')).toBe(true);
    mounted.unmount();
    expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
  });

  it('renders nothing for a notice after it is gone', () => {
    const mounted = mount('l');
    mounted.unmount();
    expect(mounted.renders(notice(1, { cpu: 80 }))).toBe(0);
  });

  it('holds no demand and renders nothing while its screen is paused', () => {
    const mounted = mount('l', true);
    expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
    expect(mounted.renders(notice(1, { cpu: 80 }))).toBe(0);
    mounted.unmount();
  });
});

const ONLINE = statusOf({
  online: true,
  seenAt: null,
  locked: false,
  hottest: 50,
  throttled: false,
  busy: false,
  battery: null,
});

interface Part {
  readonly name: string;
  readonly build: (device: Device) => ReactNode;
  readonly topics: readonly string[];
  readonly reacts: boolean;
}

const PARTS: readonly Part[] = [
  {
    name: 'hero',
    build: (device) => createElement(ComputerHero, { device, status: ONLINE }),
    topics: [],
    reacts: true,
  },
  {
    name: 'strip',
    build: () => createElement(ComputerStrip, { deviceId: DEVICE, offline: false }),
    topics: [],
    reacts: true,
  },
  {
    name: 'charts',
    build: () => createElement(OverviewCharts, { deviceId: DEVICE, hasGpu: true, offline: false }),
    topics: ['summary'],
    reacts: true,
  },
  {
    name: 'memory card',
    build: () => createElement(MemoryCard, { deviceId: DEVICE, online: true }),
    topics: ['memory'],
    reacts: true,
  },
  {
    name: 'now playing',
    build: () => createElement(NowPlayingCard, { deviceId: DEVICE, disabled: false }),
    topics: [],
    reacts: false,
  },
  {
    name: 'volume',
    build: (device) => createElement(VolumeCard, { device, disabled: false }),
    topics: [],
    reacts: false,
  },
  {
    name: 'top processes',
    build: () => createElement(TopProcesses, { deviceId: DEVICE }),
    topics: ['processes'],
    reacts: false,
  },
  {
    name: 'cpu card',
    build: (device) => createElement(CpuCard, { device, range: 'live' }),
    topics: ['cpu'],
    reacts: true,
  },
  {
    name: 'gpu card',
    build: () =>
      createElement(GpuCard, { deviceId: DEVICE, online: true, gpuId: '0', range: 'live' }),
    topics: ['gpu'],
    reacts: true,
  },
  {
    name: 'performance memory card',
    build: () =>
      createElement(PerformanceMemoryCard, { deviceId: DEVICE, online: true, range: 'live' }),
    topics: ['memory'],
    reacts: true,
  },
  {
    name: 'temperatures card',
    build: () =>
      createElement(TempsCard, { deviceId: DEVICE, online: true, range: 'live', gpuId: '0' }),
    topics: ['cpu', 'gpu', 'disks', 'sensors'],
    reacts: true,
  },
  {
    name: 'power card',
    build: () =>
      createElement(PowerCard, {
        deviceId: DEVICE,
        online: true,
        name: 'Workstation',
        range: 'live',
        gpuId: '0',
        permitted: true,
      }),
    topics: ['cpu', 'gpu', 'power'],
    reacts: true,
  },
  {
    name: 'sensors list',
    build: () => createElement(SensorsList, { deviceId: DEVICE, offline: false }),
    topics: ['sensors'],
    reacts: false,
  },
];

describe('overview and performance parts', () => {
  it.each(PARTS)(
    '$name draws from live data and asks only for the topics it shows',
    ({ build, topics, reacts }) => {
      const mounted = mountElement(build);
      expect(mounted.nodes).toBeGreaterThan(0);
      expect([...liveWatch.topicsOf(DEVICE)].sort()).toEqual([...topics].sort());
      const redrawn = mounted.renders(notice(1, { cpu: 30 }));
      if (reacts) expect(redrawn).toBeGreaterThan(0);
      else expect(redrawn).toBe(0);
      mounted.unmount();
      expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
    },
  );

  it.each(PARTS)('$name renders nothing while its screen is paused', ({ build }) => {
    const mounted = mountElement(build, true);
    expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
    expect(mounted.renders(notice(1, { cpu: 30 }))).toBe(0);
    mounted.unmount();
  });
});
