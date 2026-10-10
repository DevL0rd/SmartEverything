import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  AUTOMATION_DEFINITION,
  CLOCK_TIME,
  COMPARISON,
  CONDITION,
  CONDITIONS,
  ACTION,
  MissingLocationError,
  SCENE_ACTIONS,
  TIME_ZONE,
  TRIGGER,
  WEEKDAYS,
  compare,
  conditionsHold,
  eventTriggerFires,
  isTimedTrigger,
  jsonEquals,
  localClock,
  minuteOfClock,
  nextOccurrence,
  stateTriggerFires,
  zonedInstant,
  JSON_VALUE,
  type Comparison,
  type Conditions,
  type Trigger,
} from '../src';

const LAMP = '11111111-1111-4111-8111-111111111111';
const SENSOR = '22222222-2222-4222-8222-222222222222';
const SCENE = '33333333-3333-4333-8333-333333333333';
const BERLIN = { timeZone: 'Europe/Berlin', location: { latitude: 52.52, longitude: 13.405 } };

function parsedTrigger(value: unknown): Trigger {
  return TRIGGER.parse(value);
}

function comparison(value: unknown): Comparison {
  return COMPARISON.parse(value);
}

describe('schemas', () => {
  it('accepts a complete automation definition', () => {
    const definition = AUTOMATION_DEFINITION.parse({
      triggers: [
        {
          type: 'state',
          deviceId: SENSOR,
          capability: 'temperature',
          comparison: { operator: 'gt', value: 25 },
        },
        { type: 'event', deviceId: null, kind: 'doorbell' },
        { type: 'time', at: '07:30', weekdays: [1, 2, 3, 4, 5] },
        { type: 'sun', event: 'sunset', offsetMinutes: -15 },
        { type: 'interval', everyMinutes: 30 },
      ],
      conditions: { mode: 'all', items: [{ type: 'weekday', weekdays: [0, 6] }] },
      actions: [
        { type: 'command', deviceId: LAMP, capability: 'power', value: true },
        { type: 'scene', sceneId: SCENE },
        { type: 'delay', seconds: 5 },
        { type: 'notify', message: 'It is warm' },
      ],
    });
    expect(definition.triggers).toHaveLength(5);
    expect(definition.actions).toHaveLength(4);
  });

  it('refuses a definition without triggers or without actions', () => {
    const conditions = { mode: 'all', items: [] };
    const action = { type: 'notify', message: 'x' };
    expect(
      AUTOMATION_DEFINITION.safeParse({ triggers: [], conditions, actions: [action] }).success,
    ).toBe(false);
    expect(
      AUTOMATION_DEFINITION.safeParse({
        triggers: [{ type: 'interval', everyMinutes: 1 }],
        conditions,
        actions: [],
      }).success,
    ).toBe(false);
  });

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

  it('refuses a time window that starts and ends at the same time', () => {
    expect(
      CONDITION.safeParse({ type: 'time_window', after: '08:00', before: '08:00' }).success,
    ).toBe(false);
  });

  it('refuses a changed comparison inside a condition, since a condition has no previous value', () => {
    expect(
      CONDITION.safeParse({
        type: 'state',
        deviceId: LAMP,
        capability: 'power',
        comparison: { operator: 'changed' },
      }).success,
    ).toBe(false);
  });

  it('refuses an any group without conditions', () => {
    expect(CONDITIONS.safeParse({ mode: 'any', items: [] }).success).toBe(false);
  });

  it('allows only device commands in a scene', () => {
    expect(
      SCENE_ACTIONS.safeParse([{ type: 'command', deviceId: LAMP, capability: 'power', value: 1 }])
        .success,
    ).toBe(true);
    expect(SCENE_ACTIONS.safeParse([{ type: 'delay', seconds: 1 }]).success).toBe(false);
  });

  it('bounds sun offsets and intervals', () => {
    expect(TRIGGER.safeParse({ type: 'sun', event: 'sunrise', offsetMinutes: 721 }).success).toBe(
      false,
    );
    expect(TRIGGER.safeParse({ type: 'interval', everyMinutes: 0 }).success).toBe(false);
  });
});

describe('schema messages', () => {
  function firstMessage(result: {
    readonly error?: { readonly issues: readonly { readonly message: string }[] } | undefined;
  }): string | undefined {
    return result.error?.issues[0]?.message;
  }

  it('names what is wrong with each refused value', () => {
    expect(firstMessage(CLOCK_TIME.safeParse('7'))).toBe('a time written as HH:MM');
    expect(firstMessage(WEEKDAYS.safeParse([2, 2]))).toBe('weekdays must not repeat');
    expect(firstMessage(TIME_ZONE.safeParse('Nowhere/Else'))).toBe('not an IANA time zone');
    expect(firstMessage(COMPARISON.safeParse({ operator: 'between', min: 3, max: 1 }))).toBe(
      'min must not exceed max',
    );
    expect(
      firstMessage(CONDITION.safeParse({ type: 'time_window', after: '01:00', before: '01:00' })),
    ).toBe('a time window must not start and end at the same time');
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

  it('parses every trigger, condition and action exactly as written', () => {
    const triggers = [
      { type: 'state', deviceId: LAMP, capability: 'power', comparison: { operator: 'changed' } },
      { type: 'event', deviceId: null, kind: 'motion' },
      { type: 'time', at: '06:00', weekdays: [1] },
      { type: 'sun', event: 'sunrise', offsetMinutes: -720 },
      { type: 'interval', everyMinutes: 10_080 },
    ];
    for (const trigger of triggers) {
      expect(TRIGGER.parse(trigger)).toStrictEqual(trigger);
    }
    const conditions = [
      {
        type: 'state',
        deviceId: LAMP,
        capability: 'power',
        comparison: { operator: 'eq', value: true },
      },
      { type: 'time_window', after: '01:00', before: '02:00' },
      { type: 'weekday', weekdays: [3] },
    ];
    for (const condition of conditions) {
      expect(CONDITION.parse(condition)).toStrictEqual(condition);
    }
    expect(TRIGGER.safeParse({ type: 'sunset', event: 'sunrise', offsetMinutes: 0 }).success).toBe(
      false,
    );
    expect(TRIGGER.safeParse({ type: 'interval', everyMinutes: 10_081 }).success).toBe(false);
    expect(TRIGGER.safeParse({ type: 'sun', event: 'sunrise', offsetMinutes: -721 }).success).toBe(
      false,
    );
    expect(TRIGGER.safeParse({ type: 'sun', event: 'sunrise', offsetMinutes: 0.5 }).success).toBe(
      false,
    );
    expect(CONDITIONS.parse({ mode: 'any', items: [conditions[2]] })).toStrictEqual({
      mode: 'any',
      items: [conditions[2]],
    });
  });

  it('bounds delays and notification text', () => {
    expect(ACTION.safeParse({ type: 'delay', seconds: 0 }).success).toBe(false);
    expect(ACTION.safeParse({ type: 'delay', seconds: 86_401 }).success).toBe(false);
    expect(ACTION.safeParse({ type: 'delay', seconds: 86_400 }).success).toBe(true);
    expect(ACTION.safeParse({ type: 'notify', message: '' }).success).toBe(false);
    expect(ACTION.safeParse({ type: 'notify', message: 'x'.repeat(501) }).success).toBe(false);
    expect(ACTION.safeParse({ type: 'notify', message: 'x'.repeat(500) }).success).toBe(true);
    expect(ACTION.parse({ type: 'scene', sceneId: SCENE })).toStrictEqual({
      type: 'scene',
      sceneId: SCENE,
    });
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

describe('stateTriggerFires', () => {
  const hot = (): Trigger =>
    parsedTrigger({
      type: 'state',
      deviceId: SENSOR,
      capability: 'temperature',
      comparison: { operator: 'gt', value: 25 },
    });

  it('fires when the comparison becomes true', () => {
    expect(
      stateTriggerFires(hot(), {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 26,
        previous: 24,
      }),
    ).toBe(true);
  });

  it('fires on the first known value when it already matches', () => {
    expect(
      stateTriggerFires(hot(), {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 26,
        previous: undefined,
      }),
    ).toBe(true);
  });

  it('does not fire again while the comparison stays true', () => {
    expect(
      stateTriggerFires(hot(), {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 27,
        previous: 26,
      }),
    ).toBe(false);
  });

  it('does not fire when the comparison is false', () => {
    expect(
      stateTriggerFires(hot(), {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 20,
        previous: 30,
      }),
    ).toBe(false);
  });

  it('ignores other devices, other capabilities and other trigger types', () => {
    expect(
      stateTriggerFires(hot(), {
        deviceId: LAMP,
        capability: 'temperature',
        value: 26,
        previous: 24,
      }),
    ).toBe(false);
    expect(
      stateTriggerFires(hot(), {
        deviceId: SENSOR,
        capability: 'humidity',
        value: 26,
        previous: 24,
      }),
    ).toBe(false);
    expect(
      stateTriggerFires(parsedTrigger({ type: 'interval', everyMinutes: 5 }), {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 26,
        previous: 24,
      }),
    ).toBe(false);
  });

  it('ignores a trigger of another type even when it carries the same device and capability', () => {
    const lookalike = {
      type: 'event',
      deviceId: SENSOR,
      kind: 'motion',
      capability: 'temperature',
      comparison: { operator: 'changed' },
    } as const;
    expect(
      stateTriggerFires(lookalike, {
        deviceId: SENSOR,
        capability: 'temperature',
        value: 2,
        previous: 1,
      }),
    ).toBe(false);
  });

  it('fires a changed trigger on every change', () => {
    const changed = parsedTrigger({
      type: 'state',
      deviceId: LAMP,
      capability: 'power',
      comparison: { operator: 'changed' },
    });
    expect(
      stateTriggerFires(changed, {
        deviceId: LAMP,
        capability: 'power',
        value: true,
        previous: false,
      }),
    ).toBe(true);
    expect(
      stateTriggerFires(changed, {
        deviceId: LAMP,
        capability: 'power',
        value: true,
        previous: true,
      }),
    ).toBe(false);
  });
});

describe('eventTriggerFires', () => {
  const anyDoorbell = (): Trigger =>
    parsedTrigger({ type: 'event', deviceId: null, kind: 'doorbell' });
  const oneDoorbell = (): Trigger =>
    parsedTrigger({ type: 'event', deviceId: LAMP, kind: 'doorbell' });

  it('matches the kind from any device when no device is named', () => {
    expect(eventTriggerFires(anyDoorbell(), { deviceId: SENSOR, kind: 'doorbell' })).toBe(true);
    expect(eventTriggerFires(anyDoorbell(), { deviceId: null, kind: 'doorbell' })).toBe(true);
    expect(eventTriggerFires(anyDoorbell(), { deviceId: SENSOR, kind: 'motion' })).toBe(false);
  });

  it('matches only the named device when one is named', () => {
    expect(eventTriggerFires(oneDoorbell(), { deviceId: LAMP, kind: 'doorbell' })).toBe(true);
    expect(eventTriggerFires(oneDoorbell(), { deviceId: SENSOR, kind: 'doorbell' })).toBe(false);
  });

  it('never matches a state trigger that happens to carry an event kind', () => {
    const lookalike = {
      type: 'state',
      deviceId: LAMP,
      capability: 'power',
      comparison: { operator: 'changed' },
      kind: 'doorbell',
    } as const;
    expect(eventTriggerFires(lookalike, { deviceId: LAMP, kind: 'doorbell' })).toBe(false);
  });

  it('never matches a trigger of another type', () => {
    expect(
      eventTriggerFires(parsedTrigger({ type: 'interval', everyMinutes: 1 }), {
        deviceId: null,
        kind: 'doorbell',
      }),
    ).toBe(false);
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
  const weekdayMorning = (): Trigger => parsedTrigger({ type: 'time', at: '07:30', weekdays: [1] });

  it('schedules an interval from the given instant', () => {
    const interval = parsedTrigger({ type: 'interval', everyMinutes: 15 });
    if (!isTimedTrigger(interval)) throw new Error('timed');
    expect(nextOccurrence(interval, new Date('2024-06-03T06:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-03T06:15:00.000Z',
    );
  });

  it('schedules a time of day later the same day when it is still ahead', () => {
    const morning = weekdayMorning();
    if (!isTimedTrigger(morning)) throw new Error('timed');
    expect(nextOccurrence(morning, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-03T05:30:00.000Z',
    );
  });

  it('moves a time of day to the next allowed weekday once it has passed, including the exact instant', () => {
    const morning = weekdayMorning();
    if (!isTimedTrigger(morning)) throw new Error('timed');
    expect(nextOccurrence(morning, new Date('2024-06-03T05:30:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-10T05:30:00.000Z',
    );
  });

  it('skips days that are not allowed', () => {
    const weekend = parsedTrigger({ type: 'time', at: '09:00', weekdays: [6, 0] });
    if (!isTimedTrigger(weekend)) throw new Error('timed');
    expect(nextOccurrence(weekend, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-08T07:00:00.000Z',
    );
  });

  it('schedules sunset with its offset at the home location', () => {
    const sunset = parsedTrigger({ type: 'sun', event: 'sunset', offsetMinutes: 10 });
    if (!isTimedTrigger(sunset)) throw new Error('timed');
    expect(nextOccurrence(sunset, new Date('2024-06-03T05:00:00Z'), BERLIN)?.toISOString()).toBe(
      '2024-06-03T19:30:34.770Z',
    );
  });

  it('refuses a sun trigger for a home without a location', () => {
    const sunrise = parsedTrigger({ type: 'sun', event: 'sunrise', offsetMinutes: 0 });
    if (!isTimedTrigger(sunrise)) throw new Error('timed');
    expect(() => nextOccurrence(sunrise, new Date(0), { timeZone: 'UTC', location: null })).toThrow(
      new MissingLocationError(),
    );
    expect(new MissingLocationError().message).toBe(
      'A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.',
    );
    expect(new MissingLocationError().name).toBe('MissingLocationError');
  });

  it('knows which triggers are timed', () => {
    expect(isTimedTrigger(parsedTrigger({ type: 'event', deviceId: null, kind: 'motion' }))).toBe(
      false,
    );
    expect(
      isTimedTrigger(
        parsedTrigger({
          type: 'state',
          deviceId: LAMP,
          capability: 'power',
          comparison: { operator: 'changed' },
        }),
      ),
    ).toBe(false);
    expect(isTimedTrigger(parsedTrigger({ type: 'sun', event: 'sunrise', offsetMinutes: 0 }))).toBe(
      true,
    );
    expect(isTimedTrigger(parsedTrigger({ type: 'time', at: '01:00', weekdays: [1] }))).toBe(true);
    expect(isTimedTrigger(parsedTrigger({ type: 'interval', everyMinutes: 1 }))).toBe(true);
  });
});

describe('conditionsHold', () => {
  const state = new Map<string, unknown>([[`${LAMP}|power`, true]]);
  const context = (iso: string): Parameters<typeof conditionsHold>[1] => ({
    stateOf: (deviceId, capability): boolean | undefined => {
      const value = state.get(`${deviceId}|${capability}`);
      return typeof value === 'boolean' ? value : undefined;
    },
    now: new Date(iso),
    timeZone: 'Europe/Berlin',
  });
  const parse = (value: unknown): Conditions => CONDITIONS.parse(value);
  const lampOn = {
    type: 'state',
    deviceId: LAMP,
    capability: 'power',
    comparison: { operator: 'eq', value: true },
  };
  const sensorOn = { ...lampOn, deviceId: SENSOR };

  it('holds vacuously when there are no conditions', () => {
    expect(conditionsHold(parse({ mode: 'all', items: [] }), context('2024-06-03T10:00:00Z'))).toBe(
      true,
    );
  });

  it('needs every condition for all and one for any', () => {
    expect(
      conditionsHold(
        parse({ mode: 'all', items: [lampOn, sensorOn] }),
        context('2024-06-03T10:00:00Z'),
      ),
    ).toBe(false);
    expect(
      conditionsHold(
        parse({ mode: 'any', items: [lampOn, sensorOn] }),
        context('2024-06-03T10:00:00Z'),
      ),
    ).toBe(true);
    expect(
      conditionsHold(parse({ mode: 'any', items: [sensorOn] }), context('2024-06-03T10:00:00Z')),
    ).toBe(false);
  });

  it('checks the weekday in the home time zone', () => {
    const monday = parse({ mode: 'all', items: [{ type: 'weekday', weekdays: [1] }] });
    expect(conditionsHold(monday, context('2024-06-03T21:00:00Z'))).toBe(true);
    expect(conditionsHold(monday, context('2024-06-03T22:30:00Z'))).toBe(false);
  });

  it('checks a daytime window with an inclusive start and exclusive end', () => {
    const daytime = parse({
      mode: 'all',
      items: [{ type: 'time_window', after: '08:00', before: '18:00' }],
    });
    expect(conditionsHold(daytime, context('2024-06-03T05:59:00Z'))).toBe(false);
    expect(conditionsHold(daytime, context('2024-06-03T06:00:00Z'))).toBe(true);
    expect(conditionsHold(daytime, context('2024-06-03T15:59:00Z'))).toBe(true);
    expect(conditionsHold(daytime, context('2024-06-03T16:00:00Z'))).toBe(false);
  });

  it('checks a window that wraps past midnight', () => {
    const night = parse({
      mode: 'all',
      items: [{ type: 'time_window', after: '22:00', before: '06:00' }],
    });
    expect(conditionsHold(night, context('2024-06-03T19:59:00Z'))).toBe(false);
    expect(conditionsHold(night, context('2024-06-03T20:00:00Z'))).toBe(true);
    expect(conditionsHold(night, context('2024-06-04T03:59:00Z'))).toBe(true);
    expect(conditionsHold(night, context('2024-06-04T04:00:00Z'))).toBe(false);
  });
});
