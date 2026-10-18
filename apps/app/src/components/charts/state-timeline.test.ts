import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COLOUR_VARIABLE, PaletteContext } from '../../design/colour-roles';
import { StateTimeline } from './state-timeline';

const COLOURS = { home: 'positive', away: 'surface-3' } as const;

function markup(props: Partial<Parameters<typeof StateTimeline<'home' | 'away'>>[0]>): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(StateTimeline<'home' | 'away'>, {
        segments: [],
        colours: COLOURS,
        label: 'Home or away',
        ...props,
      }),
    ),
  );
}

describe('StateTimeline', () => {
  it('renders nothing without segments and no empty text', () => {
    expect(markup({})).toBe('');
  });

  it('shows the empty text instead of an empty track', () => {
    const shown = markup({ empty: 'No data yet' });
    expect(shown).toContain('No data yet');
    expect(shown).not.toContain('Home or away');
  });

  it('labels the track for screen readers and prints the captions', () => {
    const shown = markup({
      segments: [{ start: 0, end: 10, state: 'home' }],
      captions: ['00:00', '24:00'],
    });
    expect(shown).toContain('aria-label="Home or away"');
    expect(shown).toContain('24:00');
  });
});
