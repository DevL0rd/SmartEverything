import {
  act,
  createElement,
  Fragment,
  type ReactElement,
  isValidElement,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { ComputerLiveNotice, WatchTopic } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    TextInput: nodes.make('TextInput'),
  };
});

vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: {
    data: readonly unknown[];
    renderItem: (info: unknown) => ReactNode;
  }): ReactNode[] => {
    nodes.count += 1;
    return props.data.map((item, index) =>
      createElement(Fragment, { key: index }, props.renderItem({ item, index })),
    );
  },
}));

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
    GestureHandlerRootView: (props: { children?: ReactNode }): ReactNode =>
      elementsOf(props.children),
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

vi.mock('../../components/highlighted', () => ({ Highlighted: (): null => null }));

vi.mock('../devices', () => ({ useLastSeen: (): null => null }));

vi.mock('./files/screenshot', () => ({
  useScreenshotToChat: (): { run: () => undefined; pending: boolean; reason: null } => ({
    run: (): undefined => undefined,
    pending: false,
    reason: null,
  }),
}));

vi.mock('../../store/computer-backfill', () => ({
  useRingBackfill: (): undefined => undefined,
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
const { DemandRegion } = await import('../../store/demand-region');
const { Adapters } = await import('./network/adapters');
const { Wireless } = await import('./network/wireless');
const { Drives } = await import('./storage/drives');
const { AudioBody } = await import('./audio/audio-screen');
const { DisplaysBody } = await import('./displays/displays-screen');
const { WindowsSection } = await import('./apps/windows-section');
const { Results: ProcessResults } = await import('./processes/processes-screen');
const { SettingsSection } = await import('./system/settings-section');
const { ServicesSection } = await import('./system/services-section');
const { TimersSection, UsbSection } = await import('./system/info-sections');

const ROLES = Object.keys(COLOUR_VARIABLE);
const PALETTE: Palette = new Proxy(COLOUR_VARIABLE, {
  get: (_target, role): string =>
    `#${(0x102030 + ROLES.indexOf(String(role)) * 0x050403).toString(16).padStart(6, '0')}`,
});

const DEVICE = '00000000-0000-4000-8000-0000000000c1';
const START = Date.parse('2026-10-17T10:00:00.000Z');
const GB = 1_000_000_000;

interface Change {
  readonly rate?: number;
  readonly used?: number;
  readonly dnd?: boolean;
  readonly volume?: number;
  readonly title?: string;
  readonly cpu?: number;
  readonly scale?: number;
}

const SCREEN_MODE = { width: 1920, height: 1080, refreshHz: 60, preferred: true };

function pages(change: Change): ComputerLiveNotice['parts'] {
  return {
    audio: {
      outputs: [
        {
          id: 'out',
          name: 'Speakers',
          kind: 'speakers',
          isDefault: true,
          available: true,
          volume: change.volume ?? 40,
          muted: false,
          maxVolume: 150,
          batteryPercent: null,
          usedBy: [],
        },
      ],
      inputs: [],
      apps: [],
    },
    displays: {
      outputs: [
        {
          id: 'DP-1',
          name: 'Main screen',
          builtIn: false,
          enabled: true,
          primary: true,
          mode: SCREEN_MODE,
          modes: [SCREEN_MODE],
          scalePercent: change.scale ?? 100,
          rotation: 0,
          x: 0,
          y: 0,
          brightness: 50,
          hdr: { supported: false, enabled: false },
          vrr: null,
          mirrorOf: null,
        },
      ],
      nightLight: { supported: false, mode: 'off', active: false, temperatureKelvin: null },
      pendingRevert: null,
    },
    windows: {
      windows: [
        {
          id: 'w1',
          title: change.title ?? 'Docs',
          app: { id: 'fx', name: 'Firefox' },
          desktop: '1',
          minimised: false,
          focused: true,
        },
      ],
    },
    processes: {
      total: 1,
      offset: 0,
      order: ['100:1'],
      rows: [
        {
          pid: 100,
          start: 1,
          ppid: 1,
          name: 'firefox',
          command: 'firefox',
          user: 'dana',
          state: 'running',
          cpu: change.cpu ?? 5,
          memoryBytes: 1_000_000,
          gpu: null,
          diskRate: 0,
          threads: 4,
          descendants: 0,
          own: true,
        },
      ],
    },
  };
}

function notice(tick: number, change: Change = {}): ComputerLiveNotice {
  return {
    type: 'computer_live',
    deviceId: DEVICE,
    at: new Date(START + tick * 1000).toISOString(),
    parts: {
      disks: {
        disks: [
          {
            mount: '/',
            device: 'nvme0n1',
            label: null,
            filesystem: 'ext4',
            usedBytes: (change.used ?? 100) * GB,
            totalBytes: 500 * GB,
            readRate: change.rate ?? 1000,
            writeRate: change.rate ?? 2000,
            temperature: 44,
          },
        ],
      },
      network: {
        downloadRate: change.rate ?? 4_400_000,
        uploadRate: 120_000,
        interfaces: [
          {
            name: 'wlan0',
            kind: 'wifi',
            state: 'up',
            speedMbps: 866,
            signalPercent: 80,
            addresses: ['192.168.1.20', 'fe80::1'],
            downloadRate: change.rate ?? 4_400_000,
            uploadRate: 120_000,
          },
        ],
      },
      system: {
        battery: null,
        powerMode: { current: 'balanced', offered: ['power_saver', 'balanced', 'performance'] },
        dnd: change.dnd ?? false,
        keyboard: { layouts: [{ id: 'us', name: 'English (US)' }], current: 'us' },
        wifi: {
          enabled: true,
          networks: [
            { ssid: 'Home', signalPercent: 80, secured: true, known: true, connected: true },
            { ssid: 'Cafe', signalPercent: 40, secured: true, known: true, connected: false },
          ],
        },
        bluetooth: {
          enabled: true,
          devices: [{ id: 'aa', name: 'Buds', connected: true, batteryPercent: 70 }],
        },
        usb: [{ id: '1', name: 'Keyboard', vendor: 'Acme', speedMbps: 480 }],
      },
      ...pages(change),
      services: {
        services: [
          {
            unit: 'backup.service',
            description: 'Backup',
            state: 'active',
            startsAtLogin: true,
            system: false,
          },
          {
            unit: 'sshd.service',
            description: '',
            state: 'active',
            startsAtLogin: null,
            system: true,
          },
        ],
        timers: [
          {
            unit: 'backup.timer',
            description: '',
            nextRunAt: new Date(START + 3_600_000).toISOString(),
            lastRunAt: null,
          },
        ],
      },
    },
  };
}

interface Mounted {
  readonly nodes: number;
  readonly renders: (next: ComputerLiveNotice) => number;
  readonly unmount: () => void;
}

const open = new Set<ReturnType<typeof createRoot>>();

function computerDevice(): Device {
  return deviceFixture(0, {
    id: DEVICE,
    kind: 'computer',
    model: 'smarteverything.computer',
    capabilities: [],
    details: { os: 'Linux' },
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
  const first = nodes.count;
  return {
    nodes: first,
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

function region(topics: readonly WatchTopic[], child: ReactElement): ReactNode {
  return createElement((): ReactNode =>
    DemandRegion({ deviceId: DEVICE, topics, children: child }),
  );
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

interface Part {
  readonly name: string;
  readonly build: (device: Device) => ReactNode;
  readonly topics: readonly WatchTopic[];
}

const DRIVES: Part = {
  name: 'drives',
  topics: ['disks'],
  build: (device) => region(['disks'], createElement(Drives, { device })),
};

const ADAPTERS: Part = {
  name: 'adapters',
  topics: ['network', 'system'],
  build: (device) =>
    region(
      ['network', 'system'],
      createElement(
        Fragment,
        null,
        createElement(Adapters, { device }),
        createElement(Wireless, { device }),
      ),
    ),
};

const SETTINGS: Part = {
  name: 'system settings, services, timers and USB',
  topics: ['system', 'services'],
  build: (device) =>
    region(
      ['system', 'services'],
      createElement(
        Fragment,
        null,
        createElement(SettingsSection, { deviceId: DEVICE, offline: false }),
        createElement(ServicesSection, { device }),
        createElement(TimersSection, { deviceId: DEVICE }),
        createElement(UsbSection, { deviceId: DEVICE }),
      ),
    ),
};

const AUDIO: Part = {
  name: 'audio',
  topics: ['audio'],
  build: (device) => region(['audio'], createElement(AudioBody, { device })),
};

const DISPLAYS: Part = {
  name: 'displays',
  topics: ['displays'],
  build: (device) => region(['displays'], createElement(DisplaysBody, { device })),
};

const WINDOWS: Part = {
  name: 'open windows',
  topics: ['windows'],
  build: (device) => createElement(WindowsSection, { deviceId: DEVICE, online: device.online }),
};

const PROCESSES: Part = {
  name: 'processes',
  topics: ['processes'],
  build: () => createElement(ProcessResults, { deviceId: DEVICE, offline: false }),
};

const PARTS: readonly Part[] = [DRIVES, ADAPTERS, SETTINGS, AUDIO, DISPLAYS, WINDOWS, PROCESSES];

describe('network, storage and system parts', () => {
  it.each(PARTS)('$name draws from live data and asks only for its topics', (part) => {
    const mounted = mountElement(part.build);
    expect(mounted.nodes).toBeGreaterThan(0);
    expect([...liveWatch.topicsOf(DEVICE)].sort()).toEqual([...part.topics].sort());
    mounted.unmount();
    expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
  });

  it.each(PARTS)('$name renders nothing while its screen is paused', (part) => {
    const mounted = mountElement(part.build, true);
    expect(liveWatch.topicsOf(DEVICE).size).toBe(0);
    expect(mounted.renders(notice(1, { rate: 9_000_000, used: 120, dnd: true }))).toBe(0);
    mounted.unmount();
  });

  it('redraws a drive card shell only when something visible changed, not on a rate tick', () => {
    const mounted = mountElement(DRIVES.build);
    const rate = mounted.renders(notice(1, { rate: 5_000_000 }));
    const used = mounted.renders(notice(2, { rate: 5_000_000, used: 130 }));
    mounted.unmount();
    expect(rate).toBeLessThan(used);
  });

  it('redraws the settings only when a setting changed', () => {
    const mounted = mountElement(SETTINGS.build);
    const quiet = mounted.renders(notice(1, { rate: 5_000_000 }));
    const changed = mounted.renders(notice(2, { dnd: true }));
    mounted.unmount();
    expect(quiet).toBe(0);
    expect(changed).toBeGreaterThan(0);
  });
});

describe('audio, displays, open windows and processes', () => {
  it.each([AUDIO, DISPLAYS, WINDOWS, PROCESSES])(
    '$name does not redraw for a notice about another part',
    (part) => {
      const mounted = mountElement(part.build);
      expect(mounted.renders(notice(1, { rate: 9_000_000, used: 120, dnd: true }))).toBe(0);
      mounted.unmount();
    },
  );

  it.each([
    [AUDIO, { volume: 70 }],
    [DISPLAYS, { scale: 125 }],
    [WINDOWS, { title: 'Mail' }],
    [PROCESSES, { cpu: 40 }],
  ] as const)('%# redraws when its own part changed', (part, change) => {
    const mounted = mountElement(part.build);
    expect(mounted.renders(notice(1, change))).toBeGreaterThan(0);
    mounted.unmount();
  });
});
