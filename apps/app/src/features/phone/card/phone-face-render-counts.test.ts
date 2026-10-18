import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import type { Palette } from '../../../design/colour-roles';
import type { Device } from '../../../store/state';

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

vi.mock('../../../design/visibility', async (importOriginal) => ({
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

vi.mock('../../../design/motion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

vi.mock('../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIdiom: (): string => 'touch',
}));

vi.mock('../../../platform/haptics', () => ({
  selectionTick: (): undefined => undefined,
  heavyThud: (): undefined => undefined,
}));

vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: undefined } => ({
    width: 300,
    onLayout: undefined,
  }),
}));

vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: (): { push: () => undefined } => ({ push: (): undefined => undefined }),
}));

vi.mock('../../../api/transport', () => ({
  api: (): { call: () => Promise<never> } => ({ call: () => new Promise<never>(() => undefined) }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { COLOUR_VARIABLE, PaletteContext } = await import('../../../design/colour-roles');
const { ScreenPause, ScreenPausedContext } = await import('../../../design/screen-pause');
const { deviceHistoryKey } = await import('../../../queries/keys');
const { phoneDetailKey } = await import('../data/phone-detail');
const { PhoneFace } = await import('./phone-face');
const fixtures = await import('./phone-face-fixtures');

const ROLES = Object.keys(COLOUR_VARIABLE);
const PALETTE: Palette = new Proxy(COLOUR_VARIABLE, {
  get: (_target, role): string =>
    `#${(0x102030 + ROLES.indexOf(String(role)) * 0x050403).toString(16).padStart(6, '0')}`,
});

type WideClass = 'm' | 'w' | 'l' | 'xl';

const CLASSES: readonly WideClass[] = ['m', 'w', 'l', 'xl'];
const FIRST = '2026-10-18T10:00:00.000Z';
const NEXT = '2026-10-18T10:01:00.000Z';

interface Budget {
  readonly nodes: number;
  readonly hooks: number;
  readonly subscriptions: number;
}

const BUDGETS: Readonly<Record<WideClass, Budget>> = {
  m: { nodes: 95, hooks: 92, subscriptions: 6 },
  w: { nodes: 120, hooks: 119, subscriptions: 9 },
  l: { nodes: 98, hooks: 108, subscriptions: 8 },
  xl: { nodes: 113, hooks: 127, subscriptions: 8 },
};

const REDRAW_LIMIT: Readonly<Record<WideClass, number>> = {
  m: 72,
  w: 80,
  l: 75,
  xl: 76,
};

interface Mounted {
  readonly nodes: number;
  readonly hooks: number;
  readonly subscriptions: number;
  readonly change: (capability: string, value: number | boolean | string, at: string) => number;
  readonly unmount: () => void;
}

const open = new Set<ReturnType<typeof createRoot>>();

let frames: (() => void)[] = [];

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

function liveChange(capability: string, value: unknown, at: string): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq: Math.floor(Date.parse(at) / 1000),
    record: { device_id: fixtures.PHONE_DEVICE, capability, value, observed_at: at },
    oldRecord: null,
  });
}

function seeded(): InstanceType<typeof QueryClient> {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    device_id: fixtures.PHONE_DEVICE,
    capability: 'battery',
    value: 40 + index,
    observed_at: new Date(Date.parse(FIRST) - (12 - index) * 3_600_000).toISOString(),
  }));
  client.setQueryData(deviceHistoryKey(fixtures.PHONE_DEVICE, 'battery', 24), rows);
  client.setQueryData(deviceHistoryKey(fixtures.PHONE_DEVICE, 'charging', 24), []);
  client.setQueryData(phoneDetailKey(fixtures.PHONE_DEVICE), {});
  return client;
}

function mount(cls: FrameClass, options: { readonly paused?: boolean } = {}): Mounted {
  const device: Device = fixtures.phoneDevice({ clientId: fixtures.OTHER_CLIENT });
  const store = new EntityStore();
  store.update(() =>
    fixtures.phoneStore(device, {
      ...fixtures.DEFAULT_READINGS,
      now_playing: 'Song',
      playback: 'playing',
    }),
  );
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
  pause.setOwn(options.paused === true);
  const gated = createElement(
    ScreenPausedContext,
    { value: pause },
    createElement(PhoneFace, { device, cls }),
  );
  const palette = createElement(PaletteContext, { value: PALETTE }, gated);
  act(() => {
    root.render(
      createElement((): ReactNode =>
        createElement(
          QueryClientProvider,
          { client: seeded() },
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
    change: (capability, value, at): number => {
      nodes.count = 0;
      act(() => {
        store.apply([liveChange(capability, value, at)]);
        flushFrames();
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

beforeEach(() => {
  frames = [];
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
  for (const root of open) {
    act(() => {
      root.unmount();
    });
  }
  open.clear();
  screen.visible = true;
  vi.unstubAllGlobals();
});

describe('phone face render counts', () => {
  it.each(CLASSES)('face %s stays inside its node, hook and subscription budget', (cls) => {
    const mounted = mount(cls);
    mounted.unmount();
    process.stdout.write(
      `MEASURE ${cls} ${JSON.stringify({ n: mounted.nodes, h: mounted.hooks, s: mounted.subscriptions })}\n`,
    );
    const budget = BUDGETS[cls];
    expect(mounted.nodes).toBeLessThanOrEqual(budget.nodes);
    expect(mounted.hooks).toBeLessThanOrEqual(budget.hooks);
    expect(mounted.subscriptions).toBeLessThanOrEqual(budget.subscriptions);
  });

  it.each(CLASSES)('face %s draws nothing again for a reading it does not show at %s', (cls) => {
    const mounted = mount(cls);
    const hidden = mounted.change('storage_free', 5_000_000, NEXT);
    mounted.unmount();
    expect(hidden).toBe(0);
  });

  it.each(CLASSES)('face %s redraws only what a changed reading touches', (cls) => {
    const mounted = mount(cls);
    const changed = mounted.change('battery', 61, NEXT);
    const same = mounted.change('battery', 61, '2026-10-18T10:02:00.000Z');
    mounted.unmount();
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(REDRAW_LIMIT[cls]);
    expect(same).toBe(0);
  });

  it.each(CLASSES)('face %s renders nothing for a change after it is gone', (cls) => {
    const mounted = mount(cls);
    mounted.unmount();
    expect(mounted.change('battery', 30, NEXT)).toBe(0);
  });
});
