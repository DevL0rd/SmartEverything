import { describe, expect, it } from 'vitest';
import { percent } from '../format/number';
import { levelLook } from './level-pill-model';

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
