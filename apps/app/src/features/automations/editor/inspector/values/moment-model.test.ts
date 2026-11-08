import { describe, expect, it } from 'vitest';
import { wrapsPastOneRow } from './literal-scalar';
import {
  dateList,
  daysText,
  kelvinRange,
  momentEditorOf,
  newBlock,
  nextFreeDay,
  replacedDate,
  storedBlocks,
  toggledDay,
  warmthOf,
  weekBlocks,
  withDate,
  withoutDate,
} from './moment-model';

describe('week grid blocks', () => {
  it('reads stored blocks and keeps their data', () => {
    const blocks = weekBlocks([{ at: '06:30', days: [1, 5], slot: { target: 21 } }]);
    expect(blocks).toEqual([{ at: '06:30', days: [1, 5], rest: { slot: { target: 21 } } }]);
    expect(storedBlocks(blocks)).toEqual([{ at: '06:30', days: [1, 5], slot: { target: 21 } }]);
  });

  it('writes no days for every day, and sorts the days it writes', () => {
    expect(storedBlocks([newBlock()])).toEqual([{ at: '07:00' }]);
    const block = { ...newBlock(), days: toggledDay(toggledDay([], 0), 3) };
    expect(storedBlocks([block])).toEqual([{ at: '07:00', days: [0, 3] }]);
  });

  it('toggles a day on and off', () => {
    expect(toggledDay([1, 2], 2)).toEqual([1]);
    expect(toggledDay([1], 6)).toEqual([1, 6]);
  });

  it('reads anything that is not a list as no blocks', () => {
    expect(weekBlocks(null)).toEqual([]);
    expect(weekBlocks(['x'])).toEqual([{ at: '07:00', days: [], rest: {} }]);
  });

  it('names the days from Monday', () => {
    expect(daysText([])).toBe('Every day');
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(daysText([0, 6, 1])).toBe('Mon, Sat, Sun');
  });
});

describe('date lists', () => {
  it('keeps only dates, sorted and without repeats', () => {
    expect(dateList(['2026-12-25', 4, null])).toEqual(['2026-12-25']);
    expect(withDate(['2026-12-25'], '2026-01-01')).toEqual(['2026-01-01', '2026-12-25']);
    expect(withDate(['2026-12-25'], '2026-12-25')).toEqual(['2026-12-25']);
  });

  it('changes and removes a date by its place', () => {
    const dates = ['2026-01-01', '2026-12-25'];
    expect(replacedDate(dates, 0, '2027-01-01')).toEqual(['2026-12-25', '2027-01-01']);
    expect(withoutDate(dates, 1)).toEqual(['2026-01-01']);
  });

  it('adds today, or the day after the last date when that is later', () => {
    expect(nextFreeDay([], '2026-10-25')).toBe('2026-10-25');
    expect(nextFreeDay(['2026-01-01'], '2026-10-25')).toBe('2026-10-25');
    expect(nextFreeDay(['2026-12-31'], '2026-10-25')).toBe('2027-01-01');
  });
});

describe('colour temperature', () => {
  it('names the warmth the way the light faces do', () => {
    expect(warmthOf(2700)).toBe('Warm');
    expect(warmthOf(4000)).toBe('Neutral');
    expect(warmthOf(6500)).toBe('Cool');
  });

  it('offers a slider only for a declared range and invents none', () => {
    expect(kelvinRange(2200, 6500)).toEqual({ min: 2200, max: 6500 });
    expect(kelvinRange(1, undefined)).toBeNull();
    expect(kelvinRange(undefined, undefined)).toBeNull();
  });
});

describe('choice layout', () => {
  it('switches to the picker only when the chips wrap past one row', () => {
    expect(wrapsPastOneRow({ width: 400, row: 44, height: 44 })).toBe(false);
    expect(wrapsPastOneRow({ width: 400, row: 44, height: 94 })).toBe(true);
    expect(wrapsPastOneRow({ width: 400, row: 0, height: 0 })).toBe(false);
  });
});

describe('momentEditorOf', () => {
  it('routes the schedule and kelvin editor ids to their own editors', () => {
    expect(momentEditorOf('week-grid')).toBe('week-grid');
    expect(momentEditorOf('date-list')).toBe('date-list');
    expect(momentEditorOf('kelvin')).toBe('kelvin');
  });

  it('leaves every other editor id to the base mapping', () => {
    expect(momentEditorOf('duration')).toBeNull();
    expect(momentEditorOf('colour')).toBeNull();
    expect(momentEditorOf('time-of-day')).toBeNull();
  });
});
