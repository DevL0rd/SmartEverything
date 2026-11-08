import { describe, expect, it } from 'vitest';
import { otherYearDays, sameDayIn } from './this-day';

describe('this day in other years', () => {
  it('asks only the years that have photos in the same month', () => {
    const buckets = [
      { month: '2026-11', count: 40 },
      { month: '2026-10', count: 12 },
      { month: '2025-11', count: 8 },
      { month: '2023-11', count: 3 },
      { month: '2023-06', count: 9 },
    ];
    expect(otherYearDays(buckets, '2026-11-07')).toEqual(['2025-11-07', '2023-11-07']);
  });

  it('skips a leap day in a year that has none', () => {
    expect(sameDayIn(2023, '02-29')).toBeNull();
    expect(sameDayIn(2024, '02-29')).toBe('2024-02-29');
    expect(otherYearDays([{ month: '2023-02', count: 2 }], '2024-02-29')).toEqual([]);
  });
});
