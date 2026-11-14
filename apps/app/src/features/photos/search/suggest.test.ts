import type { PlaceCountry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  dateCountOf,
  dateSuggestionsOf,
  lastSeasonToken,
  monthToken,
  type DateContext,
} from './dates';
import { cameraLabelOf, suggestionsOf, type SearchSources } from './suggest';
import { tryChipsOf } from './try-chips';

const DATES: DateContext = {
  today: '2026-11-07',
  southern: false,
  months: new Map([
    ['2026-07', 40],
    ['2026-08', 12],
    ['2026-05', 9],
    ['2025-05', 3],
  ]),
};

const PORTUGAL: PlaceCountry = {
  countryCode: 'PT',
  country: 'Portugal',
  count: 235,
  coverItemId: null,
  places: [
    {
      id: 1,
      name: 'Sintra',
      admin: 'Lisbon',
      country: 'Portugal',
      countryCode: 'PT',
      lat: 38.8,
      lon: -9.4,
      count: 204,
      coverItemId: null,
    },
    {
      id: 2,
      name: 'Sines',
      admin: null,
      country: 'Portugal',
      countryCode: 'PT',
      lat: 37.9,
      lon: -8.9,
      count: 31,
      coverItemId: null,
    },
  ],
};

const SOURCES: SearchSources = {
  countries: [PORTUGAL],
  albums: [{ id: '0b9e1d1a-8f6e-4a43-9a1c-0e4a3c1f2b11', title: 'Sintra hike', itemCount: 63 }],
  cameras: [
    { make: 'SONY', model: 'SONY ILCE-7M4', items: 900 },
    { make: 'Google', model: 'Pixel 9', items: 400 },
  ],
  photos: 1200,
  videos: 80,
  favourites: 12,
  dates: DATES,
};

describe('photo search suggestions', () => {
  it('suggests places, albums and cameras with their counts', () => {
    const groups = suggestionsOf('si', SOURCES, []);
    expect(groups.map((group) => group.id)).toStrictEqual(['places', 'albums']);
    expect(groups[0]?.items.map((item) => [item.token.label, item.count])).toStrictEqual([
      ['Sintra, Portugal', 204],
      ['Sines, Portugal', 31],
    ]);
    expect(groups[1]?.items[0]?.count).toBe(63);
  });

  it('matches without accents or case and leaves out tokens already chosen', () => {
    const country = { kind: 'country' as const, countryCode: 'PT', label: 'Portugal' };
    expect(suggestionsOf('PÓRT', SOURCES, [])[0]?.items[0]?.token).toStrictEqual(country);
    expect(suggestionsOf('port', SOURCES, [country])).toStrictEqual([]);
  });

  it('suggests kinds and favourites only when the library has them', () => {
    const none = { ...SOURCES, videos: 0 };
    expect(suggestionsOf('vid', SOURCES, [])[0]?.items[0]?.count).toBe(80);
    expect(suggestionsOf('vid', none, [])).toStrictEqual([]);
  });

  it('names cameras once even when the model repeats the maker', () => {
    expect(cameraLabelOf({ make: 'SONY', model: 'SONY ILCE-7M4', items: 1 })).toBe('SONY ILCE-7M4');
    expect(cameraLabelOf({ make: 'Google', model: 'Pixel 9', items: 1 })).toBe('Google Pixel 9');
    expect(cameraLabelOf({ make: null, model: null, items: 1 })).toBeNull();
  });
});

describe('date words', () => {
  it('reads last summer as the latest summer that has ended, in either hemisphere', () => {
    expect(lastSeasonToken('summer', DATES)).toMatchObject({
      from: '2026-06-01',
      to: '2026-08-31',
    });
    expect(lastSeasonToken('winter', DATES)).toMatchObject({
      from: '2025-12-01',
      to: '2026-02-28',
    });
    const south = { ...DATES, southern: true };
    expect(lastSeasonToken('summer', south)).toMatchObject({
      from: '2025-12-01',
      to: '2026-02-28',
    });
  });

  it('counts whole months from the library and leaves partial ranges uncounted', () => {
    expect(dateCountOf(lastSeasonToken('summer', DATES), DATES)).toBe(52);
    const week = dateSuggestionsOf('this w', DATES)[0];
    expect(week?.token).toMatchObject({ label: 'This week', from: '2026-11-02', to: '2026-11-07' });
    expect(week?.count).toBeNull();
  });

  it('suggests years and months the library holds, and never empty ones', () => {
    expect(dateSuggestionsOf('202', DATES).map((hit) => hit.token.label)).toStrictEqual([
      '2026',
      '2025',
    ]);
    expect(
      dateSuggestionsOf('may', DATES).map((hit) => [hit.token.label, hit.count]),
    ).toStrictEqual([
      ['May 2026', 9],
      ['May 2025', 3],
    ]);
    expect(dateSuggestionsOf('last autumn', DATES)).toStrictEqual([]);
    expect(monthToken(2024, 2)).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('try chips', () => {
  it('come from the library: last summer, this year’s videos, the top place and camera, favourites', () => {
    expect(tryChipsOf(SOURCES).map((chip) => chip.label)).toStrictEqual([
      'Last summer',
      'Videos from 2026',
      'Sintra',
      'SONY ILCE-7M4',
      'Favourites',
    ]);
  });

  it('are empty for an empty library', () => {
    const empty: SearchSources = {
      countries: [],
      albums: [],
      cameras: [],
      photos: 0,
      videos: 0,
      favourites: 0,
      dates: { ...DATES, months: new Map() },
    };
    expect(tryChipsOf(empty)).toStrictEqual([]);
  });
});
