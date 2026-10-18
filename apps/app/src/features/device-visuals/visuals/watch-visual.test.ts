import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualProps, VisualState } from '../types';

const layers = vi.hoisted(() => new Array<{ readonly motion: unknown }>());

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../parts/frame', () => ({
  FULL: { x: 0, y: 0, w: 100, h: 100 },
  useSvgId: (prefix: string): string => prefix,
  Canvas: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  Layer: ({
    motion,
    children,
  }: {
    readonly motion?: unknown;
    readonly children: ReactNode;
  }): ReactNode => {
    layers.push({ motion });
    return children;
  },
}));

vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown): unknown => component },
  useSharedValue: (value: number): unknown => ({
    get: (): number => value,
    set: (): void => undefined,
  }),
  useAnimatedProps: (): Record<string, never> => ({}),
  withTiming: (value: number): number => value,
  css: { keyframes: (rule: unknown): unknown => rule },
}));

vi.mock('../../../design/motion', () => ({ EASING: { decelerate: 'decelerate' } }));

vi.mock('../parts/material', () => ({ Shine: (): null => null }));

const { WatchVisual } = await import('./watch-visual');

const READING = { text: '8,214', unit: 'steps', at: '2026-10-16T10:00:00Z' };

const STATE: VisualState = {
  power: 'on',
  online: true,
  level: 1,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: 0.4,
  battery: 80,
  pulse: null,
  syncing: true,
  load: null,
  reading: READING,
  source: null,
  presence: null,
  open: null,
};

function props(overrides: Partial<VisualProps>): VisualProps {
  return {
    state: STATE,
    size: 'hero',
    px: 100,
    tone: 'active',
    moving: true,
    reduced: false,
    ...overrides,
  };
}

describe('WatchVisual', () => {
  beforeEach(() => {
    layers.length = 0;
  });

  it('spins the sync mark while moving', () => {
    renderToStaticMarkup(createElement(WatchVisual, props({ moving: true })));
    const sweep = layers.at(-1)?.motion;
    expect(sweep).toMatchObject({ animationIterationCount: 'infinite' });
  });

  it('leaves the sync mark still when motion is paused', () => {
    renderToStaticMarkup(createElement(WatchVisual, props({ moving: false })));
    expect(layers.at(-1)?.motion).toBeNull();
  });

  it('writes the reading unit instead of a fixed word', () => {
    const html = renderToStaticMarkup(
      createElement(
        WatchVisual,
        props({ state: { ...STATE, reading: { ...READING, text: '72.4', unit: 'kg' } } }),
      ),
    );
    expect(html).toContain('kg');
    expect(html).not.toContain('steps');
  });

  it('beats at the pace of a fresh reading while moving', () => {
    renderToStaticMarkup(
      createElement(WatchVisual, props({ state: { ...STATE, syncing: false, pulse: 72 } })),
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]?.motion).toMatchObject({
      animationDuration: Math.round(30_000 / 72),
      animationIterationCount: 'infinite',
    });
  });

  it('keeps the heart still when motion is paused', () => {
    renderToStaticMarkup(
      createElement(
        WatchVisual,
        props({ moving: false, state: { ...STATE, syncing: false, pulse: 72 } }),
      ),
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]?.motion).toBeNull();
  });

  it('draws no heart without a reading', () => {
    renderToStaticMarkup(
      createElement(WatchVisual, props({ state: { ...STATE, syncing: false, pulse: null } })),
    );
    expect(layers).toHaveLength(0);
  });

  it('draws no heart on the tile', () => {
    renderToStaticMarkup(
      createElement(
        WatchVisual,
        props({ size: 'tile', state: { ...STATE, syncing: false, pulse: 72 } }),
      ),
    );
    expect(layers).toHaveLength(0);
  });
});
