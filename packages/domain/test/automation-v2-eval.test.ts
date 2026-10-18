import { describe, expect, it } from 'vitest';
import { AutomationBindingError } from '../src/automation-bindings';
import {
  conditionV2Holds,
  resolveInputV2,
  resolveToV2,
  testHolds,
  timedTriggerOf,
  type ContextV2,
} from '../src/automation-v2-eval';
import { AUTOMATION_V2, CONDITION_V2 } from '../src/automation-v2-schema';
import { BERLIN, forecastOf } from './support/dry-world';

const DEVICE = '3a000000-0000-4000-8000-0000000000a1';
const VALUE = '3a000000-0000-4000-8000-0000000000b1';

function context(overrides: Partial<ContextV2> = {}, reading: number | string = 10): ContextV2 {
  return {
    read: { device: () => reading, value: () => 3, input: () => 4 },
    now: new Date('2026-10-08T12:00:00Z'),
    timeZone: 'UTC',
    forecast: forecastOf(20, 61),
    location: BERLIN,
    ...overrides,
  };
}

function holds(condition: unknown, setup: ContextV2 = context()): boolean {
  return conditionV2Holds(CONDITION_V2.parse(condition), setup);
}

describe('tests', () => {
  it('compare numbers, lists and anything else', () => {
    expect(testHolds({ is: 'in', to: ['rain', 'snow'] }, 'snow')).toBe(true);
    expect(testHolds({ is: 'in', to: ['rain'] }, 'clear')).toBe(false);
    expect(testHolds({ is: 'in', to: ['rain'] }, undefined)).toBe(false);
    expect(testHolds({ is: 'between', min: 1, max: 3 }, 3)).toBe(true);
    expect(testHolds({ is: 'eq', to: { a: 1 } }, { a: 1 })).toBe(true);
    expect(testHolds({ is: 'ne', to: 1 }, 1)).toBe(false);
    const ordered = ['gt', 'gte', 'lt', 'lte'] as const;
    expect(ordered.map((is) => testHolds({ is, to: 5 }, 5))).toStrictEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(testHolds({ is: 'gt', to: 5 }, undefined)).toBe(false);
  });
});

describe('operands', () => {
  it('read devices, Values, inputs, weather and literals', () => {
    const reads = [
      { device: DEVICE, control: 'power' },
      { value: VALUE },
      { input: 'level' },
      { weather: 'temperature' },
      { literal: 20 },
    ].map((compare) => holds({ compare, test: { is: 'in', to: [10, 3, 4, 20] } }));
    expect(reads).toStrictEqual([true, true, true, true, true]);
    expect(holds({ compare: { weather: 'kind' }, test: { is: 'in', to: ['rain'] } })).toBe(true);
  });

  it('read nothing from a missing forecast or reading', () => {
    const none = context({ forecast: null });
    expect(holds({ compare: { weather: 'kind' }, test: { is: 'eq', to: 'rain' } }, none)).toBe(
      false,
    );
    expect(holds({ compare: { weather: 'uv_index' }, test: { is: 'gte', to: 0 } }, none)).toBe(
      false,
    );
    expect(holds({ compare: { weather: 'aqi' }, test: { is: 'gte', to: 0 } })).toBe(false);
    const blank: ContextV2 = { ...context(), read: { ...context().read, device: () => undefined } };
    expect(
      holds({ compare: { device: DEVICE, control: 'power' }, test: { is: 'ne', to: 1 } }, blank),
    ).toBe(false);
    expect(
      holds(
        {
          compare: { from: { device: DEVICE, control: 'power' }, add: 1 },
          test: { is: 'ne', to: 1 },
        },
        blank,
      ),
    ).toBe(false);
  });

  it('offset and bound a reading', () => {
    const subject = { from: { input: 'level' }, add: 6, max: 10 };
    expect(holds({ compare: subject, test: { is: 'eq', to: 10 } })).toBe(true);
    expect(() => holds({ compare: { ...subject, max: 9 }, test: { is: 'eq', to: 10 } })).toThrow(
      AutomationBindingError,
    );
    expect(() =>
      holds({ compare: { from: { input: 'level' }, min: 5 }, test: { is: 'eq', to: 4 } }),
    ).toThrow('exceeds the input bounds');
    expect(
      holds({ compare: { from: { input: 'level' }, min: 4 }, test: { is: 'eq', to: 4 } }),
    ).toBe(true);
  });

  it('refuse an offset on something that is not a number', () => {
    expect(() =>
      holds(
        {
          compare: { from: { device: DEVICE, control: 'power' }, add: 1 },
          test: { is: 'eq', to: 1 },
        },
        context({}, 'on'),
      ),
    ).toThrow('need a number');
  });
});

describe('inputs and values to set', () => {
  it('resolve literals, offsets and field objects', () => {
    expect(resolveInputV2(5, context())).toBe(5);
    expect(resolveInputV2(null, context())).toBeNull();
    expect(resolveInputV2([1], context())).toStrictEqual([1]);
    expect(resolveInputV2({ from: { value: VALUE }, add: -1 }, context())).toBe(2);
    expect(resolveToV2({ from: { input: 'level' } }, context())).toBe(4);
    expect(resolveToV2([1, 2], context())).toStrictEqual([1, 2]);
    expect(resolveToV2({ a: 1, b: { from: { value: VALUE } } }, context())).toStrictEqual({
      a: 1,
      b: 3,
    });
  });

  it('fail when a reading has no value', () => {
    const blank: ContextV2 = { ...context(), read: { ...context().read, device: () => undefined } };
    expect(() => resolveInputV2({ from: { device: DEVICE, control: 'power' } }, blank)).toThrow(
      'has no value',
    );
  });
});

describe('time and daylight', () => {
  const at = (iso: string): ContextV2 => context({ now: new Date(iso) });

  it('hold inside a window that may wrap midnight', () => {
    const night = { time: { after: '22:00', before: '06:00' } };
    expect([
      holds(night, at('2026-10-08T23:00:00Z')),
      holds(night, at('2026-10-08T05:59:00Z')),
      holds(night, at('2026-10-08T06:00:00Z')),
    ]).toStrictEqual([true, true, false]);
  });

  it('hold after or before a single time', () => {
    const [after, before] = [{ time: { after: '13:00' } }, { time: { before: '13:00' } }];
    expect([
      holds(after, at('2026-10-08T13:00:00Z')),
      holds(after, at('2026-10-08T12:59:00Z')),
    ]).toStrictEqual([true, false]);
    expect([
      holds(before, at('2026-10-08T12:59:00Z')),
      holds(before, at('2026-10-08T13:00:00Z')),
    ]).toStrictEqual([true, false]);
  });

  it('hold on the listed days only', () => {
    expect(holds({ time: { days: [4] } })).toBe(true);
    expect(holds({ time: { days: [5], after: '00:00' } })).toBe(false);
  });

  it('follow the sun with offsets', () => {
    expect(holds({ daylight: 'day' })).toBe(true);
    expect(holds({ daylight: 'night' })).toBe(false);
    expect(holds({ daylight: 'night', sunsetOffset: -600, sunriseOffset: 0 })).toBe(true);
    expect(holds({ daylight: 'day' }, context({ location: null }))).toBe(false);
  });

  it('combine with all, any and not', () => {
    const yes = { time: { days: [4] } };
    const no = { time: { days: [5] } };
    expect([
      holds({ all: [yes, no] }),
      holds({ any: [no, yes] }),
      holds({ not: no }),
      holds({ all: [] }),
    ]).toStrictEqual([false, true, true, true]);
  });
});

describe('timers', () => {
  it('pick out the triggers that run on the clock', () => {
    const { when } = AUTOMATION_V2.parse({
      when: [
        { on: 'time', at: '07:00' },
        { on: 'time', at: '07:30', days: [1] },
        { on: 'sun', event: 'sunset' },
        { on: 'sun', event: 'sunrise', offsetMinutes: 5 },
        { on: 'every', minutes: 15 },
        { on: 'signal', source: 'device', kind: 'state' },
      ],
      steps: [{ do: 'notify', message: 'hi' }],
    });
    expect(when.map(timedTriggerOf)).toStrictEqual([
      { type: 'time', at: '07:00', weekdays: [0, 1, 2, 3, 4, 5, 6] },
      { type: 'time', at: '07:30', weekdays: [1] },
      { type: 'sun', event: 'sunset', offsetMinutes: 0 },
      { type: 'sun', event: 'sunrise', offsetMinutes: 5 },
      { type: 'interval', everyMinutes: 15 },
      null,
    ]);
  });
});
