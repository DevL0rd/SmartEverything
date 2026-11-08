import { describe, expect, it } from 'vitest';
import type { Memory, Trip, YearInReview } from '@smarteverything/domain';
import {
  albumRequestOf,
  boardIsEmpty,
  boardOf,
  cardLine,
  heroLine,
  heroMark,
  memoryKicker,
  memoryTitle,
  peakMonth,
  weekMark,
  yearBars,
  yearBarsLabel,
  yearHighlights,
  type YearMemory,
} from './model';
import { dayCount, rangeText } from './text';

const COVER = '0b9f8a4e-0000-4000-8000-000000000001';

function months(counts: readonly number[]): YearInReview['perMonth'] {
  return counts.map((value, index) => ({
    month: `2025-${String(index + 1).padStart(2, '0')}`,
    count: value,
  }));
}

const REVIEW: YearInReview = {
  year: 2025,
  perMonth: months([210, 180, 340, 620, 710, 880, 1120, 1540, 900, 760, 1240, 892]),
  topPlaces: [{ placeId: 3, name: 'Lisbon', count: 900 }],
  topCameras: [{ name: 'Pixel 9', count: 4000 }],
  mostFavouritedMonth: '2025-08',
  longestDayOut: { day: '2025-06-14', count: 140 },
};

const HERO_3: Memory = {
  id: 'on_this_day:3',
  kind: 'on_this_day',
  yearsAgo: 3,
  from: '2023-11-07',
  to: '2023-11-07',
  count: 40,
  coverItemId: COVER,
};

const HERO_1: Memory = {
  ...HERO_3,
  id: 'on_this_day:1',
  yearsAgo: 1,
  from: '2025-11-07',
  to: '2025-11-07',
};

const DAY_OUT: Memory = {
  id: 'day_out:2026-11-05',
  kind: 'day_out',
  from: '2026-11-05',
  to: '2026-11-05',
  count: 9,
  coverItemId: COVER,
  placeId: 4,
  placeName: 'Sintra',
};

const WEEK: Memory = {
  id: 'this_week:2022',
  kind: 'this_week',
  from: '2022-11-02',
  to: '2022-11-05',
  count: 212,
  coverItemId: COVER,
};

const BURST: Extract<Memory, { readonly kind: 'burst' }> = {
  id: 'burst:x',
  kind: 'burst',
  stackId: COVER,
  from: '2026-11-02',
  to: '2026-11-02',
  count: 24,
  coverItemId: COVER,
};

const TRIP: Trip = {
  id: 'trip:2026-11-03',
  kind: 'trip',
  from: '2026-11-03',
  to: '2026-11-07',
  count: 204,
  coverItemId: COVER,
  placeId: 7,
  placeName: 'Lisbon and Sintra',
  distanceFromHomeKm: 1839.6,
  places: 3,
  perDay: [
    { day: '2026-11-03', count: 60 },
    { day: '2026-11-04', count: 44 },
    { day: '2026-11-05', count: 0 },
    { day: '2026-11-06', count: 70 },
    { day: '2026-11-07', count: 30 },
  ],
};

function year(review: YearInReview): YearMemory {
  return {
    id: `year:${String(review.year)}`,
    kind: 'year',
    from: `${String(review.year)}-01-01`,
    to: `${String(review.year)}-12-31`,
    count: 9412,
    coverItemId: COVER,
    review,
  };
}

describe('memory board', () => {
  it('pages on this day from the most recent year and keeps the latest closed year', () => {
    const board = boardOf(
      [HERO_3, year({ ...REVIEW, year: 2024 }), HERO_1, BURST, year(REVIEW), TRIP],
      true,
    );
    expect(board.hero.map((memory) => memory.yearsAgo)).toEqual([1, 3]);
    expect(board.week.map((memory) => memory.id)).toEqual(['burst:x']);
    expect(board.year?.review.year).toBe(2025);
  });

  it('leaves the year in review out when the setting is off', () => {
    expect(boardOf([year(REVIEW)], false).year).toBeNull();
  });

  it('is empty only when there are no memories and no trips', () => {
    const none = boardOf([], true);
    expect(boardIsEmpty(none, [])).toBe(true);
    expect(boardIsEmpty(none, [TRIP])).toBe(false);
    expect(boardIsEmpty(boardOf([BURST], true), [])).toBe(false);
  });
});

describe('memory text', () => {
  it('names each kind of memory', () => {
    expect(memoryTitle(HERO_3)).toBe('7 November 2023');
    expect(memoryKicker(HERO_3)).toBe('On this day · 3 years ago');
    expect(memoryKicker(HERO_1)).toBe('On this day · 1 year ago');
    expect(memoryTitle(BURST)).toBe('Burst of 24 shots');
    expect(memoryTitle(year(REVIEW))).toBe('Your 2025');
    expect(memoryTitle({ ...TRIP, placeName: null })).toBe('Trip from 3 to 7 Nov 2026');
  });

  it('writes day ranges across months and years', () => {
    expect(rangeText('2026-11-03', '2026-11-07')).toBe('3 to 7 Nov 2026');
    expect(rangeText('2026-10-30', '2026-11-02')).toBe('30 Oct to 2 Nov 2026');
    expect(rangeText('2025-12-30', '2026-01-02')).toBe('30 Dec 2025 to 2 Jan 2026');
    expect(rangeText('2026-11-03', '2026-11-03')).toBe('3 Nov 2026');
    expect(dayCount('2026-11-03', '2026-11-07')).toBe(5);
  });

  it('titles the week cards like the board shows them', () => {
    expect(weekMark(DAY_OUT)).toBe('Day out');
    expect(memoryTitle(DAY_OUT)).toBe('Sintra on Thursday');
    expect(cardLine(DAY_OUT)).toBe('Thu 5 Nov · 9 items');
    expect(memoryTitle({ ...DAY_OUT, placeName: null })).toBe('A day out on Thursday');
    expect(weekMark(BURST)).toBe('Burst');
    expect(cardLine(BURST)).toBe('Mon 2 Nov · 24 shots');
    expect(weekMark(WEEK)).toBe('This week');
    expect(memoryTitle(WEEK)).toBe('This week in 2022');
    expect(cardLine(WEEK)).toBe('212 items · 4 days');
  });

  it('marks the on this day hero by size', () => {
    expect(heroMark(HERO_3, false)).toBe('On this day');
    expect(heroMark(HERO_3, true)).toBe('On this day · 3 years ago');
    expect(heroLine(HERO_3)).toBe('40 items');
  });

  it('names a trip by its place', () => {
    expect(memoryTitle(TRIP)).toBe('Lisbon and Sintra');
  });
});

describe('year in review', () => {
  it('draws twelve month bars and names the peak', () => {
    const bars = yearBars(REVIEW);
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ key: '2025-01', value: 210, label: 'J' });
    expect(peakMonth(REVIEW)?.month).toBe('2025-08');
    expect(yearBarsLabel(REVIEW)).toBe('Photos and videos per month in 2025, August is the peak');
  });

  it('has no peak in a year without photos', () => {
    const empty = { ...REVIEW, perMonth: months(Array.from({ length: 12 }, () => 0)) };
    expect(peakMonth(empty)).toBeNull();
    expect(yearBarsLabel(empty)).toBe('Photos and videos per month in 2025');
  });

  it('lists only the highlights the hub found', () => {
    expect(yearHighlights(REVIEW).map((item) => `${item.label}: ${item.value}`)).toEqual([
      'Top place: Lisbon · 900',
      'Top camera: Pixel 9 · 4,000',
      'Most favourited: August',
      'Longest day out: Sat 14 Jun · 140 items',
    ]);
    const bare = {
      ...REVIEW,
      topPlaces: [],
      topCameras: [],
      mostFavouritedMonth: null,
      longestDayOut: null,
    };
    expect(yearHighlights(bare)).toEqual([]);
  });
});

describe('save as album', () => {
  it('saves a date memory as a smart album only you see', () => {
    expect(albumRequestOf(TRIP)).toEqual({
      kind: 'smart',
      title: 'Lisbon and Sintra',
      surface: 'photos',
      scope: 'person',
      rule: {
        match: 'all',
        rules: [
          { kind: 'date_range', field: 'takenAt', from: '2026-11-03', to: '2026-11-07' },
          { kind: 'item_kind', itemKinds: ['image', 'video'] },
        ],
      },
    });
  });

  it('offers no album for a burst, which is already one stack', () => {
    expect(albumRequestOf(BURST)).toBeNull();
  });
});
