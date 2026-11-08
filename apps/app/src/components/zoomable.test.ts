import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_TAP, clampZoom, tapZoomOf } from './zoomable';

describe('zoomable', () => {
  it('keeps a pinch between the fitted size and the deepest zoom', () => {
    expect(clampZoom(0.4)).toBe(1);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(40)).toBe(ZOOM_MAX);
  });

  it('zooms in on a double tap when fitted and back to fitted when zoomed', () => {
    expect(tapZoomOf(1)).toBe(ZOOM_TAP);
    expect(tapZoomOf(1.2)).toBe(1);
    expect(tapZoomOf(ZOOM_MAX)).toBe(1);
  });
});
