import { describe, expect, it } from 'vitest';
import type { Memory } from '@smarteverything/domain';
import type { HeroMemory } from '../memories/model';
import {
  boardTilesOf,
  coverLabel,
  dayMonthText,
  fromYearsText,
  heroesOf,
  memoriesText,
  onThisDayOf,
  sideLabel,
  tileLabel,
} from './memories-model';

const COVER = '0b9f8a4e-0000-4000-8000-000000000001';

function hero(yearsAgo: number, count: number): HeroMemory {
  const year = 2026 - yearsAgo;
  return {
    id: `on_this_day:${String(yearsAgo)}`,
    kind: 'on_this_day',
    yearsAgo,
    from: `${String(year)}-11-07`,
    to: `${String(year)}-11-07`,
    count,
    coverItemId: COVER,
  };
}

const WEEK: Memory = {
  id: 'this_week:2024',
  kind: 'this_week',
  from: '2024-11-03',
  to: '2024-11-09',
  count: 12,
  coverItemId: COVER,
};

const TRIP: Memory = {
  id: 'trip:1',
  kind: 'trip',
  from: '2025-04-01',
  to: '2025-04-08',
  count: 300,
  coverItemId: COVER,
  placeId: 7,
  placeName: 'Japan',
  distanceFromHomeKm: 9000,
  places: 1,
  perDay: [{ day: '2025-04-01', count: 1 }],
};

const DAY_OUT: Memory = {
  id: 'day_out:1',
  kind: 'day_out',
  from: '2026-10-12',
  to: '2026-10-12',
  count: 30,
  coverItemId: COVER,
  placeId: null,
  placeName: null,
};

const YEAR: Memory = {
  id: 'year:2025',
  kind: 'year',
  from: '2025-01-01',
  to: '2025-12-31',
  count: 9000,
  coverItemId: COVER,
  review: {
    year: 2025,
    perMonth: Array.from({ length: 12 }, (_, index) => ({
      month: `2025-${String(index + 1).padStart(2, '0')}`,
      count: 10,
    })),
    topPlaces: [],
    topCameras: [],
    mostFavouritedMonth: null,
    longestDayOut: null,
  },
};

describe('on this day', () => {
  const heroes = heroesOf([hero(5, 10), WEEK, hero(1, 20), hero(3, 28)]);

  it('orders the years from the most recent and leaves other memories out', () => {
    expect(heroes.map((memory) => memory.yearsAgo)).toEqual([1, 3, 5]);
  });

  it('puts the picked year on the cover and the next years beside it', () => {
    const day = onThisDayOf(heroes, 1);
    expect(day?.cover.yearsAgo).toBe(3);
    expect(day?.sides.map((memory) => memory.yearsAgo)).toEqual([5, 1]);
    expect(day?.index).toBe(1);
  });

  it('counts every item across every year', () => {
    const day = onThisDayOf(heroes, 0);
    expect(day?.total).toBe(58);
    expect(fromYearsText(58, 3)).toBe('58 items from 3 years');
    expect(fromYearsText(1, 1)).toBe('1 item from 1 year');
  });

  it('shows one year alone without side tiles', () => {
    const day = onThisDayOf([hero(2, 4)], 0);
    expect(day?.sides).toEqual([]);
  });

  it('keeps the pick inside the years when the memories change', () => {
    expect(onThisDayOf(heroes, 9)?.index).toBe(2);
    expect(onThisDayOf([], 0)).toBeNull();
  });

  it('labels the cover with its year and age and the sides with the year', () => {
    expect(coverLabel(hero(3, 1))).toBe('2023 · 3 years ago');
    expect(sideLabel(hero(1, 1))).toBe('2025');
    expect(dayMonthText('2023-11-07')).toBe('7 November');
  });
});

describe('memories board', () => {
  it('leads with on this day, then the week, days out, trips and the year', () => {
    const tiles = boardTilesOf([YEAR, TRIP, hero(4, 2), DAY_OUT, WEEK, hero(2, 2)], true);
    expect(tiles.map((memory) => memory.id)).toEqual([
      'on_this_day:2',
      'on_this_day:4',
      'this_week:2024',
      'day_out:1',
      'trip:1',
      'year:2025',
    ]);
  });

  it('leaves the year out when year in review is off', () => {
    expect(boardTilesOf([YEAR, TRIP], false).map((memory) => memory.id)).toEqual(['trip:1']);
  });

  it('names each tile by its kind', () => {
    expect([hero(1, 1), WEEK, DAY_OUT, TRIP, YEAR].map(tileLabel)).toEqual([
      'On this day',
      'This week',
      'Day out',
      'Trip: Japan',
      'Your 2025',
    ]);
    expect(memoriesText(1)).toBe('1 memory');
    expect(memoriesText(6)).toBe('6 memories');
  });
});
