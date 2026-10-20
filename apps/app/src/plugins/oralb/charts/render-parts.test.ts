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
    withTiming: (value: unknown): unknown => value,
  };
});

vi.mock('../../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../design/colour-roles');
const { HeadGlyph, HeadRing } = await import('./head-ring');
const { DaysLine } = await import('./days-line');
const { PacerBar } = await import('./pacer-bar');
const { FaceStrip } = await import('./face-strip');
const { ShareBar } = await import('./share-bar');
const { ResultFace } = await import('./result-face');
const { SectionStrip } = await import('../components/section-strip');
const { countdownOf, pacerBarOf } = await import('../model/care-model');
const { faceOf } = await import('../model/face-model');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: PALETTE }, node));
}

const HEAD = {
  state: 'fitted',
  type: null,
  usageS: null,
  limitS: null,
  wearPercent: null,
  sessionsLeft: 11,
  replaceBy: null,
  madeOn: null,
  daysLeft: 23,
  secondsLeft: 1300,
  reminder: 'on',
  baselineDays: 90,
} as const;

describe('the head ring', () => {
  it('shows days big, sessions small and the ring label', () => {
    const markup = html(
      createElement(HeadRing, { countdown: countdownOf(HEAD, { warnDays: 14, dueDays: 0 }) }),
    );
    expect(markup).toContain('23 days');
    expect(markup).toContain('about 11 sessions left');
    expect(markup).toContain('Brush head: 23 days left');
    expect(markup).not.toContain('data-looped="yes"');
  });

  it('says it is not read when there is no countdown', () => {
    const markup = html(createElement(HeadRing, { countdown: null }));
    expect(markup).toContain('Not read');
    expect(markup).toContain('Brush head countdown not read yet');
  });

  it('draws the head glyph in each tone without a loop', () => {
    for (const tone of ['positive', 'warning', 'critical'] as const) {
      expect(html(createElement(HeadGlyph, { tone, size: 40 }))).toContain('<svg');
    }
  });
});

describe('the care and stats charts', () => {
  it('draws nothing for a days line without a series', () => {
    expect(html(createElement(DaysLine, { series: null }))).toBe('');
  });

  it('draws the pacer as one segment per quarter, or an idle bar when off', () => {
    const on = html(createElement(PacerBar, { bar: pacerBarOf([30, 30, 30, 30, 0, 0, 0, 0]) }));
    expect(on).toContain('2:00 target');
    expect(on).toContain('0:30 · 0:30 · 0:30 · 0:30');
    const off = html(createElement(PacerBar, { bar: pacerBarOf(null) }));
    expect(off).toContain('Pacer off');
    expect(off).toContain('No quarter timing');
  });

  it('draws the pressure shares with a striped too hard share', () => {
    const markup = html(
      createElement(ShareBar, {
        shares: [
          { key: 'light', label: 'Light', share: 0.3 },
          { key: 'good', label: 'Good', share: 0.6 },
          { key: 'hard', label: 'Too hard', share: 0.1 },
        ],
      }),
    );
    expect(markup).toContain(
      'Pressure shares: Light 30 percent, Good 60 percent, Too hard 10 percent',
    );
    expect(markup).toContain('Striped: Too hard');
  });

  it('labels the face strip', () => {
    const markup = html(
      createElement(FaceStrip, {
        bars: [
          { key: 'a', level: 5, special: true },
          { key: 'b', level: null, special: false },
        ],
      }),
    );
    expect(markup).toContain('last 2 brushes, 1 with a face');
  });

  it('draws a result face only when the handle showed one', () => {
    expect(html(createElement(ResultFace, { face: faceOf(7), size: 40 }))).toContain(
      'Smiling face, 2 stars',
    );
    expect(html(createElement(ResultFace, { face: faceOf(0), size: 40 }))).toBe('');
    expect(html(createElement(ResultFace, { face: null, size: 40 }))).toBe('');
  });

  it('draws one segment per section with the current one named once', () => {
    const markup = html(
      createElement(SectionStrip, { count: 6, current: 3, caption: 'Section 3 of 6' }),
    );
    expect(markup.split('Section 3 of 6').length - 1).toBe(2);
  });
});
