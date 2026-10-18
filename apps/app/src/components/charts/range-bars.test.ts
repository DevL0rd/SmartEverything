import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 232,
    onLayout: (): void => undefined,
  }),
}));

const { RangeBars } = await import('./range-bars');

function pathsIn(html: string): number {
  return html.match(/<path/g)?.length ?? 0;
}

describe('RangeBars', () => {
  it('draws a capsule for each filled bucket and leaves a null bucket as a gap', () => {
    const html = renderToStaticMarkup(
      createElement(RangeBars, {
        label: 'Heart rate',
        colour: 'heart',
        buckets: [
          { key: 'a', min: 55, max: 120 },
          { key: 'b', min: null, max: null },
          { key: 'c', min: 60, max: 98 },
        ],
      }),
    );
    expect(pathsIn(html)).toBe(2);
  });

  it('keeps the axis labels of an empty range and draws nothing', () => {
    const html = renderToStaticMarkup(
      createElement(RangeBars, {
        label: 'Heart rate',
        colour: 'heart',
        buckets: [
          { key: 'a', min: null, max: null },
          { key: 'b', min: null, max: null },
        ],
      }),
    );
    expect(pathsIn(html)).toBe(0);
    expect(html).toContain('aria-label="Heart rate"');
  });

  it('shows the tick labels of the buckets under the plot', () => {
    const html = renderToStaticMarkup(
      createElement(RangeBars, {
        label: 'Heart rate',
        colour: 'heart',
        buckets: [
          { key: 'a', label: 'M', min: 55, max: 120 },
          { key: 'b', label: 'T', min: null, max: null },
        ],
      }),
    );
    expect(html).toContain('>M<');
    expect(html).toContain('>T<');
  });
});
