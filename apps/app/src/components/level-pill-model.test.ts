import { describe, expect, it } from 'vitest';
import { percent } from '../format/number';
import {
  LEVEL_SEGMENTS,
  SEGMENT_GAP,
  SEGMENT_WIDTH,
  levelLook,
  segmentsPath,
} from './level-pill-model';

describe('level pill look', () => {
  it('lights one segment per quarter, rounding up', () => {
    expect([0, 1, 25, 26, 55, 100].map((reading) => levelLook(reading).lit)).toEqual([
      0, 1, 1, 2, 3, 4,
    ]);
  });

  it('turns warning with a word at or below 20 percent', () => {
    expect(levelLook(20)).toEqual({ lit: 1, tone: 'warning', word: `Low · ${percent(0.2)}` });
    expect(levelLook(21).tone).toBe('positive');
  });

  it('clamps out-of-range readings', () => {
    expect(levelLook(140)).toEqual({ lit: 4, tone: 'positive', word: percent(1) });
    expect(levelLook(-5).lit).toBe(0);
  });
});

describe('level pill segments path', () => {
  const closed = (path: string): number => path.split('Z').length - 1;

  it('draws one closed rounded shape per segment in the range', () => {
    expect(closed(segmentsPath(0, LEVEL_SEGMENTS))).toBe(LEVEL_SEGMENTS);
    expect(closed(segmentsPath(1, 3))).toBe(2);
  });

  it('draws nothing for an empty range', () => {
    expect(segmentsPath(2, 2)).toBe('');
    expect(segmentsPath(3, 1)).toBe('');
  });

  it('starts each segment one segment width and gap after the previous one', () => {
    const step = SEGMENT_WIDTH + SEGMENT_GAP;
    expect(segmentsPath(1, 2).startsWith(`M${String(step + 4)} 0`)).toBe(true);
  });
});
