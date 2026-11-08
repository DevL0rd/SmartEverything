import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RAW_EXTENSIONS } from '../../src/photos/insights';
import {
  RANKING_LENGTH,
  growthOf,
  monthsBetween,
  rangeFrom,
  seasonOf,
  twelveMonthsFrom,
} from '../../src/photos/insights-shapes';
import { TimelineReader } from '../../src/photos/timeline';
import {
  AT,
  BOB_ROOT,
  HOME_ROOT,
  alice,
  bob,
  context,
  insertPhone,
  itemId,
  owner,
  read,
  reader,
  seed,
  setup,
  teardown,
} from './insights-fixture';

beforeEach(setup);

afterEach(teardown);

describe('kinds', () => {
  it('splits photos, screenshots, RAW and videos with their bytes and agrees with the timeline', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', bytes: 100 });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', bytes: 50, name: 'Screenshot_1.png' });
    seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z', bytes: 300, name: 'IMG_1.DNG' });
    seed({ n: 4, takenAt: '2026-03-04T10:00:00.000Z', bytes: 1000, kind: 'video' });
    const insights = read('all_time');
    expect(insights.kinds).toEqual([
      { kind: 'photo', items: 1, bytes: 100 },
      { kind: 'screenshot', items: 1, bytes: 50 },
      { kind: 'raw', items: 1, bytes: 300 },
      { kind: 'video', items: 1, bytes: 1000 },
    ]);
    const timeline = new TimelineReader(context)
      .buckets(owner, { filter: 'all' })
      .reduce((sum, bucket) => sum + bucket.count, 0);
    expect(insights.items).toBe(timeline);
    expect(insights.bytes).toBe(1450);
  });

  it('recognises every RAW extension in any case', () => {
    RAW_EXTENSIONS.forEach((extension, index) =>
      seed({
        n: index + 1,
        takenAt: '2026-03-01T10:00:00.000Z',
        name: `A.${extension.toUpperCase()}`,
      }),
    );
    expect(read('all_time').kinds.find((one) => one.kind === 'raw')?.items).toBe(
      RAW_EXTENSIONS.length,
    );
  });

  it('returns every kind with zero when the library is empty', () => {
    const insights = read('all_time');
    expect(insights.kinds.map((one) => one.items)).toEqual([0, 0, 0, 0]);
    expect(insights.growth).toBeNull();
    expect(insights.weekdayByHour).toHaveLength(168);
    expect(insights.seasonByHour).toHaveLength(96);
  });
});

describe('ranges', () => {
  beforeEach(() => {
    seed({ n: 1, takenAt: '2024-05-01T10:00:00.000Z' });
    seed({ n: 2, takenAt: '2025-10-31T10:00:00.000Z' });
    seed({ n: 3, takenAt: '2025-12-15T10:00:00.000Z' });
    seed({ n: 4, takenAt: '2026-02-15T10:00:00.000Z' });
  });

  it('this year starts on 1 January', () => {
    expect(read('this_year').items).toBe(1);
  });

  it('last 12 months starts on the first of the month eleven months back', () => {
    expect(twelveMonthsFrom('2026-11-07')).toBe('2025-12-01');
    expect(rangeFrom('last_12_months', '2026-01-31')).toBe('2025-02-01');
    expect(read('last_12_months').items).toBe(2);
  });

  it('all time holds everything', () => {
    expect(read('all_time').items).toBe(4);
  });
});

describe('history', () => {
  it('returns only counts until two whole months of photos exist', () => {
    seed({ n: 1, takenAt: '2026-10-01T10:00:00.000Z', kind: 'video', durationMs: 3_600_000 });
    seed({ n: 2, takenAt: '2026-11-01T10:00:00.000Z' });
    const insights = read('all_time');
    expect(insights.items).toBe(2);
    expect(insights.growth).toBeNull();
    expect(insights.hoursAddedPerMonth).toBeNull();
  });

  it('returns growth by kind and hours per month once two months exist, filling quiet months', () => {
    seed({ n: 1, takenAt: '2026-01-10T10:00:00.000Z', bytes: 10 });
    seed({
      n: 2,
      takenAt: '2026-02-10T10:00:00.000Z',
      kind: 'video',
      bytes: 40,
      durationMs: 5_400_000,
    });
    seed({ n: 3, takenAt: '2026-04-10T10:00:00.000Z', bytes: 20 });
    const insights = read('all_time');
    expect(insights.hoursAddedPerMonth).toEqual([
      { month: '2026-01', hours: 0 },
      { month: '2026-02', hours: 1.5 },
      { month: '2026-03', hours: 0 },
      { month: '2026-04', hours: 0 },
    ]);
    const photos = insights.growth?.filter((row) => row.kind === 'photo');
    expect(photos?.map((row) => [row.month, row.items, row.bytes])).toEqual([
      ['2026-01', 1, 10],
      ['2026-02', 1, 10],
      ['2026-03', 1, 10],
      ['2026-04', 2, 30],
    ]);
    expect(insights.growth?.filter((row) => row.kind === 'video').at(-1)).toMatchObject({
      items: 1,
      bytes: 40,
    });
  });

  it('counts months inclusively and accumulates running totals', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(growthOf([], ['2026-01'])).toHaveLength(4);
  });
});

describe('cameras, lenses and folders', () => {
  it('ranks cameras and lenses and skips items without camera data', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', make: 'Canon', model: 'R5', lens: '24mm' });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', make: 'Canon', model: 'R5', lens: '24mm' });
    seed({
      n: 3,
      takenAt: '2026-03-03T10:00:00.000Z',
      make: 'Google',
      model: 'Pixel 9',
      lens: '5x',
    });
    seed({ n: 4, takenAt: '2026-03-04T10:00:00.000Z' });
    const insights = read('all_time');
    expect(insights.cameras).toEqual([
      { make: 'Canon', model: 'R5', items: 2 },
      { make: 'Google', model: 'Pixel 9', items: 1 },
    ]);
    expect(insights.lenses).toEqual([
      { name: '24mm', items: 2 },
      { name: '5x', items: 1 },
    ]);
  });

  it('splits photo and video bytes per library folder', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', bytes: 5 });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', kind: 'video', bytes: 70 });
    seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z', root: BOB_ROOT, bytes: 9 });
    expect(read('all_time').roots).toEqual([
      { rootId: HOME_ROOT, photos: 1, videos: 1, photoBytes: 5, videoBytes: 70 },
      { rootId: BOB_ROOT, photos: 1, videos: 0, photoBytes: 9, videoBytes: 0 },
    ]);
  });
});

describe('videos', () => {
  it('totals videos, buckets durations and lists the largest first', () => {
    seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      kind: 'video',
      bytes: 10,
      durationMs: 30_000,
    });
    seed({
      n: 2,
      takenAt: '2026-03-02T10:00:00.000Z',
      kind: 'video',
      bytes: 90,
      durationMs: 120_000,
    });
    seed({
      n: 3,
      takenAt: '2026-03-03T10:00:00.000Z',
      kind: 'video',
      bytes: 50,
      durationMs: 4_000_000,
    });
    const insights = read('all_time');
    expect(insights.videoTotals).toEqual({
      items: 3,
      bytes: 150,
      durationMs: 4_150_000,
      longestMs: 4_000_000,
    });
    expect(insights.durationBuckets).toEqual([
      { bucket: 'under_1m', items: 1, bytes: 10 },
      { bucket: '1_to_10m', items: 1, bytes: 90 },
      { bucket: '10_to_60m', items: 0, bytes: 0 },
      { bucket: 'over_60m', items: 1, bytes: 50 },
    ]);
    expect(insights.largestVideos.map((one) => one.itemId)).toEqual([
      itemId(2),
      itemId(3),
      itemId(1),
    ]);
  });

  it('keeps the ranking length for largest videos and busiest days', () => {
    for (let n = 1; n <= RANKING_LENGTH + 3; n += 1) {
      seed({
        n,
        takenAt: `2026-03-${String(n).padStart(2, '0')}T10:00:00.000Z`,
        kind: 'video',
        bytes: n,
      });
    }
    const insights = read('all_time');
    expect(insights.largestVideos).toHaveLength(RANKING_LENGTH);
    expect(insights.busiestDays).toHaveLength(RANKING_LENGTH);
  });
});

describe('days and clock', () => {
  it('lists busiest days by count then earliest and the calendar of the past twelve months', () => {
    seed({ n: 1, takenAt: '2025-01-05T10:00:00.000Z' });
    seed({ n: 2, takenAt: '2026-03-05T10:00:00.000Z' });
    seed({ n: 3, takenAt: '2026-03-05T11:00:00.000Z' });
    seed({ n: 4, takenAt: '2026-03-06T11:00:00.000Z' });
    const insights = read('all_time');
    expect(insights.busiestDays).toEqual([
      { day: '2026-03-05', items: 2 },
      { day: '2025-01-05', items: 1 },
      { day: '2026-03-06', items: 1 },
    ]);
    expect(insights.perDay).toEqual([
      { day: '2026-03-05', items: 2 },
      { day: '2026-03-06', items: 1 },
    ]);
  });

  it('uses the capture offset for the local day and hour', () => {
    seed({ n: 1, takenAt: '2026-03-07T23:30:00.000Z', offset: 120 });
    const insights = read('all_time');
    expect(insights.busiestDays).toEqual([{ day: '2026-03-08', items: 1 }]);
    const cell = insights.weekdayByHour.find((one) => one.items > 0);
    expect(cell).toEqual({ weekday: 6, hour: 1, items: 1 });
  });

  it('numbers weekdays from Monday and fills every cell', () => {
    seed({ n: 1, takenAt: '2026-03-02T09:00:00.000Z' });
    seed({ n: 2, takenAt: '2026-03-08T09:00:00.000Z' });
    const cells = read('all_time').weekdayByHour;
    expect(cells.find((one) => one.weekday === 0 && one.hour === 9)?.items).toBe(1);
    expect(cells.find((one) => one.weekday === 6 && one.hour === 9)?.items).toBe(1);
    expect(cells.reduce((sum, one) => sum + one.items, 0)).toBe(2);
  });

  it('puts months in seasons and flips them below the equator', () => {
    expect(seasonOf(12, null)).toBe('winter');
    expect(seasonOf(1, null)).toBe('winter');
    expect(seasonOf(4, null)).toBe('spring');
    expect(seasonOf(7, null)).toBe('summer');
    expect(seasonOf(10, null)).toBe('autumn');
    const south = { latitude: -33.9, longitude: 151.2 };
    expect(seasonOf(7, south)).toBe('winter');
    expect(seasonOf(1, south)).toBe('summer');
    expect(seasonOf(4, south)).toBe('autumn');
    expect(seasonOf(10, south)).toBe('spring');
  });

  it('counts photos by season and hour for the home hemisphere', () => {
    seed({ n: 1, takenAt: '2026-07-10T20:00:00.000Z' });
    const north = reader.read(owner, 'all_time', AT).seasonByHour;
    expect(north.find((one) => one.items > 0)).toEqual({ season: 'summer', hour: 20, items: 1 });
    const south = reader.read(owner, 'all_time', {
      today: AT.today,
      home: { latitude: -30, longitude: 150 },
    }).seasonByHour;
    expect(south.find((one) => one.items > 0)).toEqual({ season: 'winter', hour: 20, items: 1 });
  });
});

describe('places and backup', () => {
  it('counts places and countries from the located photos', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', placeId: '1001' });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', placeId: '1001' });
    seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z', placeId: '1002' });
    seed({ n: 4, takenAt: '2026-03-04T10:00:00.000Z', placeId: '1003' });
    seed({ n: 5, takenAt: '2026-03-05T10:00:00.000Z' });
    expect(read('all_time').places).toEqual({
      places: 3,
      countries: [
        { countryCode: 'PT', country: 'Portugal', items: 3 },
        { countryCode: 'JP', country: 'Japan', items: 1 },
      ],
    });
  });

  it('reports backup coverage for the caller’s phones only', () => {
    insertPhone(alice.profileId, 'Pixel', ['verified', 'verified', 'uploaded', 'failed']);
    insertPhone(bob.profileId, 'Galaxy', ['verified']);
    expect(read('all_time', alice).backupCoverage).toMatchObject([
      { name: 'Pixel', backedUp: 2, total: 4 },
    ]);
    expect(read('all_time', bob).backupCoverage).toHaveLength(1);
  });

  it('lists a phone with nothing uploaded yet at zero', () => {
    insertPhone(alice.profileId, 'Pixel', []);
    expect(read('all_time', alice).backupCoverage[0]).toMatchObject({ backedUp: 0, total: 0 });
  });
});

describe('member scope', () => {
  it('never counts another person’s folder for a member', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', root: BOB_ROOT, make: 'Secret', model: 'X' });
    expect(read('all_time', alice).items).toBe(1);
    expect(read('all_time', alice).cameras).toEqual([]);
    expect(read('all_time', bob).items).toBe(2);
    expect(read('all_time', owner).items).toBe(2);
  });
});
