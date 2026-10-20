import { describe, expect, it } from 'vitest';
import {
  appendChartPoint,
  chartPointOf,
  chartPointsOf,
  SERIES_KEPT,
  seriesWindow,
} from './series-model';

const REF = { stream: 'rain', field: 'mm' } as const;
const START = Date.parse('2026-10-18T10:00:00.000Z');

function at(minutes: number): string {
  return new Date(START + minutes * 60_000).toISOString();
}

describe('chartPointOf', () => {
  it('draws a numeric field at its time and skips readings that are not numbers', () => {
    expect(
      chartPointOf({ stream: 'rain', value: { mm: 2 }, at: at(0) }, 'garden', REF),
    ).toStrictEqual({
      t: START,
      v: 2,
    });
    expect(
      chartPointOf({ stream: 'rain', value: { mm: 'a' }, at: at(0) }, 'garden', REF),
    ).toBeNull();
    expect(chartPointOf({ stream: 'rain', value: {}, at: at(0) }, 'garden', REF)).toBeNull();
  });
});

describe('chartPointsOf', () => {
  it('keeps only the points that carry a number', () => {
    const points = chartPointsOf(
      [
        { stream: 'rain', value: { mm: 1 }, at: at(0) },
        { stream: 'rain', value: { mm: null }, at: at(1) },
        { stream: 'rain', value: { mm: 3 }, at: at(2) },
      ],
      'garden',
      REF,
    );
    expect(points.map((point) => point.v)).toStrictEqual([1, 3]);
  });
});

describe('appendChartPoint', () => {
  it('adds a newer point, ignores an older or equal one and a missing one', () => {
    const first = { t: START, v: 1 };
    const second = { t: START + 1000, v: 2 };
    expect(appendChartPoint([first], second)).toStrictEqual([first, second]);
    expect(appendChartPoint([first, second], first)).toStrictEqual([first, second]);
    expect(appendChartPoint([first], { t: START, v: 9 })).toStrictEqual([first]);
    expect(appendChartPoint([first], null)).toStrictEqual([first]);
  });

  it('keeps only the newest points', () => {
    let points: readonly { t: number; v: number }[] = [];
    for (let index = 0; index < SERIES_KEPT + 5; index += 1) {
      points = appendChartPoint(points, { t: START + index, v: index });
    }
    expect(points).toHaveLength(SERIES_KEPT);
    expect(points[0]?.v).toBe(5);
  });
});

describe('seriesWindow', () => {
  it('merges history and live points by time, newest wins, and cuts to the window', () => {
    const history = [
      { t: START, v: 1 },
      { t: START + 30 * 60_000, v: 2 },
      { t: START + 60 * 60_000, v: 3 },
    ];
    const live = [
      { t: START + 60 * 60_000, v: 30 },
      { t: START + 90 * 60_000, v: 4 },
    ];
    expect(seriesWindow(history, live, 60).map((point) => point.v)).toStrictEqual([2, 30, 4]);
  });

  it('is empty without points', () => {
    expect(seriesWindow([], [], 60)).toStrictEqual([]);
  });
});
