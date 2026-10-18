import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COLOUR_VARIABLE, PaletteContext } from '../../design/colour-roles';
import { StageTimeline, type StageTimelineProps } from './stage-timeline';

function markup(props: StageTimelineProps): string {
  return renderToStaticMarkup(
    createElement(PaletteContext, { value: COLOUR_VARIABLE }, createElement(StageTimeline, props)),
  );
}

describe('StageTimeline', () => {
  it('renders nothing without segments', () => {
    expect(markup({ segments: [], label: 'Sleep' })).toBe('');
  });

  it('renders a zero-length span and NaN bounds without throwing', () => {
    expect(() =>
      markup({ segments: [{ start: 5, end: 5, stage: 'deep' }], label: 'Sleep' }),
    ).not.toThrow();
    expect(() =>
      markup({ segments: [{ start: Number.NaN, end: Number.NaN, stage: 'rem' }], label: 'Sleep' }),
    ).not.toThrow();
  });
});
