import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MINUTE_MS } from '../../format/time';
import type { HypnogramSegment, HypnogramStage } from './hypnogram-model';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 348,
    onLayout: (): void => undefined,
  }),
}));

const { Hypnogram } = await import('./hypnogram');

const BED = new Date(2026, 9, 18, 23, 0).getTime();

function span(from: number, to: number, stage: HypnogramStage): HypnogramSegment {
  return { start: BED + from * MINUTE_MS, end: BED + to * MINUTE_MS, stage };
}

function html(props: Parameters<typeof Hypnogram>[0]): string {
  return renderToStaticMarkup(createElement(Hypnogram, props));
}

describe('Hypnogram', () => {
  it('draws one block per span, with the stage colours and lane labels', () => {
    const markup = html({
      segments: [span(0, 60, 'light'), span(60, 120, 'deep'), span(120, 130, 'awake')],
      label: 'Sleep stages',
    });
    expect(markup).toContain('sleep-core');
    expect(markup).toContain('sleep-deep');
    expect(markup).toContain('sleep-awake');
    for (const lane of ['Awake', 'REM', 'Light', 'Deep']) {
      expect(markup).toContain(lane);
    }
    expect(markup).not.toContain('sleep-asleep');
  });

  it('draws the neutral asleep band for a night without stages and never a stage colour', () => {
    const markup = html({ segments: [span(0, 480, 'asleep')], label: 'Sleep stages' });
    expect(markup).toContain('sleep-asleep');
    expect(markup).toContain('sleep-on-asleep');
    expect(markup).toContain('Asleep');
    expect(markup).not.toContain('sleep-core');
    expect(markup).not.toContain('REM');
  });

  it('draws only lane guides and no gutter labels in the compact face', () => {
    const markup = html({
      segments: [span(0, 60, 'light'), span(60, 120, 'deep')],
      label: 'Sleep stages',
      compact: true,
    });
    expect(markup).not.toContain('>REM<');
    expect(markup).not.toContain('>Deep<');
  });

  it('draws a stepped ghost line without segments', () => {
    const markup = html({
      segments: [],
      label: 'Sleep stages',
      from: BED,
      to: BED + 480 * MINUTE_MS,
    });
    expect(markup).toContain('stroke-opacity="0.12"');
    expect(markup).toContain('no sleep recorded');
    expect(markup).not.toContain('sleep-core');
  });

  it('reads the span under a controlled position', () => {
    const markup = html({
      segments: [span(0, 60, 'light'), span(60, 120, 'deep')],
      label: 'Sleep stages',
      at: BED + 90 * MINUTE_MS,
    });
    expect(markup).toContain('1h 00m');
  });
});
