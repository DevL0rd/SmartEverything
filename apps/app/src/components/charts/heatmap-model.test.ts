import { clockFormatOf } from '../../format/clock-text';
import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_ROWS,
  calendarBlocks,
  calendarCells,
  calendarLabels,
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

const H24 = clockFormatOf(true);
const H12 = clockFormatOf(false);

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
    const labelled = calendarLabels(blocks, 17);
    expect(labelled[0]?.labels[0]?.text).toBe('Jan');
    expect(blocks[1]?.cells[0]?.column).toBe(0);
    const texts = labelled.flatMap((entry) => entry.labels.map((label) => label.text));
    expect(new Set(texts).size).toBe(texts.length);
    expect(labelled[1]?.labels[0]).toEqual({ column: 0, text: 'Jul' });
    expect(blocks.every((block) => block.span === Math.max(...blocks.map((b) => b.columns)))).toBe(
      true,
    );
    expect(calendarBlocks([], 2)).toEqual([]);
    expect(calendarBlocks(cells, 1)).toHaveLength(1);
  });

  it('names the year when the weeks cross one and keeps month labels apart', () => {
    const blocks = calendarBlocks(calendarCells(days('2025-10-27', 112), '2026-02-15'), 1);
    expect(calendarLabels(blocks, 17)[0]?.labels.map((label) => label.text)).toEqual([
      'Nov 2025',
      'Dec',
      'Jan 2026',
      'Feb',
    ]);
    const plain = calendarBlocks(calendarCells(days('2026-03-02', 70), '2026-05-10'), 1);
    expect(calendarLabels(plain, 17)[0]?.labels.map((label) => label.text)).toEqual([
      'Mar',
      'Apr',
      'May',
    ]);
  });

  it('measures label room in pixels, so small cells drop a month that would run into a year label', () => {
    const blocks = calendarBlocks(calendarCells(days('2025-11-17', 365), '2026-11-16'), 1);
    const [entry] = calendarLabels(blocks, 10);
    const labels = entry?.labels ?? [];
    expect(labels.map((label) => label.text)).toContain('Jan 2026');
    expect(labels.map((label) => label.text)).not.toContain('Feb');
    labels.slice(1).forEach((label, index) => {
      const previous = labels[index];
      if (previous === undefined) throw new Error('missing label');
      expect((label.column - previous.column) * 10).toBeGreaterThanOrEqual(
        previous.text.length * 7 + 8,
      );
    });
  });

  it('does not repeat a month at the start of the next block', () => {
    const blocks = calendarBlocks(calendarCells(days('2025-11-17', 365), '2026-11-16'), 2);
    const labelled = calendarLabels(blocks, 14);
    const lastOfFirst = labelled[0]?.labels.at(-1)?.text;
    const firstOfSecond = labelled[1]?.labels[0]?.text;
    expect(firstOfSecond?.slice(0, 3)).not.toBe(lastOfFirst?.slice(0, 3));
  });

  it('describes the year in words with the days that were not recorded', () => {
    expect(heatSummary(days('2026-10-01', 7), 'pages printed')).toBe(
      '3 days with pages printed, busiest 2026-10-01 with 5 pages printed, 1 days not recorded',
    );
    expect(heatSummary([], 'photos')).toBe('No days recorded');
    expect(
      heatSummary(
        days('2026-10-02', 1).map((entry) => ({ ...entry, pages: 0 })),
        'photos',
      ),
    ).toBe('0 days with photos, 0 days not recorded');
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
    expect(hourSummary(matrix, WEEKDAY_ROWS, 'pages printed', H24)).toBe(
      'Busiest time Wednesday 18:00 with 20 pages printed',
    );
    expect(hourSummary([[0]], WEEKDAY_ROWS, 'photos', H12)).toBe('No photos by hour yet');
    expect(WEEKDAY_ROWS).toHaveLength(7);
  });
});
