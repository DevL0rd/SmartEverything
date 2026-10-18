import { describe, expect, it } from 'vitest';
import { AUTOMATION_V2, type AutomationV2, type Place } from '@smarteverything/domain';
import { dayWindow, placeOf, upcomingRuns, type Scheduled } from './schedule';

const UTC: Place = { timeZone: 'UTC', location: null };
const NEW_YORK: Place = { timeZone: 'America/New_York', location: null };
const ID = '20000000-0000-4000-8000-000000000001';

function definition(trigger: Record<string, unknown>): AutomationV2 {
  return AUTOMATION_V2.parse({ when: [trigger], steps: [{ do: 'notify', message: 'Hello' }] });
}

function scheduled(trigger: Record<string, unknown>, change: Partial<Scheduled> = {}): Scheduled {
  return { automation: definition(trigger), enabled: true, lastRunAt: null, ...change };
}

function rule(
  name: string,
  entry: Scheduled | null,
  id = ID,
): { id: string; name: string; scheduled: Scheduled | null } {
  return { id, name, scheduled: entry };
}

function times(runs: readonly { readonly at: Date }[]): string[] {
  return runs.map((run) => run.at.toISOString());
}

describe('placeOf', () => {
  it('reads a home with a valid zone, with a location only when both coordinates are set', () => {
    expect(placeOf({ time_zone: 'Europe/Paris', latitude: 48.8, longitude: 2.3 })).toEqual({
      usable: true,
      place: { timeZone: 'Europe/Paris', location: { latitude: 48.8, longitude: 2.3 } },
    });
    expect(placeOf({ time_zone: 'Europe/Paris', latitude: 48.8, longitude: null })).toEqual({
      usable: true,
      place: { timeZone: 'Europe/Paris', location: null },
    });
  });

  it('is not usable with a time zone that does not exist', () => {
    const reading = placeOf({ time_zone: 'Mars/Base', latitude: null, longitude: null });
    expect(reading.usable).toBe(false);
  });
});

describe('dayWindow', () => {
  it('spans the local day of the home zone, not of the device', () => {
    const window = dayWindow(new Date('2026-10-16T03:00:00Z'), 'America/New_York', 0);
    expect(window.start.toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('is 25 hours long on the day the clocks go back and 23 when they go forward', () => {
    const back = dayWindow(new Date('2026-11-01T12:00:00Z'), 'America/New_York', 0);
    expect((back.end.getTime() - back.start.getTime()) / 3_600_000).toBe(25);
    const forward = dayWindow(new Date('2026-03-08T12:00:00Z'), 'America/New_York', 0);
    expect((forward.end.getTime() - forward.start.getTime()) / 3_600_000).toBe(23);
  });

  it('moves by whole local days and can span several, across a month end', () => {
    const next = dayWindow(new Date('2026-10-31T12:00:00Z'), 'UTC', 1, 2);
    expect(next.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(next.end.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    const before = dayWindow(new Date('2026-03-01T12:00:00Z'), 'UTC', -1);
    expect(before.start.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('upcomingRuns', () => {
  const today = dayWindow(new Date('2026-10-14T12:00:00Z'), 'UTC', 0);

  it('lists a daily clock time once in the window, in the zone of the home', () => {
    const entry = scheduled({ on: 'time', at: '07:30' });
    expect(times(upcomingRuns([rule('Morning', entry)], today, UTC))).toEqual([
      '2026-10-14T07:30:00.000Z',
    ]);
    const newYork = dayWindow(new Date('2026-10-14T12:00:00Z'), 'America/New_York', 0);
    expect(times(upcomingRuns([rule('Morning', entry)], newYork, NEW_YORK))).toEqual([
      '2026-10-14T11:30:00.000Z',
    ]);
  });

  it('skips a day that is not one of the chosen weekdays', () => {
    const entry = scheduled({ on: 'time', at: '07:30', days: [1, 2] });
    expect(upcomingRuns([rule('Morning', entry)], today, UTC)).toEqual([]);
  });

  it('counts an interval from its last run and has nothing before it ever ran', () => {
    const every = { on: 'every', minutes: 360 };
    const ran = scheduled(every, { lastRunAt: '2026-10-14T08:10:00.000Z' });
    expect(times(upcomingRuns([rule('Often', ran)], today, UTC))).toEqual([
      '2026-10-14T02:10:00.000Z',
      '2026-10-14T08:10:00.000Z',
      '2026-10-14T14:10:00.000Z',
      '2026-10-14T20:10:00.000Z',
    ]);
    expect(upcomingRuns([rule('Often', scheduled(every))], today, UTC)).toEqual([]);
  });

  it('lists nothing for a disabled rule, a rule that is not timed or a sun rule without a location', () => {
    const entry = scheduled({ on: 'time', at: '07:30' });
    expect(upcomingRuns([rule('Off', { ...entry, enabled: false })], today, UTC)).toEqual([]);
    expect(upcomingRuns([rule('Plain', null)], today, UTC)).toEqual([]);
    const sun = scheduled({ on: 'sun', event: 'sunset' });
    expect(upcomingRuns([rule('Sunset', sun)], today, UTC)).toEqual([]);
  });

  it('uses the sun times of the home location for a sun rule', () => {
    const sun = scheduled({ on: 'sun', event: 'sunset', offsetMinutes: -30 });
    const place: Place = { timeZone: 'UTC', location: { latitude: 51.5, longitude: 0 } };
    const [run] = upcomingRuns([rule('Sunset', sun)], today, place);
    expect(run?.at.getUTCHours()).toBeGreaterThanOrEqual(16);
    expect(run?.at.getUTCHours()).toBeLessThanOrEqual(17);
  });

  it('puts the runs of all rules in time order with a key of their own', () => {
    const late = scheduled({ on: 'time', at: '21:00' });
    const early = scheduled({ on: 'time', at: '06:00' });
    const runs = upcomingRuns([rule('Late', late, 'a'), rule('Early', early, 'b')], today, UTC);
    expect(runs.map((run) => run.name)).toEqual(['Early', 'Late']);
    expect(runs[0]).toMatchObject({
      automationId: 'b',
      key: 'b:2026-10-14T06:00:00.000Z',
    });
  });
});

describe('upcomingRuns reuse', () => {
  const nextWeek = {
    start: new Date('2026-10-14T00:00:00Z'),
    end: new Date('2026-10-21T00:00:00Z'),
  };

  it('reuses the computed times of an automation for the same window and inputs', () => {
    const entry = scheduled({ on: 'time', at: '06:00' });
    const first = upcomingRuns([rule('Early', entry)], nextWeek, UTC);
    const again = upcomingRuns([rule('Early', entry)], nextWeek, UTC);
    expect(again[0]?.at).toBe(first[0]?.at);
  });

  it('computes again when the window, enabled flag, last run or place changes', () => {
    const entry = scheduled({ on: 'every', minutes: 600 }, { lastRunAt: '2026-10-13T00:00:00Z' });
    const first = upcomingRuns([rule('Interval', entry)], nextWeek, UTC);
    const later = { ...nextWeek, start: new Date('2026-10-14T01:00:00Z') };
    expect(upcomingRuns([rule('Interval', entry)], later, UTC)[0]?.at).not.toBe(first[0]?.at);
    const ran = { ...entry, lastRunAt: '2026-10-13T01:00:00Z' };
    expect(times(upcomingRuns([rule('Interval', ran)], nextWeek, UTC))[0]).not.toBe(
      times(first)[0],
    );
    const paused = { ...entry, enabled: false };
    expect(upcomingRuns([rule('Interval', paused)], nextWeek, UTC)).toEqual([]);
  });

  it('keeps the cache per automation so rules do not share times', () => {
    const early = scheduled({ on: 'time', at: '06:00' });
    const late = scheduled({ on: 'time', at: '21:00' });
    const runs = upcomingRuns([rule('Early', early, 'a'), rule('Late', late, 'b')], nextWeek, UTC);
    expect(runs.slice(0, 2).map((run) => run.name)).toEqual(['Early', 'Late']);
  });
});
