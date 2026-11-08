import { describe, expect, it } from 'vitest';
import { fittedCount } from './use-robot-card';

describe('fittedCount', () => {
  it('shows every quick move until the row and every button are measured', () => {
    expect(fittedCount([100, 90], 110, null, 8)).toBe(2);
    expect(fittedCount([100, undefined], 110, 400, 8)).toBe(2);
    expect(fittedCount([100, 90], undefined, 400, 8)).toBe(2);
  });

  it('keeps the quick moves that fit on one row beside the moves menu', () => {
    expect(fittedCount([100, 90, 80], 110, 240, 8)).toBe(1);
    expect(fittedCount([100, 90, 80], 110, 316, 8)).toBe(2);
    expect(fittedCount([100, 90, 80], 110, 404, 8)).toBe(3);
  });

  it('shows only the menu when no quick move fits beside it', () => {
    expect(fittedCount([100], 110, 200, 8)).toBe(0);
  });

  it('follows the row width when it grows again', () => {
    const widths = [100, 90, 80];
    expect(fittedCount(widths, 110, 240, 8)).toBe(1);
    expect(fittedCount(widths, 110, 1000, 8)).toBe(3);
  });
});
