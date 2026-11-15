import { describe, expect, it } from 'vitest';
import { archiveSubtitle, shareOf, spanText, yearsOf } from './archive-model';

describe('archive summary', () => {
  const buckets = [
    { month: '2024-03', count: 4 },
    { month: '2024-01', count: 2 },
    { month: '2021-07', count: 3 },
  ];

  it('sums the archived months per year, oldest first', () => {
    const years = yearsOf(buckets);
    expect(years).toEqual([
      { year: '2021', count: 3 },
      { year: '2022', count: 0 },
      { year: '2023', count: 0 },
      { year: '2024', count: 6 },
    ]);
    expect(yearsOf([])).toEqual([]);
    expect(shareOf(3, years)).toBe(0.5);
    expect(shareOf(1, [])).toBe(0);
    expect(spanText(years)).toBe('From 2021 to 2024');
    expect(spanText(yearsOf([{ month: '2024-01', count: 1 }]))).toBe('From 2024');
    expect(spanText([])).toBeNull();
  });

  it('says what is archived', () => {
    expect(archiveSubtitle(null, false)).toBeNull();
    expect(archiveSubtitle(0, false)).not.toBeNull();
    expect(archiveSubtitle(1, false)).toContain('1 item');
    expect(archiveSubtitle(5, false)).toContain('5 items');
    expect(archiveSubtitle(18, true)).toBe('18 hidden');
  });
});
