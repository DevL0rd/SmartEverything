import type { BrushLiveFrame } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const frameBox = vi.hoisted((): { current: unknown } => ({ current: null }));

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { style?: unknown; children?: ReactNode }): ReactNode => {
    const styles = Array.isArray(props.style) ? props.style : [props.style];
    const looped = styles.some(
      (style) => typeof style === 'object' && style !== null && 'animationName' in style,
    );
    return createElement('i', { 'data-looped': looped ? 'yes' : 'no' }, props.children);
  };
  return {
    ...original,
    default: { View, createAnimatedComponent: (component: unknown): unknown => component },
    View,
    createAnimatedComponent: (component: unknown): unknown => component,
    cancelAnimation: (): undefined => undefined,
    useAnimatedProps: (): object => ({}),
    useSharedValue: (initial: unknown): object => ({
      get: () => initial,
      set: (): undefined => undefined,
    }),
    useReducedMotion: (): boolean => false,
    withSpring: (value: unknown): unknown => value,
  };
});

vi.mock('../../../design/motion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

vi.mock('../../../design/visibility', () => ({
  useOnScreenGate: (): { moving: boolean; reduced: boolean; onLayout: undefined } => ({
    moving: true,
    reduced: false,
    onLayout: undefined,
  }),
}));

vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => undefined } => ({
    width: 412,
    onLayout: (): undefined => undefined,
  }),
}));

vi.mock('../../../store/selectors', () => ({ useDevice: (): null => null }));

vi.mock('../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-10-18T07:30:00Z'),
}));

vi.mock('../../toothbrush/data/brush-data', () => ({
  useFrame: (): unknown => frameBox.current,
  useFrameSelect: (): unknown => null,
  useBrushView: (): { data: undefined } => ({ data: undefined }),
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { oralbFrameOf, oralbViewOf } = await import('../../toothbrush/model/fixtures');
const { OralbStage } = await import('./live-stage');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function stage(frame: BrushLiveFrame, view = oralbViewOf()): string {
  frameBox.current = frame;
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(OralbStage, { deviceId: view.deviceId, view }),
    ),
  );
}

function loops(markup: string): number {
  return markup.split('data-looped="yes"').length - 1;
}

const BRUSHING: Partial<BrushLiveFrame> = {
  activity: 'brushing',
  session: 'running',
  elapsedS: 74,
  routineS: 120,
  zone: 3,
  zoneSeconds: [30, 30, 14, 0],
  pressure: 'optimal',
  liveSource: 'link',
};

describe('the live stage', () => {
  it('draws the arch with the timer inside, the pressure word and the wave while brushing', () => {
    const markup = stage(oralbFrameOf({ ...BRUSHING, force: 1.2, angleDeg: 27 }));
    expect(markup).toContain('1:14');
    expect(markup).toContain('quarter 3 of 4');
    expect(markup).toContain('Live, connected');
    expect(markup).toContain('Good');
    expect(markup).toContain('27°');
    expect(markup).toContain('Pressure gauge: Good');
    expect(markup.split('quarter 3 of 4').length - 1).toBe(1);
  });

  it('runs exactly two loops while brushing: the glow and the wave', () => {
    expect(loops(stage(oralbFrameOf({ ...BRUSHING, force: 1.2, angleDeg: 27 })))).toBe(2);
  });

  it('runs no loop while paused except the glow and wave stay still', () => {
    const paused = stage(oralbFrameOf({ ...BRUSHING, activity: 'paused', session: 'paused' }));
    expect(loops(paused)).toBe(1);
  });

  it('draws the state meter for a broadcast with light dimmed', () => {
    const markup = stage(oralbFrameOf({ ...BRUSHING, liveSource: 'advert', force: null }));
    expect(markup).toContain('Live, from the broadcast');
    expect(markup).toContain('Light pressure needs a connection');
    expect(markup).not.toContain('Pressure gauge');
  });

  it('shows the nominal angle without force, and no number for modes without one', () => {
    const nominal = stage(oralbFrameOf({ ...BRUSHING, liveSource: 'advert', force: null }));
    expect(nominal).toContain('28°');
    expect(nominal).toContain('nominal');
    const whiten = stage(
      oralbFrameOf({ ...BRUSHING, mode: 'whiten', liveSource: 'advert', force: null }),
    );
    expect(whiten).not.toContain('°');
  });

  it('keeps the timer ring and one note for Tongue Clean', () => {
    const markup = stage(oralbFrameOf({ ...BRUSHING, mode: 'tongue_clean' }));
    expect(markup).toContain('Tongue Clean is timed as one block');
    expect(markup).not.toContain('Quarters are timed');
  });

  it('says why there are no quarters when the pacer is off', () => {
    const view = oralbViewOf();
    const off = { ...view, profile: { ...view.profile, sectors: 0, zones: 0 } } as const;
    const markup = stage(oralbFrameOf(BRUSHING), off.profile.brand === 'oralb' ? off : view);
    expect(markup).toContain('The pacer is off on this handle');
  });

  it('names the quarter that was missed', () => {
    const markup = stage(oralbFrameOf({ ...BRUSHING, zone: 4, zoneSeconds: [30, 12, 0, 5] }));
    expect(markup).toContain('Upper right: 0:12 of 0:30');
    expect(markup).toContain('Lower right: not reached');
  });
});
