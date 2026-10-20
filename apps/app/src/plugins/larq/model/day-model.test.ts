import { BOTTLE_READING_ROW } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { statusOf } from './fixtures';
import {
  chartSummary,
  cumulativeOf,
  drinkMarks,
  levelTrail,
  hourBars,
  levelPoints,
  markNear,
  minuteOf,
  peakHour,
} from './day-model';

const today = statusOf().today;

describe('day chart model', () => {
  it('turns a moment into a minute of the day', () => {
    const expected = new Date('2026-10-18T07:41:00+02:00');
    expect(minuteOf('2026-10-18T07:41:00+02:00')).toBe(
      expected.getHours() * 60 + expected.getMinutes(),
    );
  });

  it('sums the drinks into a running total that starts at zero', () => {
    const total = cumulativeOf(today);
    expect(total[0]).toEqual({ minute: 0, ml: 0 });
    expect(total.at(-1)?.ml).toBe(680);
    expect(total.map((point) => point.ml)).toEqual(
      [...total.map((point) => point.ml)].sort((a, b) => a - b),
    );
  });

  it('lists drinks and refills in time order and tells them apart', () => {
    const marks = drinkMarks(today);
    expect(marks).toHaveLength(5);
    expect(marks.filter((mark) => mark.fill)).toHaveLength(1);
    expect(marks.map((mark) => mark.minute)).toEqual(
      [...marks.map((mark) => mark.minute)].sort((a, b) => a - b),
    );
  });

  it('draws the level from the drinks and refills when the day has no readings', () => {
    const trail = levelTrail({ ...today, levels: [] });
    expect(trail).toHaveLength(5);
    expect(trail.every((point) => !point.rejected)).toBe(true);
    expect(trail.map((point) => point.ml)).toContain(680);
  });

  it('keeps rejected readings as hollow points and drops readings without a level', () => {
    const base = {
      trigger: 'cap',
      distanceMm: 60,
      kcps: 3000,
      ledOhm: 0,
      kind: 'small',
      ml: null,
      drunkMl: null,
    };
    const rows = [
      { ...base, at: '2026-10-18T08:00:00+02:00', verdict: 'accepted', volumeMl: 500 },
      { ...base, at: '2026-10-18T09:00:00+02:00', verdict: 'slosh', volumeMl: 480 },
      { ...base, at: '2026-10-18T10:00:00+02:00', verdict: 'out_of_range', volumeMl: null },
    ].map((row) => BOTTLE_READING_ROW.parse(row));
    expect(levelPoints(rows).map((point) => point.rejected)).toEqual([false, true]);
  });

  it('builds 24 hour bars and finds the busiest hour', () => {
    const bars = hourBars(today);
    expect(bars).toHaveLength(24);
    expect(bars[0]?.label).toBe('00');
    expect(bars[1]?.label).toBe('');
    expect(peakHour(today)).toBe('11');
    expect(peakHour({ ...today, hourly: today.hourly.map(() => 0) })).toBeUndefined();
  });

  it('describes the chart in words', () => {
    expect(chartSummary(today)).toBe('4 drinks from the bottle today, 1 refill.');
    expect(chartSummary({ ...today, drinks: [], fills: [] })).toBe(
      '0 drinks from the bottle today.',
    );
  });
});

describe('finding the drink under a tap', () => {
  const marks = drinkMarks(today);

  it('finds the nearest drink that has an entry to open', () => {
    const [first] = marks;
    expect(markNear(marks, (first?.minute ?? 0) + 3, 10)).toBe(first);
  });

  it('ignores refills and drinks without an entry', () => {
    const refill = marks.find((mark) => mark.fill);
    expect(markNear(marks, refill?.minute ?? 0, 1)).toBeNull();
    expect(
      markNear(
        marks.map((mark) => ({ ...mark, entryId: null })),
        460,
        60,
      ),
    ).toBeNull();
  });

  it('finds nothing farther away than the tolerance and prefers the closer of two', () => {
    expect(markNear(marks, 30, 10)).toBeNull();
    const pair = [
      { minute: 600, ml: 100, fill: false, entryId: 'a', levelMl: null },
      { minute: 612, ml: 100, fill: false, entryId: 'b', levelMl: null },
    ];
    expect(markNear(pair, 609, 20)?.entryId).toBe('b');
    expect(markNear(pair, 603, 20)?.entryId).toBe('a');
  });
});
