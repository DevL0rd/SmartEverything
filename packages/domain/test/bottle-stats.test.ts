import { describe, expect, it } from 'vitest';
import {
  bottleDayAfter,
  bottleStatsOf,
  type BottleDayTotal,
  type BottleStatDrink,
  type BottleStatsInput,
} from '../src';

const TODAY = '2026-10-18';

const NO_HOURS = Array.from({ length: 24 }, () => ({ todayMl: 0, yesterdayMl: 0 }));

function total(day: string, totalMl: number, goalMl = 2500): BottleDayTotal {
  const bottleMl = Math.round(totalMl * 0.6);
  const loggedMl = Math.round(totalMl * 0.3);
  return { day, totalMl, bottleMl, loggedMl, otherMl: totalMl - bottleMl - loggedMl, goalMl };
}

function ago(count: number): string {
  return bottleDayAfter(TODAY, -count);
}

function input(overrides: Partial<BottleStatsInput> = {}): BottleStatsInput {
  return {
    range: 'week',
    today: TODAY,
    goalMl: 2500,
    days: [],
    drinks: [],
    fills: [],
    hours: NO_HOURS,
    ...overrides,
  };
}

describe('bottle streaks', () => {
  const days = [
    total(ago(8), 2500),
    total(ago(7), 2600),
    total(ago(6), 1000),
    total(ago(5), 2600),
    total(ago(4), 2600),
    total(ago(2), 2600),
    total(ago(1), 2700),
    total(TODAY, 1200),
  ];

  it('counts consecutive days at or above the goal, skipping a day with no data', () => {
    const { streak } = bottleStatsOf(input({ days }));
    expect(streak.longest).toBe(2);
    expect(streak.longestEnd).toBe(ago(7));
    expect(streak.current).toBe(2);
    expect(streak.atRisk).toBe(true);
  });

  it('counts today in the streak once it reaches the goal', () => {
    const { streak } = bottleStatsOf(input({ days: [...days.slice(0, -1), total(TODAY, 2500)] }));
    expect(streak.current).toBe(3);
    expect(streak.atRisk).toBe(false);
    expect(streak.completion30.at(-1)).toBe(true);
    expect(streak.completion30.at(-2)).toBe(true);
    expect(streak.completion30.at(-3)).toBe(true);
    expect(streak.completion30.at(-4)).toBe(false);
  });

  it('judges each day by its own goal', () => {
    const { streak } = bottleStatsOf(
      input({ days: [total(ago(2), 2600, 3000), total(ago(1), 2600, 2500)] }),
    );
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it('has no streak and nothing at risk without data', () => {
    const { streak, bests } = bottleStatsOf(input());
    expect(streak).toMatchObject({ current: 0, atRisk: false, longest: 0, longestEnd: null });
    expect(streak.completion30).toHaveLength(30);
    expect(bests).toStrictEqual({ bestDay: null, bestWeek: null });
  });

  it('never calls a day a success when the goal is zero', () => {
    const { streak } = bottleStatsOf(input({ days: [total(TODAY, 3000, 0)] }));
    expect(streak.current).toBe(0);
  });

  it('measures streaks from today alone when the first day is in the future', () => {
    const { streak } = bottleStatsOf(input({ days: [total(bottleDayAfter(TODAY, 3), 3000)] }));
    expect(streak.current).toBe(0);
  });
});

describe('bottle bests', () => {
  const days = [
    total(ago(20), 4100),
    total(ago(10), 1000),
    total(ago(9), 3000),
    total(ago(8), 3500),
  ];

  it('finds the best day and the best seven days', () => {
    const { bests } = bottleStatsOf(input({ days }));
    expect(bests.bestDay).toStrictEqual({ day: ago(20), ml: 4100 });
    expect(bests.bestWeek?.ml).toBe(7500);
    expect(bests.bestWeek?.from).toBe(ago(14));
  });

  it('lets the best week end on the day the total peaks', () => {
    const { bests } = bottleStatsOf(input({ days: [total(ago(3), 2000), total(TODAY, 2100)] }));
    expect(bests.bestWeek).toStrictEqual({ from: ago(6), ml: 4100 });
  });
});

describe('bottle comparison with the previous period', () => {
  const days = [
    ...[0, 1, 2, 3, 4, 5, 6].map((count) => total(ago(count), 2000)),
    ...[7, 8, 9, 10, 11, 12, 13].map((count) => total(ago(count), 1600)),
  ];

  it('compares the last seven days with the seven before', () => {
    const { chips, window, previousWindow } = bottleStatsOf(input({ days }));
    expect(window).toStrictEqual({ from: ago(6), to: TODAY });
    expect(previousWindow).toStrictEqual({ from: ago(13), to: ago(7) });
    expect(chips.total).toStrictEqual({ value: 14_000, previous: 11_200, deltaPct: 25 });
    expect(chips.perDay).toStrictEqual({ value: 2000, previous: 1600, deltaPct: 25 });
  });

  it('gives no percentage when there was nothing before', () => {
    const { chips } = bottleStatsOf(input({ days: days.slice(0, 7) }));
    expect(chips.total.deltaPct).toBeNull();
    expect(chips.drinks).toStrictEqual({ value: 0, previous: 0, deltaPct: null });
    expect(chips.drinkSize).toStrictEqual({ value: 0, previous: 0, deltaPct: null });
  });

  it('counts drinks and their average size in each period', () => {
    const drinks: BottleStatDrink[] = [
      { day: TODAY, minute: 480, ml: 100 },
      { day: ago(1), minute: 600, ml: 200 },
      { day: ago(8), minute: 600, ml: 300 },
    ];
    const { chips } = bottleStatsOf(input({ days, drinks }));
    expect(chips.drinks).toStrictEqual({ value: 2, previous: 1, deltaPct: 100 });
    expect(chips.drinkSize).toStrictEqual({ value: 150, previous: 300, deltaPct: -50 });
  });

  it('adds up the three sources over the period', () => {
    const { sources } = bottleStatsOf(input({ days: days.slice(0, 7) }));
    expect(sources).toStrictEqual({ bottleMl: 8400, loggedMl: 4200, otherMl: 1400 });
  });

  it('compares today with yesterday on the day range and the last year with the one before', () => {
    const day = bottleStatsOf(input({ range: 'day', days }));
    expect(day.window).toStrictEqual({ from: TODAY, to: TODAY });
    expect(day.previousWindow).toStrictEqual({ from: ago(1), to: ago(1) });
    const year = bottleStatsOf(input({ range: 'year', days }));
    expect(year.window).toStrictEqual({ from: ago(364), to: TODAY });
    expect(year.previousWindow).toStrictEqual({ from: ago(729), to: ago(365) });
  });
});

describe('bottle bars', () => {
  const days = [total(ago(7), 1800), total(ago(1), 2600), total(TODAY, 1000)];

  it('draws one bar per day for a week with the day a week earlier as the ghost', () => {
    const { bars } = bottleStatsOf(input({ days }));
    expect(bars).toHaveLength(7);
    const last = bars.at(-1);
    expect(last).toMatchObject({ key: TODAY, totalMl: 1000, previousMl: 1800, goalMet: false });
    const first = bars.at(0);
    expect(first).toMatchObject({ key: ago(6), totalMl: 0 });
    expect(bars.at(-2)).toMatchObject({ totalMl: 2600, goalMet: true, goalMl: 2500 });
    expect(bars.at(-2)?.parts).toStrictEqual({ bottleMl: 1560, loggedMl: 780, otherMl: 260 });
    const eight = bottleStatsOf(input({ days, range: 'month' })).bars;
    expect(eight).toHaveLength(30);
    expect(eight.find((bar) => bar.key === ago(0))?.previousMl).toBe(0);
    expect(eight.find((bar) => bar.key === ago(0))).toBeDefined();
  });

  it('draws one bar per hour for a day, today against yesterday', () => {
    const hours = NO_HOURS.map((_, hour) => ({
      todayMl: hour === 8 ? 300 : 0,
      yesterdayMl: hour === 8 ? 250 : 0,
    }));
    const { bars } = bottleStatsOf(input({ range: 'day', hours }));
    expect(bars).toHaveLength(24);
    expect(bars[8]).toMatchObject({ key: '08', totalMl: 300, previousMl: 250, parts: null });
    expect(bars[8]?.goalMl).toBeCloseTo(2500 / 24, 5);
  });

  it('draws twelve months for a year, each as the average per day and against the year before', () => {
    const wide = [
      ...Array.from({ length: 31 }, (_, index) =>
        total(`2026-10-${String(index + 1).padStart(2, '0')}`, 2000),
      ),
      ...Array.from({ length: 30 }, (_, index) =>
        total(`2026-09-${String(index + 1).padStart(2, '0')}`, 3000),
      ),
      total('2025-10-01', 1000),
    ];
    const { bars } = bottleStatsOf(input({ range: 'year', days: wide }));
    expect(bars).toHaveLength(12);
    expect(bars[0]?.key).toBe('2025-11');
    const october = bars[11];
    expect(october).toMatchObject({ key: '2026-10' });
    expect(october?.totalMl).toBeCloseTo((2000 * 18) / 18, 5);
    expect(october?.previousMl).toBeCloseTo(1000 / 31, 5);
    expect(october?.goalMet).toBe(false);
    expect(bars[10]).toMatchObject({ key: '2026-09', totalMl: 3000, goalMet: true });
    expect(bars[0]?.totalMl).toBe(0);
  });

  it('draws the first day of a month as that day alone', () => {
    const { bars } = bottleStatsOf(input({ range: 'year', today: '2026-10-01', days: [] }));
    expect(bars.at(-1)).toMatchObject({ key: '2026-10', totalMl: 0 });
  });
});

describe('bottle averages and calendar', () => {
  it('averages the last seven and thirty days over the whole period, not only the days with data', () => {
    const days = Array.from({ length: 30 }, (_, count) => total(ago(count), 3000));
    const { averages } = bottleStatsOf(input({ days: days.slice(0, 7) }));
    expect(averages.sevenDayMl).toBe(3000);
    expect(averages.thirtyDayMl).toBeCloseTo((3000 * 7) / 30, 5);
    expect(bottleStatsOf(input({ days })).averages.thirtyDayMl).toBe(3000);
  });

  it('gives the last 371 days for the calendar, empty days included', () => {
    const { heatmap } = bottleStatsOf(input({ days: [total(ago(1), 2000)] }));
    expect(heatmap).toHaveLength(371);
    expect(heatmap[0]?.day).toBe(ago(370));
    expect(heatmap.at(-1)).toStrictEqual({ day: TODAY, ml: 0, goalMl: 2500 });
    expect(heatmap.at(-2)).toStrictEqual({ day: ago(1), ml: 2000, goalMl: 2500 });
  });
});

describe('bottle drink patterns', () => {
  const sunday = TODAY;
  const drinks: BottleStatDrink[] = [
    { day: sunday, minute: 8 * 60 + 5, ml: 100 },
    { day: sunday, minute: 8 * 60 + 40, ml: 130 },
    { day: sunday, minute: 14 * 60, ml: 20 },
    { day: ago(7), minute: 8 * 60 + 15, ml: 400 },
    { day: ago(1), minute: 9 * 60, ml: 500 },
    { day: ago(100), minute: 9 * 60, ml: 999 },
  ];

  it('averages the ml per weekday and hour over ninety days', () => {
    const { rhythm } = bottleStatsOf(input({ drinks }));
    expect(rhythm).toHaveLength(7);
    expect(rhythm.every((row) => row.length === 24)).toBe(true);
    const sundays = 13;
    expect(rhythm[0]?.[8]).toBeCloseTo((100 + 130 + 400) / sundays, 5);
    expect(rhythm[0]?.[14]).toBeCloseTo(20 / sundays, 5);
    expect(rhythm[6]?.[9]).toBeCloseTo(500 / 13, 5);
    expect(rhythm[6]?.[10]).toBe(0);
  });

  it('bins the drink sizes of thirty days from 20 ml and finds the median', () => {
    const { sizes } = bottleStatsOf(input({ drinks }));
    expect(sizes.count).toBe(5);
    expect(sizes.bins[0]).toBe(1);
    expect(sizes.bins[4]).toBe(1);
    expect(sizes.bins[14]).toBe(2);
    expect(sizes.bins.reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(sizes.medianMl).toBe(130);
  });

  it('takes the middle of two sizes as the median of an even count and none without drinks', () => {
    const two = bottleStatsOf(
      input({
        drinks: [
          { day: TODAY, minute: 1, ml: 100 },
          { day: TODAY, minute: 2, ml: 200 },
        ],
      }),
    ).sizes;
    expect(two.medianMl).toBe(150);
    expect(bottleStatsOf(input()).sizes).toMatchObject({ medianMl: null, count: 0 });
    const tiny = bottleStatsOf(input({ drinks: [{ day: TODAY, minute: 1, ml: 5 }] })).sizes;
    expect(tiny.bins[0]).toBe(1);
  });

  it('summarises each of the last thirty days: drinks, longest gap, first and last drink, fills', () => {
    const fills = [
      { day: sunday, ml: 600 },
      { day: sunday, ml: 400 },
    ];
    const { daily, dailyAverages } = bottleStatsOf(input({ drinks, fills }));
    expect(daily).toHaveLength(30);
    const today = daily.at(-1);
    expect(today).toStrictEqual({
      day: sunday,
      drinks: 3,
      longestGapMin: 320,
      firstMinute: 485,
      lastMinute: 840,
      fills: 2,
      litresFilled: 1,
    });
    expect(daily.at(-2)).toMatchObject({ drinks: 1, longestGapMin: 0, fills: 0 });
    expect(daily.at(-3)).toMatchObject({ drinks: 0, firstMinute: null, lastMinute: null });
    expect(dailyAverages.drinksPerDay).toBeCloseTo(5 / 30, 5);
    expect(dailyAverages.fillsPerDay).toBeCloseTo(2 / 30, 5);
    expect(dailyAverages.litresPerDay).toBeCloseTo(1 / 30, 5);
    expect(dailyAverages.longestGapMin).toBe(320);
  });

  it('describes the thirty days before as the comparison', () => {
    const { previousDailyAverages } = bottleStatsOf(
      input({
        drinks: [
          { day: ago(40), minute: 480, ml: 100 },
          { day: ago(40), minute: 600, ml: 100 },
        ],
      }),
    );
    expect(previousDailyAverages.drinksPerDay).toBeCloseTo(2 / 30, 5);
    expect(previousDailyAverages.longestGapMin).toBe(120);
  });
});
