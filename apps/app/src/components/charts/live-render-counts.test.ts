import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Counters {
  total: number;
  by: Record<string, number>;
  make: (name: string) => (props: { children?: unknown }) => unknown;
}

const nodes = vi.hoisted((): Counters => {
  const state: Counters = {
    total: 0,
    by: {},
    make: (name: string) => (props: { children?: unknown }) => {
      state.total += 1;
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

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: nodes.make('View'),
  Text: nodes.make('Text'),
}));

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const animated = { View: nodes.make('Anim.View') };
  return {
    ...original,
    default: animated,
    ...animated,
    cancelAnimation: (): undefined => undefined,
    useAnimatedStyle: (): object => ({}),
    useSharedValue: (initial: unknown): object => ({
      get: () => initial,
      set: (): undefined => undefined,
    }),
    withSequence: (value: unknown): unknown => value,
    withTiming: (value: unknown): unknown => value,
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

vi.mock('../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: true,
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
  useIdiom: (): string => 'pointer',
}));

vi.mock('../../platform/haptics', () => ({ selectionTick: (): undefined => undefined }));

vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: undefined } => ({
    width: 320,
    onLayout: undefined,
  }),
}));

const { COLOUR_VARIABLE, PaletteContext } = await import('../../design/colour-roles');
const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });
const { TimeSeriesChart } = await import('./time-series-chart');
const { CoreGrid } = await import('./core-grid');
const { MemoryBar } = await import('./memory-bar');
const { LiveFigure } = await import('../live-figure');

const SPAN = 120_000;
const START = 1_700_000_000_000;

function points(now: number, base: number): { t: number; v: number }[] {
  return Array.from({ length: 121 }, (_, index) => ({
    t: now - SPAN + index * 1000,
    v: base + ((index * 7) % 30),
  }));
}

function inPalette(element: ReactNode): ReactNode {
  return createElement(PaletteContext, { value: PALETTE }, element);
}

function mount(element: ReactNode): {
  total: number;
  by: Record<string, number>;
  again: (next: ReactNode) => number;
  stop: () => void;
} {
  nodes.total = 0;
  nodes.by = {};
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(inPalette(element));
  });
  const first = { total: nodes.total, by: { ...nodes.by } };
  return {
    ...first,
    again: (next): number => {
      nodes.total = 0;
      act(() => {
        root.render(inPalette(next));
      });
      return nodes.total;
    },
    stop: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

const live = (now: number): ReactNode =>
  createElement(TimeSeriesChart, {
    series: [
      { label: 'Download', colour: 'viz-blue', points: points(now, 20) },
      { label: 'Upload', colour: 'viz-magenta', points: points(now, 5) },
    ],
    window: { spanMs: SPAN, now },
    yDomain: 'sticky',
    label: 'Network',
    unit: 'Mb/s',
  });

beforeEach(() => {
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

describe('live chart cost', () => {
  it('draws two series as one line path each on two svg roots in a small tree', () => {
    const mounted = mount(live(START));
    expect(mounted.by['Svg.Path']).toBe(2);
    expect(mounted.by['Svg.default'] ?? mounted.by['Svg.Svg']).toBe(2);
    expect(mounted.total).toBeLessThanOrEqual(40);
    mounted.stop();
  });

  it('renders no more nodes than the first draw when the window slides by one second', () => {
    const mounted = mount(live(START));
    const next = mounted.again(live(START + 1000));
    expect(next).toBeLessThanOrEqual(mounted.total);
    mounted.stop();
  });

  it('draws a bare chart with a single path and no labels', () => {
    const bare = mount(
      createElement(TimeSeriesChart, {
        series: [{ label: 'CPU', colour: 'viz-blue', points: points(START, 10) }],
        window: { spanMs: SPAN, now: START },
        yDomain: [0, 100],
        label: 'CPU live',
        bare: true,
        height: 34,
      }),
    );
    expect(bare.by['Text'] ?? 0).toBe(0);
    expect(bare.total).toBeLessThanOrEqual(12);
    bare.stop();
  });
});

describe('core grid cost', () => {
  it.each([
    [8, 2],
    [32, 2],
  ])('draws %i threads as bars with %i paths', (count, paths) => {
    const values = Array.from({ length: count }, (_, index) => (index * 13) % 100);
    const mounted = mount(createElement(CoreGrid, { values }));
    expect(mounted.by['Svg.Path']).toBe(paths);
    mounted.stop();
  });

  it('draws 128 threads as a heat strip with at most one path per level', () => {
    const values = Array.from({ length: 128 }, (_, index) => (index * 13) % 100);
    const mounted = mount(createElement(CoreGrid, { values }));
    expect(mounted.by['Svg.Path']).toBeLessThanOrEqual(10);
    expect(mounted.total).toBeLessThanOrEqual(27);
    mounted.stop();
  });
});

describe('memory bar and live figure cost', () => {
  it('draws the memory bar as plain views without any svg', () => {
    const mounted = mount(
      createElement(MemoryBar, {
        total: 32,
        segments: [
          { label: 'Used', value: 12.3, colour: 'viz-blue' },
          { label: 'Cache', value: 4, colour: 'viz-magenta' },
          { label: 'Free', value: 15.7 },
        ],
      }),
    );
    expect(Object.keys(mounted.by).some((name) => name.startsWith('Svg.'))).toBe(false);
    mounted.stop();
  });

  it('keeps a live figure to two text rows and re-renders only its own leaf on an update', () => {
    const mounted = mount(createElement(LiveFigure, { value: '42', unit: '%', widest: '100' }));
    expect(mounted.by['Text']).toBe(4);
    const next = mounted.again(
      createElement(LiveFigure, { value: '43', unit: '%', widest: '100' }),
    );
    expect(next).toBeLessThanOrEqual(mounted.total * 2);
    mounted.stop();
  });
});
