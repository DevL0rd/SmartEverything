import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

const { Gauge } = await import('./gauge');

const SHORT_BANDS = [
  { upTo: 40, colour: 'positive' },
  { upTo: 80, colour: 'warning' },
] as const;

describe('Gauge', () => {
  it('draws a value beyond the last band in the last band colour instead of throwing', () => {
    const html = renderToStaticMarkup(
      createElement(Gauge, {
        value: 95,
        min: 0,
        max: 100,
        size: 120,
        label: 'Load',
        bands: SHORT_BANDS,
      }),
    );
    expect(html).toContain('aria-label="Load"');
    expect(html).toContain('warning');
  });

  it('renders no band strokes when no bands are configured', () => {
    const html = renderToStaticMarkup(
      createElement(Gauge, { value: 10, min: 0, max: 100, size: 120, label: 'Empty', bands: [] }),
    );
    expect(html).toContain('aria-label="Empty"');
    expect(html).not.toContain('<path');
  });
});
