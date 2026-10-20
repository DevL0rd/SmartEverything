import { CONVERT_UNITS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { UNIT_SCALES } from '../../../src/nodes/pure/math-more';
import { HOME, bad, good } from './support';

describe('logic.xor, logic.count_true', () => {
  it('xor is true for exactly one true flag', () => {
    expect(good('logic.xor', { flags: [true, false, false] })).toEqual({ result: true });
    expect(good('logic.xor', { flags: [true, true] })).toEqual({ result: false });
    expect(good('logic.xor', { flags: [] })).toEqual({ result: false });
    bad('logic.xor', { flags: [1] }, 'TypeError');
  });

  it('count_true compares the count with the limits and reports the count', () => {
    expect(good('logic.count_true', { flags: [true, true, false], atLeast: 2 })).toEqual({
      result: true,
      count: 2,
    });
    expect(good('logic.count_true', { flags: [true, true, false], atLeast: 3 })['result']).toBe(
      false,
    );
    expect(good('logic.count_true', { flags: [true, true], atLeast: 1, atMost: 1 })['result']).toBe(
      false,
    );
  });

  it('count_true wants at least one flag by default', () => {
    expect(good('logic.count_true', { flags: [false] })).toEqual({ result: false, count: 0 });
    expect(good('logic.count_true', { flags: [false, true] })).toEqual({ result: true, count: 1 });
  });
});

describe('logic.day_type', () => {
  it('reads the day in the home time zone, not in UTC', () => {
    const fridayInUtc = '2026-10-16T18:30:00.000Z';
    expect(good('logic.day_type', { date: fridayInUtc, is: 'weekend' })['result']).toBe(true);
    expect(good('logic.day_type', { date: fridayInUtc, is: 'weekday' })['result']).toBe(false);
    expect(
      good('logic.day_type', { date: '2026-10-19T12:00:00.000Z', is: 'weekday' })['result'],
    ).toBe(true);
  });

  it('uses now when no moment is given', () => {
    expect(good('logic.day_type', { is: 'weekend' })['result']).toBe(true);
  });

  it('matches the listed dates and refuses dates that are not on the calendar', () => {
    expect(good('logic.day_type', { is: 'listed', dates: ['2026-10-18'] })['result']).toBe(true);
    expect(good('logic.day_type', { is: 'listed', dates: ['2026-10-19'] })['result']).toBe(false);
    expect(good('logic.day_type', { is: 'listed' })['result']).toBe(false);
    bad('logic.day_type', { is: 'listed', dates: ['2026-02-30'] }, 'Invalid');
    bad('logic.day_type', { is: 'listed', dates: ['soon'] }, 'TypeError');
    bad('logic.day_type', { is: 'holiday' }, 'Invalid');
  });
});

describe('logic.in_schedule', () => {
  const officeSlot = { days: ['mon'], from: '09:00', to: '17:00' };
  const nightSlot = { days: ['fri'], from: '22:00', to: '06:00' };
  const office = [officeSlot];
  const night = [nightSlot];

  it('finds the slot that holds and reports its position', () => {
    const monday = '2026-10-19T03:00:00.000Z';
    expect(good('logic.in_schedule', { at: monday, slots: office })).toEqual({
      result: true,
      slot: 0,
    });
    expect(good('logic.in_schedule', { at: monday, slots: [nightSlot, officeSlot] })['slot']).toBe(
      1,
    );
    expect(good('logic.in_schedule', { at: '2026-10-20T03:00:00.000Z', slots: office })).toEqual({
      result: false,
    });
  });

  it('lets a slot past midnight belong to the day it starts on', () => {
    expect(
      good('logic.in_schedule', { at: '2026-10-16T15:30:00.000Z', slots: night })['result'],
    ).toBe(true);
    expect(
      good('logic.in_schedule', { at: '2026-10-16T22:00:00.000Z', slots: night })['result'],
    ).toBe(true);
    expect(
      good('logic.in_schedule', { at: '2026-10-17T00:00:00.000Z', slots: night })['result'],
    ).toBe(false);
    expect(
      good('logic.in_schedule', { at: '2026-10-17T15:30:00.000Z', slots: night })['result'],
    ).toBe(false);
  });

  it('runs every day when the slot lists no days and never when it is empty', () => {
    const daily = [{ days: [], from: '18:00', to: '20:00' }];
    expect(good('logic.in_schedule', { slots: daily })['result']).toBe(true);
    expect(
      good('logic.in_schedule', { slots: [{ days: [], from: '10:00', to: '10:00' }] })['result'],
    ).toBe(false);
    expect(good('logic.in_schedule', { slots: [] })).toEqual({ result: false });
  });

  it('refuses slots it cannot read', () => {
    bad(
      'logic.in_schedule',
      { slots: [{ days: ['xyz'], from: '09:00', to: '10:00' }] },
      'TypeError',
    );
    bad('logic.in_schedule', { slots: [{ days: [], from: '9am', to: '10:00' }] }, 'TypeError');
    bad('logic.in_schedule', { slots: [5] }, 'TypeError');
    expect(HOME.timeZone).toBe('Asia/Bangkok');
  });
});

describe('math.percent', () => {
  it('works out the three operations', () => {
    expect(good('math.percent', { a: 25, b: 200, op: 'of' })).toEqual({ value: 12.5 });
    expect(good('math.percent', { a: 50, b: 75, op: 'change' })).toEqual({ value: 50 });
    expect(good('math.percent', { a: 80, b: 60, op: 'change' })).toEqual({ value: -25 });
    expect(good('math.percent', { a: 200, b: 15, op: 'part' })).toEqual({ value: 30 });
  });

  it('refuses a zero base', () => {
    bad('math.percent', { a: 5, b: 0, op: 'of' }, 'MathError');
    bad('math.percent', { a: 0, b: 5, op: 'change' }, 'MathError');
    expect(good('math.percent', { a: 0, b: 5 })['value']).toBe(0);
    bad('math.percent', { a: 1, b: 2, op: 'ratio' }, 'Invalid');
  });
});

describe('math.convert_unit', () => {
  const convert = (value: number, from: string, to: string): number =>
    Number(good('math.convert_unit', { value, from, to })['value']);

  it('converts within each dimension without float noise', () => {
    expect(convert(23, 'c', 'f')).toBe(73.4);
    expect(convert(100, 'c', 'k')).toBe(373.15);
    expect(convert(32, 'f', 'c')).toBe(0);
    expect(convert(1, 'mi', 'km')).toBe(1.609344);
    expect(convert(1000, 'w', 'kw')).toBe(1);
    expect(convert(2, 'kwh', 'wh')).toBe(2000);
    expect(convert(1, 'gal', 'l')).toBe(3.785411784);
    expect(convert(1013.25, 'hpa', 'in_hg')).toBeCloseTo(29.9213, 3);
    expect(convert(100, 'kmh', 'mph')).toBeCloseTo(62.1371, 3);
    expect(convert(10, 'ms', 'kmh')).toBe(36);
  });

  it('converts colour temperature both ways', () => {
    expect(convert(250, 'mired', 'kelvin')).toBe(4000);
    expect(convert(4000, 'kelvin', 'mired')).toBe(250);
    bad('math.convert_unit', { value: 0, from: 'mired', to: 'kelvin' }, 'MathError');
  });

  it('refuses units of different dimensions and unknown units', () => {
    expect(bad('math.convert_unit', { value: 1, from: 'c', to: 'km' }, 'Invalid')).toContain(
      'temperature',
    );
    bad('math.convert_unit', { value: 1, from: 'c', to: 'parsec' }, 'Invalid');
  });

  it('has a scale for every unit the node offers, in the dimension it names', () => {
    for (const unit of CONVERT_UNITS) {
      expect(UNIT_SCALES[unit.id]?.dimension, unit.id).toBe(unit.dimension);
    }
    expect(Object.keys(UNIT_SCALES).sort()).toEqual(CONVERT_UNITS.map((unit) => unit.id).sort());
  });

  it('round trips every unit of a dimension', () => {
    for (const from of CONVERT_UNITS) {
      for (const to of CONVERT_UNITS.filter((unit) => unit.dimension === from.dimension)) {
        const there = convert(12.5, from.id, to.id);
        expect(convert(there, to.id, from.id)).toBeCloseTo(12.5, 6);
      }
    }
  });
});
