import { describe, expect, it } from 'vitest';
import { columnCount, controlColumnMin } from './control-columns';

const GAP = 12;
const LABEL_SHARE = 0.4;
const LABEL_NEEDED = 128;

function columnWidth(width: number, inline: boolean): number {
  const columns = columnCount(width, controlColumnMin(inline), GAP);
  return (width - (columns - 1) * GAP) / columns;
}

describe('control columns on a device card', () => {
  it.each([294, 460, 700, 1000, 1408])(
    'leaves an inline label room for "Target humidity" at %i px',
    (width) => {
      if (width >= controlColumnMin(true)) {
        expect(columnWidth(width, true) * LABEL_SHARE).toBeGreaterThanOrEqual(LABEL_NEEDED);
      }
    },
  );

  it('uses one column on a phone card and several on a wide card', () => {
    expect(columnCount(294, controlColumnMin(true), GAP)).toBe(1);
    expect(columnCount(1408, controlColumnMin(true), GAP)).toBe(4);
    expect(columnCount(1408, controlColumnMin(false), GAP)).toBe(5);
  });
});
