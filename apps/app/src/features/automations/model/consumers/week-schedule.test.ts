import type { Place } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { timedTriggersOf, upcomingRuns, type ScheduledV3 } from './week-schedule';
import { lit, program, trigger } from './consumer-fixtures';

const PARIS: Place = { timeZone: 'Europe/Paris', location: { latitude: 48.8, longitude: 2.3 } };
const NO_LOCATION: Place = { timeZone: 'Europe/Paris', location: null };
const WINDOW = {
  start: new Date('2026-10-17T22:00:00.000Z'),
  end: new Date('2026-10-18T22:00:00.000Z'),
};

function scheduled(
  triggers: Parameters<typeof program>[0],
  extra: Partial<ScheduledV3> = {},
): ScheduledV3 {
  return { program: program(triggers, []), enabled: true, lastRunAt: null, ...extra };
}

function times(rule: ScheduledV3 | null, place = PARIS): string[] {
  return upcomingRuns([{ id: 'r', name: 'Rule', scheduled: rule }], WINDOW, place).map((run) =>
    run.at.toISOString(),
  );
}

describe('timedTriggersOf', () => {
  it('reads time, interval and sun triggers with their literals', () => {
    const found = timedTriggersOf(
      program(
        [
          trigger(1, 'trigger.time', { at: lit('07:30'), days: lit([1, 2]) }),
          trigger(2, 'trigger.interval', { every: lit(1_800_000) }),
          trigger(3, 'trigger.sun', { event: lit('sunset'), offset: lit(-600_000) }),
        ],
        [],
      ),
    );
    expect(found).toEqual([
      { type: 'time', at: '07:30', weekdays: [1, 2] },
      { type: 'interval', everyMinutes: 30 },
      { type: 'sun', event: 'sunset', offsetMinutes: -10 },
    ]);
  });

  it('runs every day when no days are given and skips what is not literal or switched off', () => {
    const found = timedTriggersOf(
      program(
        [
          trigger(1, 'trigger.time', { at: lit('07:30') }),
          trigger(2, 'trigger.time', { at: { wire: { from: 'x', port: 'value' } } }),
          trigger(3, 'trigger.time', { at: lit('25:00') }),
          trigger(4, 'trigger.interval', { every: lit(1) }),
          trigger(5, 'trigger.sun', { event: lit('noon') }),
          trigger(6, 'trigger.time', { at: lit('08:00') }, { enabled: false }),
          trigger(7, 'trigger.button', { device: lit('d') }),
        ],
        [],
      ),
    );
    expect(found).toEqual([{ type: 'time', at: '07:30', weekdays: [0, 1, 2, 3, 4, 5, 6] }]);
  });
});

describe('upcomingRuns', () => {
  it('lists the times of day inside the window', () => {
    const rule = scheduled([trigger(1, 'trigger.time', { at: lit('18:00') })]);
    expect(times(rule)).toEqual(['2026-10-18T16:00:00.000Z']);
  });

  it('has nothing for disabled, missing or off-weekday rules', () => {
    expect(times(null)).toEqual([]);
    expect(
      times(scheduled([trigger(1, 'trigger.time', { at: lit('18:00') })], { enabled: false })),
    ).toEqual([]);
    const sunday = new Date('2026-10-18T10:00:00.000Z').getUTCDay();
    const other = (sunday + 1) % 7;
    expect(
      times(scheduled([trigger(1, 'trigger.time', { at: lit('18:00'), days: lit([other]) })])),
    ).toEqual([]);
  });

  it('counts intervals from the last run and needs one', () => {
    const rule = scheduled([trigger(1, 'trigger.interval', { every: lit(6 * 3_600_000) })], {
      lastRunAt: '2026-10-17T19:00:00.000Z',
    });
    expect(times(rule)).toEqual([
      '2026-10-18T01:00:00.000Z',
      '2026-10-18T07:00:00.000Z',
      '2026-10-18T13:00:00.000Z',
      '2026-10-18T19:00:00.000Z',
    ]);
    expect(times(scheduled([trigger(1, 'trigger.interval', { every: lit(3_600_000) })]))).toEqual(
      [],
    );
  });

  it('follows the sun only with a location', () => {
    const rule = scheduled([trigger(1, 'trigger.sun', { event: lit('sunset') })]);
    expect(times(rule)).toHaveLength(1);
    expect(times(rule, NO_LOCATION)).toEqual([]);
  });

  it('keeps the same answer for the same inputs and sorts across rules', () => {
    const rule = scheduled([trigger(1, 'trigger.time', { at: lit('18:00') })]);
    expect(times(rule)).toEqual(times(rule));
    const runs = upcomingRuns(
      [
        {
          id: 'late',
          name: 'Late',
          scheduled: scheduled([trigger(1, 'trigger.time', { at: lit('21:00') })]),
        },
        {
          id: 'early',
          name: 'Early',
          scheduled: scheduled([trigger(1, 'trigger.time', { at: lit('09:00') })]),
        },
      ],
      WINDOW,
      PARIS,
    );
    expect(runs.map((run) => run.automationId)).toEqual(['early', 'late']);
  });
});
