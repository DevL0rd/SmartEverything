import { describe, expect, it } from 'vitest';
import {
  PRINTER_DAY,
  PRINTER_STATS,
  dayStanding,
  heatLevel,
  isCovered,
  printerPeriods,
  type PrinterDay,
} from '../src';

function day(key: string, values: Partial<PrinterDay> = {}): PrinterDay {
  return {
    day: key,
    jobs: 0,
    canceled: 0,
    failed: 0,
    pages: 0,
    sheets: 0,
    mono: 0,
    color: 0,
    duplexPages: 0,
    activeSeconds: 0,
    onlineSeconds: 86_400,
    offlineSeconds: 0,
    restarts: 0,
    errors: 0,
    jams: 0,
    hours: new Array<number>(24).fill(0),
    counterPages: null,
    estimatedPages: null,
    gaps: [],
    ...values,
  };
}

function hours(at: number, pages: number): number[] {
  const row = new Array<number>(24).fill(0);
  row[at] = pages;
  return row;
}

const DAYS: readonly PrinterDay[] = [
  day('2026-09-28', { jobs: 1, pages: 4, mono: 4, sheets: 4, hours: hours(9, 4) }),
  day('2026-10-05', {
    jobs: 3,
    pages: 12,
    mono: 8,
    color: 4,
    sheets: 8,
    duplexPages: 8,
    hours: hours(18, 12),
    jams: 1,
  }),
  day('2026-10-12', {
    jobs: 2,
    pages: 10,
    mono: 10,
    sheets: 10,
    hours: hours(18, 10),
    errors: 2,
    restarts: 1,
  }),
  day('2026-10-13', { jobs: 1, pages: 6, color: 6, sheets: 6, hours: hours(7, 6) }),
  day('2026-10-14', { gaps: [{ from: 0, to: 1440 }], estimatedPages: 9 }),
  day('2026-10-16', {
    jobs: 4,
    pages: 20,
    mono: 12,
    color: 8,
    sheets: 12,
    duplexPages: 8,
    hours: hours(10, 20),
    onlineSeconds: 43_200,
    offlineSeconds: 43_200,
  }),
];

const request = {
  days: DAYS,
  jobPages: [1, 1, 2, 3, 5, 9, 12, 40],
  period: 'week' as const,
  anchor: '2026-10-14',
  today: '2026-10-18',
  firstDay: '2026-09-01',
  lifetimePages: 1234,
};

describe('printer periods', () => {
  const stats = printerPeriods(request);

  it('produces a result that matches its own schema', () => {
    expect(PRINTER_STATS.parse(stats)).toEqual(stats);
    for (const row of DAYS) expect(PRINTER_DAY.parse(row)).toEqual(row);
  });

  it('adds up a calendar week and compares it with the one before', () => {
    expect(stats.from).toBe('2026-10-12');
    expect(stats.to).toBe('2026-10-18');
    expect(stats.totals).toMatchObject({
      pages: 36,
      jobs: 7,
      sheets: 28,
      color: 14,
      mono: 22,
      notAttributed: 9,
      paperSaved: 4,
    });
    expect(stats.totals.coveredDays).toBe(6);
    expect(stats.totals.colorShare).toBeCloseTo(14 / 36, 6);
    expect(stats.totals.duplexShare).toBeCloseTo(8 / 36, 6);
    expect(stats.previous.pages).toBe(12);
    expect(stats.delta.pages).toBeCloseTo(2, 6);
    expect(stats.delta.jobs).toBeCloseTo(4 / 3, 6);
    expect(stats.delta.colorShare).toBeCloseTo(14 / 36 - 4 / 12, 6);
  });

  it('keeps unknown change as null instead of inventing a percentage', () => {
    const empty = printerPeriods({ ...request, days: [], anchor: '2026-10-18' });
    expect(empty.delta).toEqual({
      pages: null,
      jobs: null,
      sheets: null,
      colorShare: null,
      duplexShare: null,
      paperSaved: null,
    });
    expect(empty.totals.colorShare).toBeNull();
    expect(empty.totals.duplexShare).toBeNull();
    expect(empty.busiestDay).toBeNull();
    expect(empty.reliability.onlinePercent).toBeNull();
  });

  it('gives one bucket per day with gap days marked as not covered', () => {
    expect(stats.buckets.map((bucket) => bucket.key)).toHaveLength(7);
    expect(stats.buckets[2]?.covered).toBe(false);
    expect(stats.buckets[0]?.covered).toBe(true);
    expect(stats.previousBuckets[0]?.pages).toBe(12);
  });

  it('averages over 7 and 30 days ending on each bucket', () => {
    expect(stats.average7).toHaveLength(7);
    expect(stats.average7[1]).toBeCloseTo((10 + 6) / 7, 6);
    expect(stats.average30[6]).toBeCloseTo((4 + 12 + 10 + 6 + 20) / 30, 6);
  });

  it('builds hour buckets for a day, month buckets for a year and day buckets for a month', () => {
    const dayView = printerPeriods({ ...request, period: 'day', anchor: '2026-10-16' });
    expect(dayView.buckets).toHaveLength(24);
    expect(dayView.buckets[10]?.pages).toBe(20);
    expect(dayView.average7).toHaveLength(24);
    const yearView = printerPeriods({ ...request, period: 'year', anchor: '2026-10-18' });
    expect(yearView.buckets).toHaveLength(12);
    expect(yearView.buckets[9]?.pages).toBe(48);
    expect(yearView.average7[9]).toBeCloseTo((10 + 6 + 20) / 7, 6);
    const monthView = printerPeriods({ ...request, period: 'month', anchor: '2026-10-18' });
    expect(monthView.buckets).toHaveLength(31);
  });

  it('lists reliability months in order whatever order the rows come in, and survives short hour rows', () => {
    const shuffled = printerPeriods({
      ...request,
      days: [
        day('2026-10-12', { hours: [], pages: 1 }),
        day('2026-08-03', { errors: 1 }),
        day('2026-09-03'),
      ],
    });
    expect(shuffled.reliability.months.map((entry) => entry.month)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(shuffled.weekdayHour[0]).toHaveLength(24);
  });

  it('finds the busiest day and the page histogram', () => {
    expect(stats.busiestDay).toEqual({ day: '2026-10-16', pages: 20 });
    expect(stats.pagesPerJob).toEqual([
      { label: '1', jobs: 2 },
      { label: '2-3', jobs: 2 },
      { label: '4-10', jobs: 2 },
      { label: '11-30', jobs: 1 },
      { label: '31+', jobs: 1 },
    ]);
  });

  it('counts print-free and printing streaks, skipping days it could not see', () => {
    expect(stats.printFree.current).toBe(2);
    expect(stats.printFree.longest).toBeGreaterThan(10);
    expect(stats.printing.current).toBe(0);
    expect(stats.printing.longest).toBe(3);
  });

  it('keeps unknown days neutral for the streak of free days', () => {
    const gap = printerPeriods({ ...request, today: '2026-10-15' });
    expect(gap.printFree.current).toBe(1);
    const later = printerPeriods({
      ...request,
      days: [...DAYS, day('2026-10-17', { gaps: [{ from: 0, to: 10 }] })],
    });
    expect(later.printFree.current).toBe(1);
  });

  it('draws the last 365 days with levels, and marks days outside coverage', () => {
    expect(stats.heatmap).toHaveLength(365);
    const peak = stats.heatmap.find((cell) => cell.day === '2026-10-16');
    expect(peak).toMatchObject({ pages: 20, level: 4, covered: true });
    expect(stats.heatmap.find((cell) => cell.day === '2026-10-14')?.covered).toBe(false);
    expect(stats.heatmap.find((cell) => cell.day === '2025-12-01')?.covered).toBe(false);
    expect(stats.heatmap.at(-1)?.day).toBe('2026-10-18');
  });

  it('adds pages into a weekday by hour matrix with Monday first', () => {
    expect(stats.weekdayHour).toHaveLength(7);
    expect(stats.weekdayHour[0]?.[18]).toBe(22);
    expect(stats.weekdayHour[4]?.[10]).toBe(20);
    expect(stats.weekdayHour[0]?.[9]).toBe(4);
  });

  it('adds up reliability over the period and per month', () => {
    expect(stats.reliability.restarts).toBe(1);
    expect(stats.reliability.errors).toBe(2);
    expect(stats.reliability.jams).toBe(0);
    expect(stats.reliability.months).toEqual([
      { month: '2026-09', jams: 0, errors: 0 },
      { month: '2026-10', jams: 1, errors: 2 },
    ]);
    expect(stats.reliability.onlinePercent).toBeCloseTo(
      ((43_200 + 86_400 * 3) / (43_200 + 86_400 * 3 + 43_200)) * 100,
      6,
    );
    expect(stats.lifetimePages).toBe(1234);
  });
});

describe('what a day was', () => {
  it('tells printed, free and unknown days apart', () => {
    const first = '2026-10-01';
    expect(dayStanding(undefined, '2026-09-30', first)).toBe('unknown');
    expect(dayStanding(undefined, '2026-10-02', first)).toBe('free');
    expect(dayStanding(day('2026-10-02', { jobs: 1 }), '2026-10-02', first)).toBe('printed');
    expect(dayStanding(day('2026-10-02', { pages: 2 }), '2026-10-02', first)).toBe('printed');
    expect(dayStanding(day('2026-10-02', { estimatedPages: 3 }), '2026-10-02', first)).toBe(
      'printed',
    );
    expect(
      dayStanding(day('2026-10-02', { gaps: [{ from: 0, to: 60 }] }), '2026-10-02', first),
    ).toBe('unknown');
    expect(dayStanding(day('2026-10-02'), '2026-10-02', first)).toBe('free');
    expect(isCovered(undefined, '2026-10-02', first)).toBe(true);
    expect(isCovered(undefined, '2026-09-02', first)).toBe(false);
    expect(isCovered(day('x', { gaps: [{ from: 0, to: 1 }] }), '2026-10-02', first)).toBe(false);
  });

  it('bins heat levels', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(5, 0)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(100, 100)).toBe(4);
    expect(heatLevel(500, 100)).toBe(4);
  });
});
