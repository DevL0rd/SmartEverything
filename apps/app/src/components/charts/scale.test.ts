import { describe, expect, it } from 'vitest';
import {
  areaPath,
  extentOf,
  extremaOf,
  hitsAt,
  linePath,
  niceTicks,
  plotModel,
  segmentsOf,
  startOf,
  type ChartPoint,
  type ChartRange,
} from './scale';
import { fitTicks, fitWindow, rangeTicks } from './time-ticks';

const BOX = { width: 360, height: 200, left: 40, right: 352, top: 18, bottom: 162 };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOON = new Date(2026, 9, 16, 12, 0).getTime();

function sampled(count: number, end: number, span: number): ChartPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    t: end - span + (span * index) / (count - 1),
    v: 20 + Math.sin(index / 5) * 3,
  }));
}

describe('niceTicks', () => {
  it.each([
    [0, 7, [0, 5, 10]],
    [0, 9, [0, 5, 10]],
    [20.1, 23.4, [20, 22, 24]],
    [18, 26, [10, 20, 30]],
    [-4, 12, [-20, 0, 20]],
    [0.01, 0.04, [0, 0.02, 0.04]],
    [55, 142, [50, 100, 150]],
    [1000, 98000, [0, 50000, 100000]],
    [0, 1, [0, 0.5, 1]],
    [36.2, 37.1, [36, 37, 38]],
    [0, 5, [0, 2.5, 5]],
    [10, 10.5, [10, 10.25, 10.5]],
    [649.97, 686.02, [600, 650, 700]],
    [385, 423, [375, 400, 425]],
    [31.67, 34.56, [30, 32.5, 35]],
  ])('covers %s to %s with round steps %j', (min, max, expected) => {
    expect(niceTicks({ min, max })).toEqual(expected);
  });

  it('always returns exactly three ticks', () => {
    for (let min = 0; min < 1000; min += 7.3) {
      for (const span of [0.3, 1, 4.7, 36, 210]) {
        expect(niceTicks({ min, max: min + span })).toHaveLength(3);
      }
    }
  });

  it('pads a flat extent so the axis has a span', () => {
    expect(niceTicks({ min: 3, max: 3 })).toEqual([2.5, 3, 3.5]);
    expect(niceTicks({ min: 0, max: 0 })).toEqual([-1, 0, 1]);
  });
});

describe('extentOf', () => {
  it('is null without values', () => {
    expect(extentOf([])).toBeNull();
  });

  it('reads half a million samples without spreading them', () => {
    const values = Array.from({ length: 500_000 }, (_, index) => (index * 7919) % 100_003);
    expect(extentOf(values)).toEqual({ min: 0, max: 100_002 });
  });
});

describe('time ticks', () => {
  it('marks every sixth local hour on rolling and calendar days', () => {
    for (const range of ['24h', 'day'] as const) {
      const ticks = rangeTicks({ min: NOON - DAY, max: NOON }, range);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.every((tick) => new Date(tick.at).getHours() % 6 === 0)).toBe(true);
    }
  });

  it('marks every local midnight across a week', () => {
    const ticks = rangeTicks({ min: NOON - 7 * DAY, max: NOON }, 'week');
    expect(ticks).toHaveLength(7);
    expect(ticks.every((tick) => new Date(tick.at).getHours() === 0)).toBe(true);
  });

  it('marks the first of each month across a year', () => {
    const ticks = rangeTicks(
      { min: new Date(2026, 0, 1).getTime(), max: new Date(2027, 0, 1).getTime() },
      'year',
    );
    expect(ticks.length).toBeGreaterThanOrEqual(12);
    expect(ticks.every((tick) => new Date(tick.at).getDate() === 1)).toBe(true);
  });

  it('keeps every fit tick inside a window padded to half an hour', () => {
    const window = fitWindow({ min: NOON, max: NOON + 10 * 60_000 });
    expect(window.max - window.min).toBe(30 * 60_000);
    const ticks = fitTicks(window);
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.every((tick) => tick.at >= window.min && tick.at <= window.max)).toBe(true);
  });

  it('leaves a window of half an hour or more as it is', () => {
    const half = { min: NOON, max: NOON + 30 * 60_000 };
    const longer = { min: NOON, max: NOON + 45 * 60_000 };
    expect(fitWindow(half)).toEqual(half);
    expect(fitWindow(longer)).toEqual(longer);
  });

  it('pads a short window equally on both sides', () => {
    expect(fitWindow({ min: NOON, max: NOON + 20 * 60_000 })).toEqual({
      min: NOON - 5 * 60_000,
      max: NOON + 25 * 60_000,
    });
  });

  it('labels multi-day fit ticks with their own dates', () => {
    const labels = fitTicks({ min: NOON - 6 * DAY, max: NOON }).map((tick) => tick.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain('Today');
  });
});

describe('plotModel', () => {
  it('draws the y axis on the nice ticks of the visible values', () => {
    const model = plotModel([{ points: sampled(60, NOON, DAY) }], '24h', BOX);
    expect(model?.yTicks).toEqual([15, 20, 25]);
    expect(model?.step).toBe(5);
    expect(model?.y(15)).toBe(BOX.bottom);
    expect(model?.y(25)).toBe(BOX.top);
  });

  it('keeps labels apart and inside the plot', () => {
    const model = plotModel([{ points: sampled(60, NOON, 7 * DAY) }], '7d', BOX);
    const xs = (model?.xTicks ?? []).map((tick) => model?.x(tick.at) ?? 0);
    expect(xs.length).toBeGreaterThan(1);
    xs.slice(1).forEach((x, index) => {
      expect(x - (xs[index] ?? 0)).toBeGreaterThanOrEqual(64);
    });
    expect(xs.every((x) => x >= BOX.left && x <= BOX.right)).toBe(true);
  });

  it('is null without readings', () => {
    expect(plotModel([{ points: [] }], '24h', BOX)).toBeNull();
  });

  it('picks the nearest reading per series for a scrub position', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({ t: index * 10, v: index }));
    const model = plotModel([{ points }], '24h', BOX, { fit: true, domain: null });
    if (model === null) {
      throw new Error('expected a model');
    }
    expect(hitsAt(model, BOX.left).map((hit) => hit.point.t)).toEqual([0]);
    expect(hitsAt(model, BOX.right).map((hit) => hit.point.t)).toEqual([90]);
    const middle = model.x(44);
    expect(hitsAt(model, middle).map((hit) => hit.point.t)).toEqual([40]);
    expect(hitsAt(model, model.x(46)).map((hit) => hit.point.t)).toEqual([50]);
  });
});

describe('series helpers', () => {
  it('splits a series where the gap exceeds the maximum', () => {
    const points = [0, 1, 2, 10, 11].map((t) => ({ t, v: t }));
    expect(segmentsOf(points, 3).map((segment) => segment.map((point) => point.t))).toEqual([
      [0, 1, 2],
      [10, 11],
    ]);
  });

  it('finds the first peak and the first low', () => {
    const points = [3, 9, 1, 9, 1].map((v, t) => ({ t, v }));
    expect(extremaOf(points)).toEqual({ peak: { t: 1, v: 9 }, low: { t: 2, v: 1 } });
    expect(extremaOf([])).toBeNull();
  });

  it('writes a line and a filled area down to the baseline', () => {
    const placed = [
      { x: 0, y: 10 },
      { x: 5, y: 20 },
    ];
    expect(linePath(placed)).toBe('M0,10L5,20');
    expect(areaPath(placed, 30)).toBe('M0,10L5,20L5,30L0,30Z');
    expect(linePath([])).toBe('');
  });

  it.each<[ChartRange, number, number, number]>([
    ['week', new Date(2026, 9, 16, 15).getTime(), 9, 12],
    ['month', new Date(2026, 9, 16, 15).getTime(), 9, 1],
    ['year', new Date(2026, 9, 16, 15).getTime(), 0, 1],
  ])('starts a %s on its first local midnight', (range, moment, month, date) => {
    const start = startOf(moment, range);
    expect([start.getMonth(), start.getDate(), start.getHours()]).toEqual([month, date, 0]);
  });
});
