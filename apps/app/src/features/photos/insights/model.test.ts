import { PHOTO_INSIGHTS, type PhotoInsights } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import {
  busiestLine,
  calendarFrom,
  heatDays,
  partOfDay,
  seasonLine,
  seasonMatrix,
  weekLine,
  weekMatrix,
  youngLibrary,
} from './heat-model';
import { cameraName, coverageRows, folderBars, largestNote } from './lists-model';
import {
  addedLine,
  growthSeries,
  growthTicks,
  kindSlices,
  phaseOf,
  photoShare,
  placesLine,
  rangeOptions,
  statItems,
  videoTime,
} from './model';

const ROOT_A = '00000000-0000-4000-8000-00000000000a';
const ROOT_B = '00000000-0000-4000-8000-00000000000b';
const PHONE = '00000000-0000-4000-8000-0000000000c1';

function insights(overrides: Partial<PhotoInsights> = {}): PhotoInsights {
  return PHOTO_INSIGHTS.parse({
    range: 'all_time',
    items: 100,
    bytes: 4_000,
    kinds: [
      { kind: 'photo', items: 70, bytes: 1_000 },
      { kind: 'screenshot', items: 10, bytes: 100 },
      { kind: 'raw', items: 5, bytes: 900 },
      { kind: 'video', items: 15, bytes: 2_000 },
    ],
    growth: [
      { month: '2025-01', kind: 'photo', items: 10, bytes: 100 },
      { month: '2025-01', kind: 'video', items: 1, bytes: 300 },
      { month: '2026-03', kind: 'photo', items: 70, bytes: 1_000 },
      { month: '2026-03', kind: 'raw', items: 5, bytes: 900 },
      { month: '2026-03', kind: 'video', items: 15, bytes: 2_000 },
    ],
    cameras: [],
    lenses: [],
    roots: [],
    largestVideos: [],
    videoTotals: { items: 15, bytes: 2_000, durationMs: 42_000_000, longestMs: 7_200_000 },
    durationBuckets: [],
    hoursAddedPerMonth: null,
    busiestDays: [{ day: '2026-04-19', items: 214 }],
    perDay: [],
    weekdayByHour: [],
    seasonByHour: [],
    places: { places: 18, countries: [{ countryCode: 'PT', country: 'Portugal', items: 9 }] },
    backupCoverage: [{ deviceId: PHONE, name: 'Pixel 9', backedUp: 66, total: 100 }],
    ...overrides,
  });
}

const COUNTS = {
  library: 400,
  albums: 0,
  places: 18,
  favourites: 10,
  videos: 15,
  screenshots: 10,
  duplicates: 0,
  backupDevices: 1,
  deleted: 0,
};

describe('Insights stat tiles', () => {
  it('shows the six tiles with their notes once rail counts are known', () => {
    const items = statItems(insights(), COUNTS);
    expect(items.map((item) => item.label)).toEqual([
      'Items',
      'Library size',
      'Video time',
      'Places',
      'Favourites',
      'Backed up',
    ]);
    expect(items[0]?.caption).toBe('85 photos · 15 videos');
    expect(items[2]?.value).toBe('11 h 40');
    expect(items[3]?.caption).toBe('1 country');
    expect(items[4]).toMatchObject({ value: '2.5\u00a0%', caption: '10 photos' });
    expect(items[5]).toMatchObject({ value: '66.0\u00a0%', caption: '34 left on 1 phone' });
  });

  it('leaves out favourites before counts load and backup when no phone backs up', () => {
    const items = statItems(insights({ backupCoverage: [] }), undefined);
    expect(items.map((item) => item.key)).toEqual(['items', 'size', 'video', 'places']);
  });

  it('says how much the newest month added to the library', () => {
    expect(addedLine(insights().growth)).toMatch(/^\+.* in Mar$/u);
    expect(addedLine(null)).toBeUndefined();
  });

  it('counts places and countries on the Places card', () => {
    expect(placesLine(insights().places)).toBe('18 places · 1 country');
    expect(placesLine({ places: 1, countries: [] })).toBe('1 place · 0 countries');
  });

  it('writes video time in hours and minutes', () => {
    expect(videoTime(0)).toBe('0 min');
    expect(videoTime(3_600_000)).toBe('1 h');
    expect(videoTime(45 * 60_000)).toBe('45 min');
  });
});

describe('Insights phases and ranges', () => {
  it('tells an empty library from an empty range', () => {
    const none = insights({ items: 0, bytes: 0, kinds: [] });
    expect(phaseOf(none, 0)).toBe('empty');
    expect(phaseOf(none, undefined)).toBe('empty');
    expect(phaseOf(none, 12)).toBe('range-empty');
    expect(phaseOf(insights(), 12)).toBe('shown');
  });

  it('shortens the twelve month label on phones but keeps it spoken in full', () => {
    expect(rangeOptions(true)[1]).toEqual({
      value: 'last_12_months',
      label: '12 months',
      spoken: 'Last 12 months',
    });
    expect(rangeOptions(false)[1]?.label).toBe('Last 12 months');
  });
});

describe('Insights kinds and growth', () => {
  it('shades screenshots and RAW from the photo colour and keeps videos apart', () => {
    const slices = kindSlices(insights());
    expect(slices.map((slice) => [slice.label, slice.colour, slice.shade])).toEqual([
      ['Photos', 'viz-1', 1],
      ['Videos', 'viz-3', 1],
      ['Screenshots', 'viz-1', 0.62],
      ['RAW', 'viz-1', 0.34],
    ]);
    expect(photoShare(insights())).toBe('70\u00a0%');
  });

  it('adds every photo kind into the photos line and ticks years across the span', () => {
    const [photos, videos] = growthSeries(insights().growth ?? []);
    expect(photos?.values).toEqual([
      { key: '2025-01', value: 100 },
      { key: '2026-03', value: 1_900 },
    ]);
    expect(videos?.latest).toBe(2_000);
    expect(growthTicks(insights().growth ?? [])).toEqual(['2025', '2026']);
  });
});

describe('Insights heatmaps', () => {
  it('fills every day of the window and bins days against the busiest one', () => {
    const days = heatDays(
      [
        { day: '2026-11-01', items: 8 },
        { day: '2026-11-03', items: 2 },
      ],
      '2026-11-01',
      '2026-11-04',
    );
    expect(days.map((day) => [day.day, day.pages, day.level])).toEqual([
      ['2026-11-01', 8, 4],
      ['2026-11-02', 0, 0],
      ['2026-11-03', 2, 1],
      ['2026-11-04', 0, 0],
    ]);
  });

  it('starts the calendar at January for this year and twelve months back otherwise', () => {
    expect(calendarFrom('this_year', '2026-11-07')).toBe('2026-01-01');
    expect(calendarFrom('all_time', '2026-11-07')).toBe('2025-12-01');
    expect(calendarFrom('this_year', '2026-03-02')).toBe('2026-01-01');
  });

  it('puts Monday first and seasons from winter to autumn', () => {
    const week = weekMatrix([{ weekday: 5, hour: 15, items: 9 }]);
    expect(week[5]?.[15]).toBe(9);
    expect(weekLine(week)).toBe('Most photos on Saturday afternoons');
    const seasons = seasonMatrix([{ season: 'summer', hour: 19, items: 4 }]);
    expect(seasons[2]?.[19]).toBe(4);
    expect(seasonLine(seasons)).toBe('Most photos around 19:00 in summer');
    expect(weekLine(weekMatrix([]))).toBeNull();
  });

  it('names parts of the day and the busiest day', () => {
    expect([3, 8, 13, 18, 22].map(partOfDay)).toEqual([
      'nights',
      'mornings',
      'afternoons',
      'evenings',
      'nights',
    ]);
    expect(busiestLine(insights().busiestDays)).toMatch(/^Busiest day .+, 214 photos$/u);
    expect(busiestLine([])).toBeNull();
  });

  it('measures a young range against two months from its first day', () => {
    const young = youngLibrary([{ day: '2026-10-01', items: 3 }], '2026-10-31');
    expect(young?.days).toBe(30);
    expect(young?.share).toBeGreaterThan(0.45);
    expect(young?.share).toBeLessThan(0.55);
    expect(youngLibrary([], '2026-10-31')).toBeNull();
  });
});

describe('Insights lists', () => {
  it('names cameras without repeating the maker', () => {
    expect(cameraName('Google', 'Pixel 9')).toBe('Google Pixel 9');
    expect(cameraName('Sony', 'Sony A7 IV')).toBe('Sony A7 IV');
    expect(cameraName(null, null)).toBe('Unknown camera');
    expect(cameraName('Canon', null)).toBe('Canon');
  });

  it('ranks library folders by size with bars scaled to the largest', () => {
    const bars = folderBars(
      [
        { rootId: ROOT_A, photos: 1, videos: 0, photoBytes: 10, videoBytes: 0 },
        { rootId: ROOT_B, photos: 2, videos: 3, photoBytes: 20, videoBytes: 30 },
      ],
      (rootId) => (rootId === ROOT_A ? 'Pictures' : 'Managed'),
    );
    expect(bars.rows.map((row) => row.label)).toEqual(['Managed', 'Pictures']);
    expect(bars.scale).toBe(50);
    expect(bars.rows[0]?.note).toBe(`${bytes(20)} photos · ${bytes(30)} videos`);
    expect(bars.summary).toMatch(/ in 2 folders$/u);
  });

  it('shows how far each phone is backed up', () => {
    const [row] = coverageRows([{ deviceId: PHONE, name: 'Pixel 9', backedUp: 3, total: 3 }]);
    expect(row).toMatchObject({ progress: 1, value: '100\u00a0%', note: 'Up to date' });
    expect(largestNote({ itemId: PHONE, bytes: 2048, durationMs: null })).toBe(bytes(2048));
  });
});
