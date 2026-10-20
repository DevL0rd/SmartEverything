import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../design/motion', () => ({
  SPRING: { damping: 22, stiffness: 240, mass: 1 },
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { QuadrantArch, QuarterNotes } = await import('./quadrant-arch');
const { ForceGauge } = await import('./force-gauge');
const { StateMeter } = await import('./state-meter');
const { DriveWave } = await import('./drive-wave');
const { PressureTrace } = await import('./pressure-trace');
const { quartersOf } = await import('../model/arch-model');
const { bandsOf } = await import('../model/gauge-model');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: PALETTE }, node));
}

function loops(markup: string): number {
  return markup.split('data-looped="yes"').length - 1;
}

function shapes(markup: string): number {
  return markup.split('<path').length - 1;
}

const TARGETS = [30, 30, 30, 30];

function arch(
  patch: Partial<Parameters<typeof quartersOf>[0]>,
  moving: boolean,
  width = 300,
): string {
  const quarters = quartersOf({
    zoneSeconds: [0, 0, 0, 0],
    targets: TARGETS,
    current: null,
    finished: false,
    pacerOn: true,
    ...patch,
  });
  return html(
    createElement(QuadrantArch, {
      quarters,
      big: '1:14',
      small: 'of 2:00 · quarter 3 of 4',
      width,
      moving,
      label: 'Quarter timer',
    }),
  );
}

describe('the quarter arch', () => {
  it('has no loop at rest, finished or with the pacer off', () => {
    expect(loops(arch({}, true))).toBe(0);
    expect(loops(arch({ finished: true, zoneSeconds: [30, 18, 0, 0] }, true))).toBe(0);
    expect(loops(arch({ pacerOn: false }, true))).toBe(0);
  });

  it('runs one soft glow while a quarter is current, on screen', () => {
    const live = { zoneSeconds: [30, 30, 10, 0], current: 3 };
    expect(loops(arch(live, true))).toBe(1);
    expect(loops(arch(live, false))).toBe(0);
  });

  it('draws a bounded number of shapes at rest and live', () => {
    const rest = shapes(arch({}, false));
    const live = shapes(arch({ zoneSeconds: [30, 30, 10, 0], current: 3 }, true));
    expect(rest).toBeLessThanOrEqual(64);
    expect(live).toBeLessThanOrEqual(140);
    expect(live).toBeGreaterThan(rest);
  });

  it('writes the timer once in the centre and lists partial and missed quarters', () => {
    const markup = arch({ zoneSeconds: [30, 18, 0, 0], finished: true }, false);
    expect(markup.split('1:14').length - 1).toBe(1);
    const quarters = quartersOf({
      zoneSeconds: [30, 18, 0, 0],
      targets: TARGETS,
      current: null,
      finished: true,
      pacerOn: true,
    });
    const notes = html(createElement(QuarterNotes, { quarters }));
    expect(notes).toContain('Upper right: 0:18 of 0:30');
    expect(notes).toContain('Lower right: not reached');
    expect(
      html(
        createElement(QuarterNotes, {
          quarters: quartersOf({
            zoneSeconds: [30, 30, 30, 30],
            targets: TARGETS,
            current: null,
            finished: true,
            pacerOn: true,
          }),
        }),
      ),
    ).toBe('');
  });

  it('marks a never reached quarter with a pattern as well as a colour', () => {
    expect(arch({ finished: true, zoneSeconds: [30, 0, 0, 0] }, false)).toContain('<pattern');
  });
});

describe('the pressure gauge', () => {
  const props = {
    width: 190,
    layout: bandsOf({ lightBelow: 0.7, highAbove: 2.1, samples: 8 }),
    share: 0.4,
    band: 'good',
    label: 'Pressure gauge: Good',
  } as const;

  it('never runs a loop, its needle is a spring', () => {
    expect(loops(html(createElement(ForceGauge, props)))).toBe(0);
  });

  it('draws three solid bands when learned and dashed ones while learning', () => {
    const learned = html(createElement(ForceGauge, props));
    const learning = html(createElement(ForceGauge, { ...props, layout: bandsOf(null) }));
    expect(learned).not.toContain('stroke-dasharray="5 4"');
    expect(learning).toContain('stroke-dasharray="5 4"');
    expect(learning).toContain('learning your brushing');
    expect(learned).not.toContain('learning your brushing');
  });

  it('puts the band names outside the arc and shows no numbers or units', () => {
    const markup = html(createElement(ForceGauge, props));
    for (const word of ['Light', 'Good', 'Too hard']) {
      expect(markup).toContain(word);
    }
    expect(markup).not.toMatch(/newton|\bN\b|gram/i);
    expect(shapes(markup)).toBeLessThanOrEqual(6);
  });
});

describe('the state meter', () => {
  it('is one bar with three zones, not three buttons', () => {
    const markup = html(
      createElement(StateMeter, { kind: 'state', band: 'good', label: 'Pressure: Good' }),
    );
    expect(markup).not.toContain('role="radio"');
    expect(markup).not.toContain('role="button"');
    for (const word of ['Light', 'Good', 'Too hard']) {
      expect(markup).toContain(word);
    }
    expect(loops(markup)).toBe(0);
  });

  it('says light pressure needs a connection when only the broadcast is heard', () => {
    const advert = html(
      createElement(StateMeter, { kind: 'advert', band: 'good', label: 'Pressure: Good' }),
    );
    expect(advert).toContain('Light pressure needs a connection');
    const state = html(
      createElement(StateMeter, { kind: 'state', band: 'light', label: 'Pressure: Light' }),
    );
    expect(state).not.toContain('needs a connection');
  });
});

describe('the drive wave', () => {
  const props = {
    width: 320,
    mode: 'daily_clean',
    share: 0.8,
    tooHard: false,
    angle: { degrees: 28, source: 'nominal' },
    label: 'Daily Clean drive',
  } as const;

  it('scrolls only while moving', () => {
    expect(loops(html(createElement(DriveWave, { ...props, moving: true })))).toBe(1);
    expect(loops(html(createElement(DriveWave, { ...props, moving: false })))).toBe(0);
  });

  it('reads the angle with its source', () => {
    const markup = html(createElement(DriveWave, { ...props, moving: false }));
    expect(markup).toContain('28°');
    expect(markup).toContain('nominal');
    const none = html(
      createElement(DriveWave, {
        ...props,
        moving: false,
        angle: { degrees: null, source: 'none' },
      }),
    );
    expect(none).not.toContain('°');
  });
});

describe('the 60 second trace', () => {
  it('draws one backdrop per band and one line, with the labels outside the plot', () => {
    const markup = html(
      createElement(PressureTrace, {
        width: 320,
        layout: bandsOf(null),
        path: 'M0 10 L100 20',
        label: 'Pressure over the last 60 seconds',
      }),
    );
    expect(shapes(markup)).toBe(4);
    expect(markup).toContain('-60 s');
    expect(markup).toContain('now');
    expect(loops(markup)).toBe(0);
  });
});
