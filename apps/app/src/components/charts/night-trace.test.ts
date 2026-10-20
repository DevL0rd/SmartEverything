import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MINUTE_MS } from '../../format/time';
import type { TracePoint } from './night-trace-model';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 348,
    onLayout: (): void => undefined,
  }),
}));

const { NightTrace } = await import('./night-trace');

const BED = new Date(2026, 9, 18, 23, 0).getTime();

function point(minutes: number, value: number): TracePoint {
  return { at: BED + minutes * MINUTE_MS, value };
}

const OXYGEN = [point(0, 96), point(10, 95), point(20, 88), point(30, 96)];

function html(props: Parameters<typeof NightTrace>[0]): string {
  return renderToStaticMarkup(createElement(NightTrace, props));
}

describe('NightTrace', () => {
  it('draws a neutral line, a dashed guide, a ring under the limit and the lowest dot', () => {
    const markup = html({
      points: OXYGEN,
      label: 'Blood oxygen',
      unit: '%',
      domain: [85, 100],
      guide: 90,
      lowMark: true,
      ringBelow: 90,
      dots: true,
      from: BED,
      to: BED + 30 * MINUTE_MS,
    });
    expect(markup).toContain('stroke-dasharray="4 4"');
    expect(markup.match(/r="7"/g)).toHaveLength(1);
    expect(markup.match(/r="2.4"/g)).toHaveLength(4);
    expect(markup).not.toContain('Lowest');
    expect(markup).not.toContain('sleep-');
    expect(markup).not.toContain('heart');
  });

  it('shows the shared time reading with the value at that time', () => {
    const markup = html({
      points: OXYGEN,
      label: 'Blood oxygen',
      unit: '%',
      at: BED + 21 * MINUTE_MS,
      from: BED,
      to: BED + 30 * MINUTE_MS,
    });
    expect(markup).toContain('Blood oxygen');
    expect(markup.replace(/\s/g, ' ')).toContain('88%');
  });

  it('draws nothing without points in the window', () => {
    expect(html({ points: [], label: 'Heart rate' })).toBe('');
  });
});
