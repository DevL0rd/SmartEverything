import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_LETTERS,
  calendarBlocks,
  calendarCells,
  heatSummary,
  hourCells,
  hourSummary,
  type HeatDay,
} from './heatmap-model';

function days(from: string, count: number): HeatDay[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    pages: index % 3 === 0 ? 5 : 0,
    level: index % 3 === 0 ? 2 : 0,
    covered: index !== 4,
  }));
}

describe('calendar cells', () => {
  it('puts Monday in the first row and starts a new column each week', () => {
    const cells = calendarCells(days('2026-10-14', 10), '2026-10-18');
    expect(cells[0]).toMatchObject({ day: '2026-10-14', column: 0, row: 2 });
    expect(cells[5]).toMatchObject({ day: '2026-10-19', column: 1, row: 0 });
    expect(cells.find((cell) => cell.today)?.day).toBe('2026-10-18');
    expect(calendarCells([], '2026-10-18')).toEqual([]);
  });

  it('cuts a year into stacked blocks that each fit a phone, with month names', () => {
    const cells = calendarCells(days('2026-01-01', 365), '2026-12-31');
    const blocks = calendarBlocks(cells, 2);
    expect(blocks).toHaveLength(2);
    expect(blocks.reduce((sum, block) => sum + block.cells.length, 0)).toBe(365);
    expect(Math.max(...blocks.map((block) => block.columns))).toBeLessThanOrEqual(27);
    expect(blocks[0]?.labels[0]?.text).toBe('Jan');
    expect(blocks[1]?.cells[0]?.column).toBe(0);
    expect(calendarBlocks([], 2)).toEqual([]);
    expect(calendarBlocks(cells, 1)).toHaveLength(1);
  });

  it('describes the year in words with the days that were not recorded', () => {
    expect(heatSummary(days('2026-10-01', 7))).toBe(
      '3 printing days, busiest 2026-10-01 with 5 pages, 1 days not recorded',
    );
    expect(heatSummary([])).toBe('No days recorded');
    expect(heatSummary(days('2026-10-02', 1).map((entry) => ({ ...entry, pages: 0 })))).toBe(
      '0 printing days, 0 days not recorded',
    );
  });
});

describe('weekday by hour cells', () => {
  const matrix = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const row = matrix[2];
  if (row !== undefined) {
    row[18] = 20;
    row[7] = 5;
  }

  it('bins pages into levels against the busiest hour', () => {
    const cells = hourCells(matrix);
    expect(cells).toHaveLength(168);
    expect(cells.find((cell) => cell.row === 2 && cell.column === 18)?.level).toBe(4);
    expect(cells.find((cell) => cell.row === 2 && cell.column === 7)?.level).toBe(1);
    expect(cells.find((cell) => cell.row === 0 && cell.column === 0)?.level).toBe(0);
    expect(hourCells([[0, 0]]).every((cell) => cell.level === 0)).toBe(true);
  });

  it('names the busiest time in words', () => {
    expect(hourSummary(matrix)).toBe('Busiest time Wed 18:00 with 20 pages');
    expect(hourSummary([[0]])).toBe('No printing by hour yet');
    expect(WEEKDAY_LETTERS).toHaveLength(7);
  });
});
