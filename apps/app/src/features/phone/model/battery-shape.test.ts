import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import { batteryShapeOf, chartSummary } from './battery-shape';

const NOW = Date.parse('2026-10-18T14:00:00.000Z');
const BOX = { width: 300, height: 80 };

function point(hoursAgo: number, v: number): { t: number; v: number } {
  return { t: NOW - hoursAgo * HOUR_MS, v };
}

describe('the battery chart shape', () => {
  it('draws one curve across the day and ends on the latest reading', () => {
    const shape = batteryShapeOf([point(24, 90), point(12, 60), point(0, 30)], [], BOX, NOW);
    expect(shape.lines).toHaveLength(1);
    expect(shape.end?.x).toBeCloseTo(298, 0);
    expect(shape.end?.y).toBeGreaterThan(shape.lowY - 30);
  });

  it('holds the last reading until now, because a value stays what it was until it changes', () => {
    const shape = batteryShapeOf([point(24, 90), point(10, 50)], [], BOX, NOW);
    expect(shape.lines).toHaveLength(1);
    expect(shape.end?.x).toBeCloseTo(298, 0);
    expect(shape.end?.y).toBeCloseTo(2 + (BOX.height - 4) * 0.5, 0);
  });

  it('places the low line at twenty percent', () => {
    const shape = batteryShapeOf([point(1, 50), point(0, 50)], [], BOX, NOW);
    expect(shape.lowY).toBeCloseTo(2 + (BOX.height - 4) * 0.8, 1);
  });

  it('draws charging spans as bands clipped to the day and at least two wide', () => {
    const shape = batteryShapeOf(
      [point(1, 50), point(0, 50)],
      [
        { start: NOW - DAY_MS - HOUR_MS, end: NOW - 20 * HOUR_MS },
        { start: NOW - 1000, end: NOW },
      ],
      BOX,
      NOW,
    );
    expect(shape.bands[0]?.x).toBe(2);
    expect(shape.bands[1]?.width).toBe(2);
  });

  it('has no end dot and no curve without readings', () => {
    const shape = batteryShapeOf([], [], BOX, NOW);
    expect(shape).toMatchObject({ lines: [], bands: [], end: null });
  });

  it('describes the day in words, with the charging start', () => {
    const text = chartSummary(
      [point(24, 100), point(0, 62)],
      [{ start: NOW - 2 * HOUR_MS, end: NOW }],
      () => '17:10',
    );
    expect(text).toBe('Battery today, from 100 to 62 percent, charging since 17:10');
    expect(chartSummary([], [], () => '')).toBe('Battery today, no readings yet');
  });
});
