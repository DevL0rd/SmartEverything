import { describe, expect, it } from 'vitest';
import { statsOf } from './fixtures';
import {
  bandOf,
  barLabelOf,
  barsPeak,
  barsSummary,
  bestsLine,
  chipsOf,
  deltaOf,
  heatGrid,
  heatLevelOf,
  multiplesOf,
  rhythmRows,
  rhythmSummary,
  sizeBins,
  streakLine,
} from './stats-model';

const plain = (text: string): string => text.replaceAll(' ', ' ');

describe('stats deltas', () => {
  it('words a rise, a fall and no change', () => {
    expect(deltaOf({ value: 12, previous: 10, deltaPct: 20 })).toEqual({
      text: '+20%',
      tone: 'positive',
    });
    expect(deltaOf({ value: 8, previous: 10, deltaPct: -20 })).toEqual({
      text: '−20%',
      tone: 'warning',
    });
    expect(deltaOf({ value: 10, previous: 10, deltaPct: 0.2 }).text).toBe('Same as before');
  });

  it('treats a fall as good when lower is better', () => {
    expect(deltaOf({ value: 8, previous: 10, deltaPct: -20 }, false).tone).toBe('positive');
  });

  it('says so when there is no earlier period', () => {
    expect(deltaOf({ value: 5, previous: 0, deltaPct: null }).text).toBe('No earlier period');
  });

  it('shows four headline chips', () => {
    const chips = chipsOf(statsOf());
    expect(chips.map((chip) => chip.label)).toEqual([
      'Total',
      'Per day',
      'Drinks',
      'Average drink',
    ]);
    expect(plain(chips[0]?.value ?? '')).toBe('2,140 ml');
  });
});

describe('stats bars', () => {
  it('labels bars by range', () => {
    expect(barLabelOf('06', 'day')).toBe('06');
    expect(barLabelOf('07', 'day')).toBe('');
    expect(barLabelOf('2026-10-18', 'week')).toHaveLength(3);
    expect(barLabelOf('2026-10-16', 'month')).toBe('16');
    expect(barLabelOf('2026-10-17', 'month')).toBe('');
    expect(barLabelOf('2026-10', 'year')).toHaveLength(1);
  });

  it('summarises the bars in words and finds the scale peak', () => {
    const { bars } = statsOf();
    expect(barsSummary(bars, 'week')).toMatch(/ over 7 days, goal reached on \d+\.$/);
    expect(barsPeak(bars)).toBeGreaterThanOrEqual(2600);
    expect(barsPeak([])).toBe(1);
  });
});

describe('stats calendar', () => {
  it('grades a day against its goal', () => {
    expect([0, 300, 800, 1500, 2600].map((ml) => heatLevelOf(ml, 2600))).toEqual([0, 1, 2, 3, 4]);
  });

  it('lays days into week columns from Monday and thins the month labels', () => {
    const grid = heatGrid(statsOf().heatmap, 3);
    expect(grid.cells).toHaveLength(371);
    expect(grid.cells.every((cell) => cell.row >= 0 && cell.row < 7)).toBe(true);
    const weeks = grid.months.map((month) => month.week);
    expect(weeks.every((week, index) => index === 0 || week - (weeks[index - 1] ?? 0) >= 3)).toBe(
      true,
    );
    expect(grid.weeks).toBe((grid.cells.at(-1)?.week ?? 0) + 1);
  });

  it('is empty without days', () => {
    expect(heatGrid([], 3)).toEqual({ cells: [], weeks: 0, months: [] });
  });
});

describe('stats rhythm, sizes, multiples and bests', () => {
  it('puts Monday first and scales to the busiest cell', () => {
    const rows = rhythmRows(statsOf().rhythm);
    expect(rows.map((row) => row.name)[0]).toBe('Mon');
    expect(Math.max(...rows.flatMap((row) => row.shares))).toBe(1);
    expect(rhythmSummary(statsOf().rhythm)).toMatch(/^Busiest time: \w{3} around \d\d:00\.$/);
    expect(
      rhythmSummary(
        statsOf({ rhythm: Array.from({ length: 7 }, () => Array<number>(24).fill(0)) }).rhythm,
      ),
    ).toBe('No drinking pattern yet.');
  });

  it('marks the bin of the median drink', () => {
    const bins = sizeBins(statsOf().sizes);
    expect(bins).toHaveLength(15);
    expect(bins.filter((bin) => bin.median)).toHaveLength(1);
    expect(bins[7]?.median).toBe(true);
  });

  it('builds three small multiples with a range and a trend', () => {
    const multiples = multiplesOf(statsOf());
    expect(multiples.map((multiple) => multiple.key)).toEqual(['drinks', 'gap', 'fills']);
    expect(multiples[0]?.values).toHaveLength(30);
    expect(multiples[0]?.delta.tone).toBe('positive');
  });

  it('words the streak and the bests', () => {
    expect(streakLine(statsOf().streak)).toBe('3 days in a row');
    expect(streakLine({ ...statsOf().streak, atRisk: true })).toContain('Drink to keep it');
    expect(streakLine({ ...statsOf().streak, current: 0 })).toContain('No streak yet');
    expect(streakLine({ ...statsOf().streak, current: 1 })).toBe('1 day in a row');
    expect(bestsLine(statsOf().bests).map((best) => best.label)).toEqual(['Best day', 'Best week']);
    expect(bestsLine({ bestDay: null, bestWeek: null })).toEqual([]);
  });

  it('keeps only days with both a first and a last drink in the band', () => {
    const daily = statsOf().daily.map((day, index) =>
      index === 0 ? { ...day, firstMinute: null } : day,
    );
    expect(bandOf(daily)).toHaveLength(29);
  });
});
