import { describe, expect, it } from 'vitest';
import { SLIDER_MIN_TRACK, sliderLabelMode } from './slider-layout';

describe('slider label mode', () => {
  it('keeps the label inline while the track keeps its 96 px minimum', () => {
    expect(sliderLabelMode(400, 0.4, 12)).toBe('inline');
  });

  it('moves the label above the slider rather than shrinking the track below 96 px', () => {
    expect(sliderLabelMode(200, 0.4, 12)).toBe('caption');
  });

  it('switches exactly where the track would drop under the minimum', () => {
    const edge = (SLIDER_MIN_TRACK + 12 + 24) / 0.6;
    expect(sliderLabelMode(edge, 0.4, 12)).toBe('inline');
    expect(sliderLabelMode(edge - 1, 0.4, 12)).toBe('caption');
  });
});
