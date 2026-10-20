import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  CLOCK_TIME,
  COMPARISON,
  MissingLocationError,
  SCENE_ACTIONS,
  TIME_ZONE,
  WEEKDAYS,
  compare,
  jsonEquals,
  localClock,
  minuteOfClock,
  nextOccurrence,
  zonedInstant,
  JSON_VALUE,
  type Comparison,
  type TimedTrigger,
} from '../src';

const LAMP = '11111111-1111-4111-8111-111111111111';
const BERLIN = { timeZone: 'Europe/Berlin', location: { latitude: 52.52, longitude: 13.405 } };

function comparison(value: unknown): Comparison {
  return COMPARISON.parse(value);
}

describe('schemas', () => {
  it('accepts only real clock times', () => {
    expect(CLOCK_TIME.safeParse('00:00').success).toBe(true);
    expect(CLOCK_TIME.safeParse('23:59').success).toBe(true);
    expect(CLOCK_TIME.safeParse('24:00').success).toBe(false);
    expect(CLOCK_TIME.safeParse('7:30').success).toBe(false);
    expect(CLOCK_TIME.safeParse('07:60').success).toBe(false);
    expect(CLOCK_TIME.safeParse('x07:30').success).toBe(false);
    expect(CLOCK_TIME.safeParse('07:30x').success).toBe(false);
  });

  it('accepts distinct weekdays from Sunday to Saturday only', () => {
    expect(WEEKDAYS.safeParse([0, 6]).success).toBe(true);
    expect(WEEKDAYS.safeParse([]).success).toBe(false);
    expect(WEEKDAYS.safeParse([7]).success).toBe(false);
    expect(WEEKDAYS.safeParse([1, 1]).success).toBe(false);
  });

  it('accepts IANA time zones and UTC, nothing else', () => {
    expect(TIME_ZONE.safeParse('Europe/Berlin').success).toBe(true);
    expect(TIME_ZONE.safeParse('UTC').success).toBe(true);
    expect(TIME_ZONE.safeParse('Mars/Olympus').success).toBe(false);
  });

  it('refuses a between range whose minimum exceeds its maximum', () => {
    expect(COMPARISON.safeParse({ operator: 'between', min: 2, max: 1 }).success).toBe(false);
    expect(COMPARISON.safeParse({ operator: 'between', min: 1, max: 1 }).success).toBe(true);
  });

  it('allows only device commands in a scene', () => {
    expect(
      SCENE_ACTIONS.safeParse([{ type: 'command', deviceId: LAMP, capability: 'power', value: 1 }])
        .success,
    ).toBe(true);
    expect(SCENE_ACTIONS.safeParse([{ type: 'delay', seconds: 1 }]).success).toBe(false);
  });
});

describe('schema messages', () => {
  it('names what is wrong with each refused value', () => {
    expect(CLOCK_TIME.safeParse('7').error?.issues[0]?.message).toBe('a time written as HH:MM');
    expect(WEEKDAYS.safeParse([2, 2]).error?.issues[0]?.message).toBe('weekdays must not repeat');
    expect(TIME_ZONE.safeParse('Nowhere/Else').error?.issues[0]?.message).toBe(
      'not an IANA time zone',
    );
    expect(
      COMPARISON.safeParse({ operator: 'between', min: 3, max: 1 }).error?.issues[0]?.message,
    ).toBe('min must not exceed max');
  });

  it('refuses a clock time with a letter where a digit belongs', () => {
    expect(CLOCK_TIME.safeParse('07:3x').success).toBe(false);
    expect(CLOCK_TIME.safeParse('0x:30').success).toBe(false);
    expect(CLOCK_TIME.safeParse('19:30').success).toBe(true);
    expect(CLOCK_TIME.safeParse('20:30').success).toBe(true);
    expect(CLOCK_TIME.safeParse('30:30').success).toBe(false);
  });

  it('accepts Sunday through Saturday and refuses days outside them', () => {
    expect(WEEKDAYS.safeParse([0, 1, 2, 3, 4, 5, 6]).success).toBe(true);
    expect(WEEKDAYS.safeParse([-1]).success).toBe(false);
  });

  it('parses every comparison operator', () => {
    for (const operator of ['gt', 'gte', 'lt', 'lte']) {
      expect(COMPARISON.parse({ operator, value: 1 })).toStrictEqual({ operator, value: 1 });
    }
    expect(COMPARISON.parse({ operator: 'eq', value: [1] })).toStrictEqual({
      operator: 'eq',
      value: [1],
    });
    expect(COMPARISON.parse({ operator: 'ne', value: 'a' })).toStrictEqual({
      operator: 'ne',
      value: 'a',
    });
    expect(COMPARISON.parse({ operator: 'changed' })).toStrictEqual({ operator: 'changed' });
    expect(COMPARISON.safeParse({ operator: 'gt', value: 'a' }).success).toBe(false);
    expect(COMPARISON.safeParse({ operator: 'like', value: 1 }).success).toBe(false);
  });
});

describe('jsonEquals', () => {
  it('ignores the order of object keys', () => {
    expect(jsonEquals({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(
      true,
    );
  });

  it('tells apart values that differ anywhere', () => {
    expect(jsonEquals({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEquals([1, 2], [2, 1])).toBe(false);
    expect(jsonEquals('1', 1)).toBe(false);
    expect(jsonEquals(null, {})).toBe(false);
    expect(jsonEquals({ a: 1 }, { b: 1 })).toBe(false);
    expect(jsonEquals([1], { '0': 1 })).toBe(false);
    expect(jsonEquals([1, 23], [12, 3])).toBe(false);
    expect(jsonEquals({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('holds for any value compared with itself', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const copy = JSON_VALUE.parse(JSON.parse(JSON.stringify(value)));
        expect(jsonEquals(copy, JSON_VALUE.parse(structuredClone(copy)))).toBe(true);
      }),
    );
  });
});

describe('compare', () => {
  it('compares equality structurally', () => {
    expect(compare(comparison({ operator: 'eq', value: 'cool' }), 'cool', undefined)).toBe(true);
    expect(compare(comparison({ operator: 'eq', value: 'cool' }), 'heat', undefined)).toBe(false);
    expect(compare(comparison({ operator: 'ne', value: 'cool' }), 'heat', undefined)).toBe(true);
    expect(compare(comparison({ operator: 'ne', value: 'cool' }), 'cool', undefined)).toBe(false);
  });

  it('compares numbers at and around each boundary', () => {
    const cases: readonly [string, number, readonly boolean[]][] = [
      ['gt', 20, [false, false, true]],
      ['gte', 20, [false, true, true]],
      ['lt', 20, [true, false, false]],
      ['lte', 20, [true, true, false]],
    ];
    for (const [operator, value, expected] of cases) {
      const rule = comparison({ operator, value });
      expect([19, 20, 21].map((reading) => compare(rule, reading, undefined))).toStrictEqual(
        expected,
      );
    }
  });

  it('treats between as inclusive at both ends', () => {
    const rule = comparison({ operator: 'between', min: 10, max: 20 });
    expect([9, 10, 15, 20, 21].map((reading) => compare(rule, reading, undefined))).toStrictEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('never matches a numeric comparison against something that is not a number', () => {
    for (const operator of ['gt', 'gte', 'lt', 'lte']) {
      expect(compare(comparison({ operator, value: 0 }), '5', undefined)).toBe(false);
    }
    expect(compare(comparison({ operator: 'between', min: 0, max: 9 }), '5', undefined)).toBe(
      false,
    );
  });

  it('never matches a missing value', () => {
    expect(compare(comparison({ operator: 'ne', value: 1 }), undefined, 1)).toBe(false);
  });

  it('reports a change only between two known, different values', () => {
    const changed = comparison({ operator: 'changed' });
    expect(compare(changed, 2, 1)).toBe(true);
    expect(compare(changed, 1, 1)).toBe(false);
    expect(compare(changed, 1, undefined)).toBe(false);
  });
});

describe('clock helpers', () => {
  it('reads the wall clock in a time zone', () => {
    expect(localClock(new Date('2024-06-03T22:15:00Z'), 'Europe/Berlin')).toStrictEqual({
      year: 2024,
      month: 6,
      day: 4,
      weekday: 2,
      minuteOfDay: 15,
    });
  });

  it('reads midnight as minute zero, not 24:00', () => {
    expect(localClock(new Date('2024-01-01T00:00:00Z'), 'UTC').minuteOfDay).toBe(0);
  });

  it('keeps zones apart when the same formatter cache serves several of them', () => {
    const instant = new Date('2024-06-03T22:15:00Z');
    const berlin = localClock(instant, 'Europe/Berlin');
    const tokyo = localClock(instant, 'Asia/Tokyo');
    expect(localClock(instant, 'Europe/Berlin')).toStrictEqual(berlin);
    expect(tokyo.day).toBe(4);
    expect(tokyo.minuteOfDay).toBe(7 * 60 + 15);
    expect(() => localClock(instant, 'Not/AZone')).toThrow(RangeError);
    expect(() => localClock(instant, 'Not/AZone')).toThrow(RangeError);
  });

  it('turns a local date and time into the right instant on both sides of a DST change', () => {
    expect(
      zonedInstant({ year: 2024, month: 3, day: 30 }, 450, 'Europe/Berlin').toISOString(),
    ).toBe('2024-03-30T06:30:00.000Z');
    expect(
      zonedInstant({ year: 2024, month: 3, day: 31 }, 450, 'Europe/Berlin').toISOString(),
    ).toBe('2024-03-31T05:30:00.000Z');
    expect(
      zonedInstant({ year: 2024, month: 1, day: 1 }, 600, 'America/New_York').toISOString(),
    ).toBe('2024-01-01T15:00:00.000Z');
  });

  it('lands inside the clock change when the wall time does not exist', () => {
    expect(
      zonedInstant({ year: 2024, month: 3, day: 31 }, 150, 'Europe/Berlin').toISOString(),
    ).toBe('2024-03-31T01:30:00.000Z');
  });

  it('round trips any wall clock time on an ordinary day', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (minute) => {
        const instant = zonedInstant({ year: 2024, month: 7, day: 10 }, minute, 'Asia/Kolkata');
        expect(localClock(instant, 'Asia/Kolkata').minuteOfDay).toBe(minute);
      }),
    );
  });

  it('reads minutes out of a clock time', () => {
    expect(minuteOfClock('00:00')).toBe(0);
    expect(minuteOfClock('07:05')).toBe(425);
    expect(minuteOfClock('23:59')).toBe(1439);
  });
});

describe('nextOccurrence', () => {
  const weekdayMorning: TimedTrigger = { type: 'time', at: '07:30', weekdays: [1] };

  it('schedules an interval from the given instant', () => {
    const interval: TimedTrigger = { type: 'interval', everyMinutes: 15 };
    expect(nextOccurrence(interval, new Date('2024-06-03T06:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-03T06:15:00.000Z',
    );
  });

  it('schedules a time of day later the same day when it is still ahead', () => {
    expect(
      nextOccurrence(weekdayMorning, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString(),
    ).toBe('2024-06-03T05:30:00.000Z');
  });

  it('moves a time of day to the next allowed weekday once it has passed, including the exact instant', () => {
    expect(
      nextOccurrence(weekdayMorning, new Date('2024-06-03T05:30:00Z'), BERLIN)?.toISOString(),
    ).toBe('2024-06-10T05:30:00.000Z');
  });

  it('skips days that are not allowed', () => {
    const weekend: TimedTrigger = { type: 'time', at: '09:00', weekdays: [6, 0] };
    expect(nextOccurrence(weekend, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-08T07:00:00.000Z',
    );
  });

  it('schedules sunset with its offset at the home location', () => {
    const sunset: TimedTrigger = { type: 'sun', event: 'sunset', offsetMinutes: 10 };
    expect(nextOccurrence(sunset, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-03T19:30:34.770Z',
    );
  });

  it('refuses a sun trigger for a home without a location', () => {
    const sunrise: TimedTrigger = { type: 'sun', event: 'sunrise', offsetMinutes: 0 };
    expect(() => nextOccurrence(sunrise, new Date(0), { timeZone: 'UTC', location: null })).toThrow(
      new MissingLocationError(),
    );
    expect(new MissingLocationError().message).toBe(
      'A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.',
    );
    expect(new MissingLocationError().name).toBe('MissingLocationError');
  });
});
