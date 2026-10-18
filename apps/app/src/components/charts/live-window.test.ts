import { describe, expect, it } from 'vitest';
import {
  EMPTY_STICKY,
  STICKY_SHRINK_MS,
  domainOf,
  liveSummary,
  liveTicks,
  nextSticky,
  niceMax,
  peakOf,
  slideStep,
  spanLabel,
  stacked,
} from './live-window';

describe('niceMax', () => {
  it.each([
    [0, 1],
    [0.8, 1],
    [1.4, 2],
    [3.9, 5],
    [7, 10],
    [64, 100],
    [230, 500],
  ])('rounds %f up to %f', (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });
});

describe('the sticky axis', () => {
  it('grows at once when the peak rises', () => {
    const grown = nextSticky({ max: 10, lowSince: null }, 40, 1000);
    expect(grown).toEqual({ max: 50, lowSince: null });
  });

  it('holds its maximum while the peak sits above sixty percent of it', () => {
    const state = { max: 100, lowSince: null };
    expect(nextSticky(state, 70, 1000)).toBe(state);
  });

  it('starts counting when the peak falls below sixty percent and shrinks only after thirty seconds', () => {
    const low = nextSticky({ max: 100, lowSince: null }, 20, 1000);
    expect(low).toEqual({ max: 100, lowSince: 1000 });
    expect(nextSticky(low, 20, 1000 + STICKY_SHRINK_MS)).toBe(low);
    expect(nextSticky(low, 20, 1001 + STICKY_SHRINK_MS)).toEqual({ max: 50, lowSince: null });
  });

  it('forgets the low spell when the peak comes back', () => {
    expect(nextSticky({ max: 100, lowSince: 500 }, 80, 900)).toEqual({ max: 100, lowSince: null });
  });

  it('opens on a nice maximum from the first reading', () => {
    expect(nextSticky(EMPTY_STICKY, 3, 0)).toEqual({ max: 5, lowSince: null });
  });
});

describe('domainOf', () => {
  it('uses a fixed domain as written', () => {
    expect(domainOf([0, 100], EMPTY_STICKY, 40)).toEqual({ min: 0, max: 100 });
  });

  it('uses the sticky maximum, or a nice one before it exists', () => {
    expect(domainOf('sticky', { max: 50, lowSince: null }, 10)).toEqual({ min: 0, max: 50 });
    expect(domainOf('sticky', EMPTY_STICKY, 10)).toEqual({ min: 0, max: 20 });
  });
});

describe('the time axis', () => {
  it('names the start, middle and end of the window', () => {
    expect(liveTicks({ spanMs: 120_000, now: 1_000_000 }).map((tick) => tick.label)).toEqual([
      '−2 min',
      '−1 min',
      'now',
    ]);
    expect(spanLabel(60_000)).toBe('1 min');
    expect(spanLabel(30_000)).toBe('30 s');
    expect(spanLabel(7_200_000)).toBe('2 h');
  });

  it('slides one second of plot width per step', () => {
    expect(slideStep(240, 120_000)).toBe(2);
  });
});

describe('stacked', () => {
  it('adds each layer onto the ones below at the same moment', () => {
    const layers = stacked([
      {
        label: 'CPU',
        points: [
          { t: 1, v: 10 },
          { t: 2, v: 20 },
        ],
      },
      {
        label: 'GPU',
        points: [
          { t: 1, v: 5 },
          { t: 2, v: 1 },
        ],
      },
    ]);
    expect(layers[1]).toEqual([
      { t: 1, v: 15 },
      { t: 2, v: 21 },
    ]);
  });
});

describe('peakOf and liveSummary', () => {
  const points = [
    { t: 1, v: 4 },
    { t: 2, v: 9 },
    { t: 3, v: 2 },
  ];

  it('finds the highest value inside the window only', () => {
    expect(peakOf([points], { min: 1, max: 3 })).toBe(9);
    expect(peakOf([points], { min: 3, max: 4 })).toBe(2);
    expect(peakOf([], { min: 0, max: 1 })).toBe(0);
  });

  it('reports the peak point and the average', () => {
    expect(liveSummary(points)).toEqual({ peak: { t: 2, v: 9 }, average: 5 });
    expect(liveSummary([])).toBeNull();
  });
});
