import { describe, expect, it } from 'vitest';
import type { Memory, PhotoPlace, PlaceCountry } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import {
  clusterCovers,
  clusterLine,
  clusterSummary,
  countryGroups,
  feedMonths,
  feedTiles,
  libraryLine,
  placeMatches,
  placeMemoryOf,
  placesByCount,
  placesIn,
  sideCountries,
  spanLine,
  visitChips,
} from './place-model';

type Spot = Pick<PhotoPlace, 'id' | 'name' | 'count' | 'lat' | 'lon'>;

function place(spot: Spot): PhotoPlace {
  return { ...spot, admin: null, country: 'Portugal', countryCode: 'PT', coverItemId: null };
}

const LISBON = place({ id: 1, name: 'Lisbon', count: 842, lat: 38.7, lon: -9.1 });
const PORTO = place({ id: 2, name: 'Porto', count: 238, lat: 41.1, lon: -8.6 });
const TOKYO = {
  ...place({ id: 3, name: 'Tokyo', count: 512, lat: 35.7, lon: 139.7 }),
  country: 'Japan',
  countryCode: 'JP',
};

const COUNTRIES: readonly PlaceCountry[] = [
  { countryCode: 'JP', country: 'Japan', count: 512, coverItemId: null, places: [TOKYO] },
  {
    countryCode: 'PT',
    country: 'Portugal',
    count: 1080,
    coverItemId: null,
    places: [PORTO, LISBON],
  },
];

describe('places model', () => {
  it('sums the library line', () => {
    expect(libraryLine(COUNTRIES)).toBe('3 places in 2 countries · 1,592 photos have a location');
  });

  it('groups by country with the busiest first and shares against its top place', () => {
    const groups = countryGroups(COUNTRIES);
    expect(groups.map((group) => group.country.country)).toEqual(['Portugal', 'Japan']);
    expect(groups[0]?.rows.map((row) => [row.place.name, row.share])).toEqual([
      ['Lisbon', 1],
      ['Porto', 238 / 842],
    ]);
  });

  it('lists every place busiest first for the place cards', () => {
    expect(placesByCount(COUNTRIES).map((entry) => entry.name)).toEqual([
      'Lisbon',
      'Tokyo',
      'Porto',
    ]);
  });

  it('finds a place by its name or country, ignoring case and spaces', () => {
    expect(placeMatches(LISBON, '  lis ')).toBe(true);
    expect(placeMatches(TOKYO, 'JAPAN')).toBe(true);
    expect(placeMatches(PORTO, 'tokyo')).toBe(false);
  });

  it('groups the side list by the places in view until a search is typed', () => {
    const iberia = { west: -20, east: 0, south: 30, north: 50 };
    const inView = sideCountries(COUNTRIES, iberia, '');
    expect(inView.map((country) => country.country)).toEqual(['Portugal']);
    expect(inView[0]?.places.map((entry) => entry.name)).toEqual(['Porto', 'Lisbon']);
    const found = sideCountries(COUNTRIES, iberia, 'tok');
    expect(found.map((country) => country.places.map((entry) => entry.name))).toEqual([['Tokyo']]);
    expect(sideCountries(COUNTRIES, iberia, 'nowhere')).toEqual([]);
  });

  it('lists the places inside the view, busiest first', () => {
    const shown = placesIn(COUNTRIES, { west: -20, east: 0, south: 30, north: 50 });
    expect(shown.map((entry) => entry.name)).toEqual(['Lisbon', 'Porto']);
  });

  it('names a cluster by its place, its busiest place around, or as an area', () => {
    const cluster = {
      geohash: 'e',
      lat: 38.7,
      lon: -9.1,
      count: 9,
      coverItemId: '00000000-0000-4000-8000-000000000001',
    };
    expect(clusterSummary({ ...cluster, placeId: 2 }, COUNTRIES)).toEqual({
      title: 'Porto',
      places: '2 places',
    });
    expect(clusterSummary({ ...cluster, placeId: null }, COUNTRIES)).toEqual({
      title: 'Lisbon and around',
      places: '2 places',
    });
    expect(clusterSummary({ ...cluster, geohash: 'eycs', placeId: 1 }, COUNTRIES)).toEqual({
      title: 'Lisbon',
      places: null,
    });
    expect(clusterSummary({ ...cluster, geohash: 'u', placeId: null }, COUNTRIES)).toEqual({
      title: 'Photos in this area',
      places: null,
    });
  });

  it('fills the cluster card covers from the place and the places around it', () => {
    const first = '00000000-0000-4000-8000-000000000001';
    const second = '00000000-0000-4000-8000-000000000002';
    const third = '00000000-0000-4000-8000-000000000003';
    const fourth = '00000000-0000-4000-8000-000000000004';
    const cluster = {
      geohash: 'e',
      lat: 38.7,
      lon: -9.1,
      count: 1,
      coverItemId: first,
      placeId: 1,
    };
    const around: readonly PlaceCountry[] = [
      {
        countryCode: 'PT',
        country: 'Portugal',
        count: 1080,
        coverItemId: null,
        places: [
          { ...LISBON, coverItemId: first },
          { ...PORTO, coverItemId: fourth },
        ],
      },
    ];
    expect(clusterCovers(cluster, around, [first, second])).toEqual([first, second, fourth]);
    expect(clusterCovers(cluster, around, [second, third, fourth])).toEqual([first, second, third]);
    expect(clusterCovers(cluster, [], [])).toEqual([first]);
  });

  it('writes the cluster line with items, span and places', () => {
    const cluster = {
      geohash: 'e',
      lat: 38.7,
      lon: -9.1,
      count: 1284,
      coverItemId: '00000000-0000-4000-8000-000000000001',
      placeId: 1,
    };
    expect(clusterLine(cluster, '2021 to 2026 · 5 visits', null)).toBe(
      '1,284 items · 2021 to 2026 · 5 visits',
    );
    expect(clusterLine({ ...cluster, count: 1 }, null, '2 places')).toBe('1 item · 2 places');
  });

  it('makes newest first visit chips and the span line', () => {
    const buckets = [
      { month: '2019-06', count: 146 },
      { month: '2026-11', count: 412 },
    ];
    expect(visitChips(buckets).map((chip) => [chip.label, chip.count])).toEqual([
      ['Nov 2026', 412],
      ['Jun 2019', 146],
    ]);
    expect(spanLine(buckets)).toBe('2019 to 2026 · 2 visits');
    expect(spanLine([{ month: '2024-05', count: 1 }])).toBe('2024 · 1 visit');
  });

  it('feeds months newest first and keeps loaded tiles in that order', () => {
    const buckets = [
      { month: '2019-06', count: 1 },
      { month: '2026-11', count: 1 },
    ];
    expect(feedMonths(buckets, null)).toEqual(['2026-11', '2019-06']);
    expect(feedMonths(buckets, '2019-06')).toEqual(['2019-06']);
    const tile = (id: string): MediaTile => ({
      id,
      rev: 1,
      aspect: 1,
      takenAt: 0,
      offsetMin: null,
      durationMs: null,
      thumbhash: null,
      flags: 0,
      local: false,
    });
    const loaded = new Map([
      ['2019-06', { tiles: [tile('old')], more: null }],
      ['2026-11', { tiles: [tile('new')], more: null }],
    ]);
    expect(feedTiles(['2026-11', '2019-06'], loaded).map((entry) => entry.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('plays the latest trip or day out made at the place', () => {
    const base = { count: 40, coverItemId: '0b9f8a4e-0000-4000-8000-000000000001' };
    const memories: readonly Memory[] = [
      {
        ...base,
        id: 'trip:1',
        kind: 'trip',
        from: '2019-06-01',
        to: '2019-06-09',
        placeId: 1,
        placeName: 'Lisbon',
        distanceFromHomeKm: null,
        places: 1,
        perDay: [{ day: '2019-06-01', count: 1 }],
      },
      {
        ...base,
        id: 'day:2',
        kind: 'day_out',
        from: '2024-05-04',
        to: '2024-05-04',
        placeId: 1,
        placeName: 'Lisbon',
      },
      {
        ...base,
        id: 'day:3',
        kind: 'day_out',
        from: '2026-11-01',
        to: '2026-11-01',
        placeId: 2,
        placeName: 'Porto',
      },
      {
        ...base,
        id: 'otd:4',
        kind: 'on_this_day',
        yearsAgo: 1,
        from: '2025-11-07',
        to: '2025-11-07',
      },
    ];
    expect(placeMemoryOf(memories, 1)?.id).toBe('day:2');
    expect(placeMemoryOf(memories, 2)?.id).toBe('day:3');
    expect(placeMemoryOf(memories, 3)).toBeNull();
  });
});
