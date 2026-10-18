import { describe, expect, it } from 'vitest';
import { SCORE_BANDS, deltaChips, scoreWord } from './hero-model';

describe('deltaChips', () => {
  it('writes a chip for each known change with its sign', () => {
    expect(deltaChips(-0.4, 1.2)).toEqual(['−0.4 kg this week', '+1.2 kg this month']);
  });

  it('leaves out a period with no reading', () => {
    expect(deltaChips(null, 1.2)).toEqual(['+1.2 kg this month']);
    expect(deltaChips(-0.4, null)).toEqual(['−0.4 kg this week']);
    expect(deltaChips(null, null)).toEqual([]);
  });

  it('shows a change that rounds away as no change', () => {
    expect(deltaChips(0.01, -0.04)).toEqual(['±0 kg this week', '±0 kg this month']);
  });
});

describe('scoreWord', () => {
  it('names the band a score falls in, lower edge included', () => {
    expect(scoreWord(100)).toBe('Great');
    expect(scoreWord(80)).toBe('Great');
    expect(scoreWord(79)).toBe('Good');
    expect(scoreWord(60)).toBe('Good');
    expect(scoreWord(59)).toBe('Needs attention');
    expect(scoreWord(0)).toBe('Needs attention');
  });

  it('draws the gauge in warning below 60 and positive up to 100', () => {
    expect(SCORE_BANDS).toEqual([
      { upTo: 60, colour: 'warning' },
      { upTo: 100, colour: 'positive' },
    ]);
  });
});
