import type { VacuumCleanSummary } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { CLEANS_PAGE_SIZE, needsOlderCleans, nextCleansCursor } from './cleans-paging';

function cleanAt(day: number): VacuumCleanSummary {
  return {
    id: `c${String(day)}`,
    startedAt: new Date(2026, 9, day, 9).toISOString(),
    endedAt: null,
    seconds: 600,
    areaM2: 10,
    scope: null,
    mode: null,
    rooms: [],
    outcome: null,
    batteryStart: null,
    batteryEnd: null,
  };
}

describe('cleans paging', () => {
  it('continues from the start of the last clean of a full page and stops after a short one', () => {
    const full = Array.from({ length: CLEANS_PAGE_SIZE }, (_, index) => cleanAt(30 - index));
    expect(nextCleansCursor(full)).toBe(full[CLEANS_PAGE_SIZE - 1]?.startedAt);
    expect(nextCleansCursor(full.slice(0, 5))).toBeUndefined();
    expect(nextCleansCursor([])).toBeUndefined();
  });

  it('asks for older pages only while the period start is not reached and more exist', () => {
    const from = new Date(2026, 9, 10).getTime();
    expect(needsOlderCleans([cleanAt(20), cleanAt(15)], from, true)).toBe(true);
    expect(needsOlderCleans([cleanAt(20), cleanAt(8)], from, true)).toBe(false);
    expect(needsOlderCleans([cleanAt(20), cleanAt(15)], from, false)).toBe(false);
    expect(needsOlderCleans([], from, true)).toBe(true);
  });
});
