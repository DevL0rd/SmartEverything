import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

const { Arc } = await import('./arc');

const BASE = { value: 0.4, size: 52, thickness: 6, colour: 'humidity' } as const;

describe('Arc ticks', () => {
  it('draws a tick as one more stroke in the same svg at its own colour and thickness', () => {
    const html = renderToStaticMarkup(
      createElement(Arc, {
        ...BASE,
        ticks: [{ start: 177.5, sweep: 5, colour: 'on-surface', thickness: 10 }],
      }),
    );
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain('stroke="on-surface"');
    expect(html).toContain('stroke-width="10"');
  });

  it('draws no tick unless one is given', () => {
    expect(renderToStaticMarkup(createElement(Arc, BASE))).not.toContain('on-surface');
  });
});
