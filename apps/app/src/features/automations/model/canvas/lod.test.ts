import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LOD_THRESHOLDS,
  MIN_TEXT_PX,
  levelForZoom,
  lodParts,
  renderedPx,
  titleFontSize,
} from './lod';

describe('levels of detail', () => {
  it('switches at the documented thresholds', () => {
    expect(levelForZoom(1)).toBe('full');
    expect(levelForZoom(LOD_THRESHOLDS.full)).toBe('full');
    expect(levelForZoom(0.84)).toBe('small');
    expect(levelForZoom(LOD_THRESHOLDS.small)).toBe('small');
    expect(levelForZoom(0.68)).toBe('mid');
    expect(levelForZoom(LOD_THRESHOLDS.mid)).toBe('mid');
    expect(levelForZoom(0.33)).toBe('far');
  });

  it('hides subtitles, overlines and exit rows below the full level only', () => {
    expect(lodParts('full').subtitle).toBe(true);
    expect(lodParts('small').subtitle).toBe(false);
    expect(lodParts('small').portLabels).toBe(true);
    expect(lodParts('mid').ports).toBe(false);
    expect(lodParts('far').laneTitles).toBe(false);
    expect(lodParts('far').largeTitleOnly).toBe(true);
  });

  it('never renders a shown title below the text floor', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 2, noNaN: true }), (zoom) => {
        const size = titleFontSize(zoom, 16);
        expect(renderedPx(size, zoom)).toBeGreaterThanOrEqual(MIN_TEXT_PX - 1e-9);
      }),
    );
  });

  it('is monotonic: a higher zoom never shows less', () => {
    const order = ['far', 'mid', 'small', 'full'];
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        (a, b) => {
          const low = Math.min(a, b);
          const high = Math.max(a, b);
          expect(order.indexOf(levelForZoom(high))).toBeGreaterThanOrEqual(
            order.indexOf(levelForZoom(low)),
          );
        },
      ),
    );
  });
});
