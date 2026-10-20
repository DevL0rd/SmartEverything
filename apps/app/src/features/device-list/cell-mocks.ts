import { isValidElement, useState, type ReactNode } from 'react';
import { vi } from 'vitest';
import type { Palette } from '../../design/colour-roles';

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
    make: (name: string) =>
      Object.assign(
        (props: { children?: unknown }): unknown => {
          state.count += 1;
          state.by[name] = (state.by[name] ?? 0) + 1;
          return elementsOf(props.children);
        },
        { host: name },
      ),
  };
  return state;
});

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

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const make = nodes.make;
  return {
    ...original,
    AppState: {
      currentState: 'active',
      addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
    },
    View: make('View'),
    Text: make('Text'),
    Pressable: make('Pressable'),
    Image: make('Image'),
    ScrollView: make('ScrollView'),
  };
});

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const shared = <T>(initial: T): { get: () => T; set: (next: T) => void } => {
    let current = initial;
    return {
      get: (): T => current,
      set: (next): void => {
        current = next;
      },
    };
  };
  const animated = {
    View: nodes.make('Anim.View'),
    Text: nodes.make('Anim.Text'),
    Image: nodes.make('Anim.Image'),
    ScrollView: nodes.make('Anim.ScrollView'),
    createAnimatedComponent: (): ReturnType<typeof nodes.make> => nodes.make('Anim.created'),
  };
  return {
    ...original,
    default: animated,
    ...animated,
    useAnimatedStyle: (): object => ({}),
    useAnimatedProps: (): object => ({}),
    useAnimatedReaction: (): undefined => undefined,
    useDerivedValue: (compute: () => unknown): object => shared(compute()),
    useSharedValue: (initial: unknown): object => useState(() => shared(initial))[0],
    useReducedMotion: (): boolean => false,
    withTiming: (value: unknown): unknown => value,
    withSpring: (value: unknown): unknown => value,
    withDelay: (_delay: unknown, value: unknown): unknown => value,
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

export const cellNodes = nodes;
export const { CommandLedger } = await import('../../store/command-ledger');
export const { EntityStore } = await import('../../store/entity-store');
export const { StoreProvider } = await import('../../store/store-context');
export const { deviceFixture, stateFixture } = await import('../../store/device-fixture');
export const { COLOUR_VARIABLE, PaletteContext } = await import('../../design/colour-roles');
export const { LIGHTING, LightingContext } = await import('../device-visuals/parts/material');
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const COLOUR_BITS = 0xffffff;

function roleColour(role: string): string {
  let hash = FNV_OFFSET;
  for (const char of role) hash = Math.imul(hash ^ char.charCodeAt(0), FNV_PRIME);
  return `#${((hash >>> 0) & COLOUR_BITS).toString(16).padStart(6, '0')}`;
}

export const PALETTE: Palette = new Proxy(COLOUR_VARIABLE, {
  get: (_target, role): string => roleColour(String(role)),
});
export const { DeviceSpotlightWidget } = await import('../devices');
export const { DeviceVisual } = await import('../device-visuals');
export const { visualStateOf } = await import('../device-visuals/model/visual-state');
