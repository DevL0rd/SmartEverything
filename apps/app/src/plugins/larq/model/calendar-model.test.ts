import { describe, expect, it } from 'vitest';
import { dayAtPoint, dayHeading, streakMarkOf } from './calendar-model';
import { TODAY, statsOf } from './fixtures';
import { heatGrid } from './stats-model';

describe('the streak on the calendar', () => {
  it('marks the days ending today when today reached the goal', () => {
    const mark = streakMarkOf({ ...statsOf().streak, current: 3, atRisk: false }, TODAY);
    expect([...mark.days].sort()).toStrictEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(mark.end).toBe(TODAY);
  });

  it('ends yesterday while today is still short of the goal', () => {
    const mark = streakMarkOf({ ...statsOf().streak, current: 2, atRisk: true }, TODAY);
    expect([...mark.days].sort()).toStrictEqual(['2026-10-16', '2026-10-17']);
    expect(mark.end).toBe('2026-10-17');
  });

  it('marks nothing without a streak', () => {
    const mark = streakMarkOf({ ...statsOf().streak, current: 0, atRisk: false }, TODAY);
    expect(mark.days.size).toBe(0);
    expect(mark.end).toBeNull();
  });
});

describe('finding the day under a tap', () => {
  const grid = heatGrid(statsOf().heatmap, 4);
  const layout = { step: 14, top: 16, rowStep: 14 };

  it('finds the day of the cell that was tapped', () => {
    const cell = grid.cells.find((entry) => entry.week === 5 && entry.row === 2);
    const point = { x: 5 * layout.step + 4, y: layout.top + 2 * layout.rowStep + 4 };
    expect(dayAtPoint(grid.cells, layout, point)).toBe(cell?.day);
  });

  it('finds nothing above the grid or past its last day', () => {
    expect(dayAtPoint(grid.cells, layout, { x: 20, y: 2 })).toBeNull();
    expect(dayAtPoint(grid.cells, layout, { x: 9000, y: 40 })).toBeNull();
  });

  it('names the day with its weekday', () => {
    expect(dayHeading(TODAY)).toMatch(/^Sun /u);
  });
});
