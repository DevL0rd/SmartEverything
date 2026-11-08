import type { TimelineBucket } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  densityPath,
  itemAt,
  labelledTicks,
  monthIndexAt,
  pillText,
  pointAt,
  scrubberModel,
  shareOfItem,
  stepMonth,
  YEAR_LABEL_LINE,
} from './scrubber-model';

const BUCKETS: readonly TimelineBucket[] = [
  { month: '2026-03', count: 600 },
  { month: '2026-01', count: 200 },
  { month: '2024-12', count: 150 },
  { month: '2024-06', count: 50 },
];

describe('the scrubber model', () => {
  it('gives each month a share of the track equal to its share of items', () => {
    const model = scrubberModel(BUCKETS);
    expect(model.total).toBe(1000);
    expect(model.peak).toBe(600);
    expect(model.months.map((month) => [month.start, month.end])).toEqual([
      [0, 0.6],
      [0.6, 0.8],
      [0.8, 0.95],
      [0.95, 1],
    ]);
  });

  it('places year ticks by item density, never spacing years linearly, and skips empty years', () => {
    const model = scrubberModel(BUCKETS);
    expect(model.ticks).toEqual([
      { year: '2026', at: 0 },
      { year: '2024', at: 0.8 },
    ]);
    expect(model.ticks.some((tick) => tick.year === '2025')).toBe(false);
  });

  it('labels a tick only where the caption line fits, the line height of text-caption', () => {
    const model = scrubberModel([
      { month: '2026-01', count: 990 },
      { month: '2025-01', count: 5 },
      { month: '2024-01', count: 5 },
    ]);
    expect(YEAR_LABEL_LINE).toBe(16);
    expect(labelledTicks(model.ticks, 1000).map((tick) => tick.year)).toEqual(['2026']);
    expect(labelledTicks(model.ticks, 10_000).map((tick) => tick.year)).toEqual([
      '2026',
      '2025',
      '2024',
    ]);
  });

  it('maps a track position to the month and the item under it', () => {
    const model = scrubberModel(BUCKETS);
    expect(monthIndexAt(model.months, 0)).toBe(0);
    expect(monthIndexAt(model.months, 0.6)).toBe(1);
    expect(monthIndexAt(model.months, 0.99)).toBe(3);
    expect(pointAt(model, 0.7)).toEqual({ index: 1, month: '2026-01', count: 200, item: 100 });
    expect(pointAt(model, 1)).toEqual({ index: 3, month: '2024-06', count: 50, item: 49 });
    expect(pointAt(model, -2)).toEqual({ index: 0, month: '2026-03', count: 600, item: 0 });
  });

  it('keeps the item index inside the library at both ends', () => {
    expect(itemAt(1000, 0)).toBe(0);
    expect(itemAt(1000, 1)).toBe(999);
    expect(itemAt(1000, 0.5)).toBe(500);
  });

  it('puts the thumb back where the grid is and refuses a month it does not have', () => {
    const model = scrubberModel(BUCKETS);
    expect(shareOfItem(model, '2024-12', 75)).toBeCloseTo(0.875);
    expect(shareOfItem(model, '2026-03', 9999)).toBeCloseTo(0.6);
    expect(shareOfItem(model, '2019-01', 0)).toBeNull();
  });

  it('steps a month at a time for keyboard and screen reader nudges', () => {
    const model = scrubberModel(BUCKETS);
    expect(stepMonth(model, 0.7, 1)).toBeCloseTo(0.8);
    expect(stepMonth(model, 0.7, -1)).toBe(0);
    expect(stepMonth(model, 0, -1)).toBeNull();
  });

  it('draws the density sparkline from the right edge, widest at the busiest month', () => {
    const model = scrubberModel(BUCKETS);
    expect(densityPath(model, 44, 1000)).toBe(
      'M44 0 L0 300 L29.33 700 L33 875 L40.33 975 L44 1000Z',
    );
    expect(densityPath(scrubberModel([]), 44, 1000)).toBe('');
  });

  it('writes the month pill with its count', () => {
    expect(pillText('2026-03', 1812)).toBe('March 2026 · 1,812');
  });
});
