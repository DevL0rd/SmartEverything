import type { PhotoInsights } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  durationChipsOf,
  lengthText,
  hoursBarsOf,
  hoursLabelOf,
  peakHoursText,
  videoLineOf,
  videoStatsOf,
  watchingText,
  type HoursAdded,
} from './video-model';

const HOUR_MS = 3_600_000;

function insightsOf(partial: Partial<PhotoInsights>): PhotoInsights {
  return {
    range: 'all_time',
    items: 0,
    bytes: 0,
    kinds: [],
    growth: null,
    cameras: [],
    lenses: [],
    roots: [],
    largestVideos: [],
    videoTotals: { items: 0, bytes: 0, durationMs: 0, longestMs: null },
    durationBuckets: [],
    hoursAddedPerMonth: null,
    busiestDays: [],
    perDay: [],
    weekdayByHour: [],
    seasonByHour: [],
    places: { places: 0, countries: [] },
    backupCoverage: [],
    ...partial,
  };
}

const LIBRARY = insightsOf({
  videoTotals: {
    items: 2318,
    bytes: 286 * 1024 ** 3,
    durationMs: 61 * HOUR_MS + 12 * 60_000,
    longestMs: 48 * 60_000 + 10_000,
  },
  durationBuckets: [
    { bucket: 'under_1m', items: 1604, bytes: 1 },
    { bucket: '1_to_10m', items: 652, bytes: 1 },
    { bucket: '10_to_60m', items: 62, bytes: 1 },
    { bucket: 'over_60m', items: 0, bytes: 0 },
  ],
});

const HOURS: HoursAdded = [
  { month: '2026-03', hours: 2.4 },
  { month: '2026-04', hours: 9.4 },
  { month: '2026-05', hours: 0 },
];

describe('the Videos figures', () => {
  it('reads the stat tiles from the library video totals', () => {
    const stats = videoStatsOf(LIBRARY);
    expect(stats.videos).toBe('2,318');
    expect(stats.totalTime).toBe('61 h 12 min');
    expect(stats.watching).toMatch(/^about 2\.\d days of watching$/);
    expect(stats.size).toMatch(/B$/);
    expect(stats.longest).toBe('48:10');
    expect(videoStatsOf(insightsOf({})).longest).toBeNull();
  });

  it('says days of watching only from a full day of video', () => {
    expect(watchingText(23 * 60 * 60_000)).toBeNull();
    expect(watchingText(41 * 60 * 60_000)).toBe('about 1.7 days of watching');
  });

  it('writes the subtitle only when there are videos', () => {
    expect(videoLineOf(LIBRARY)).toMatch(/^2,318 videos · 61 h 12 min · /);
    expect(videoLineOf(insightsOf({}))).toBeNull();
    expect(videoLineOf(undefined)).toBeNull();
  });

  it('offers All plus every length that has videos, with their counts', () => {
    expect(durationChipsOf(LIBRARY)).toEqual([
      { bucket: null, label: 'Any length', count: 2318 },
      { bucket: 'under_1m', label: 'Under 1 min', count: 1604 },
      { bucket: '1_to_10m', label: '1 to 10 min', count: 652 },
      { bucket: '10_to_60m', label: '10 to 60 min', count: 62 },
    ]);
  });

  it('draws one bar per month and names the peak', () => {
    expect(hoursBarsOf(HOURS).map((bar) => [bar.key, bar.value])).toEqual([
      ['2026-03', 2.4],
      ['2026-04', 9.4],
      ['2026-05', 0],
    ]);
    expect(peakHoursText(HOURS)).toBe('Peak April, 9.4 h');
    expect(hoursLabelOf(HOURS)).toContain('April is the peak');
  });

  it('names no peak when no video was added', () => {
    const none: HoursAdded = [{ month: '2026-05', hours: 0 }];
    expect(peakHoursText(none)).toBeNull();
    expect(hoursLabelOf(none)).not.toContain('peak');
  });

  it('writes lengths in seconds, minutes and hours without days', () => {
    expect(lengthText(42_000)).toBe('42 s');
    expect(lengthText(41 * 60_000)).toBe('41 min');
    expect(lengthText(66 * 60_000)).toBe('1 h 6 min');
    expect(lengthText(2 * HOUR_MS)).toBe('2 h');
  });
});

describe('the video month heads', () => {
  it('read the month total from the Library buckets', async () => {
    const { bucketMonthTotal } = await import('./video-model');
    const total = bucketMonthTotal([{ month: '2026-11', count: 24 }]);
    expect(total('2026-11')).toBe(24);
    expect(total('2026-10')).toBeNull();
  });
});
