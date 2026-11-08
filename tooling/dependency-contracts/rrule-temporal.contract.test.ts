import { describe, expect, it } from 'vitest';
import { RRuleTemporal } from 'rrule-temporal';
import { HUB_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

const NEW_YORK_DAILY = [
  'DTSTART;TZID=America/New_York:20260306T023000',
  'RRULE:FREQ=DAILY;COUNT=4',
].join('\n');

const NEW_YORK_DAILY_WITH_EXDATE = [
  'DTSTART;TZID=America/New_York:20260306T023000',
  'RRULE:FREQ=DAILY;COUNT=4',
  'EXDATE;TZID=America/New_York:20260307T023000',
].join('\n');

function instants(values: readonly { toString(): string }[]): readonly string[] {
  return values.map((value) => value.toString());
}

describe('rrule-temporal contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'rrule-temporal')).toBe(
      installedVersion('rrule-temporal'),
    );
  });

  it('runs on the native Temporal of the runtime', () => {
    expect(typeof Reflect.get(globalThis, 'Temporal')).toBe('object');
    const rule = new RRuleTemporal({ rruleString: NEW_YORK_DAILY });
    expect(Object.prototype.toString.call(rule.all()[0])).toBe('[object Temporal.ZonedDateTime]');
  });

  it('skips the day whose wall time falls in the DST gap instead of shifting it, and COUNT counts only real instants', () => {
    const rule = new RRuleTemporal({ rruleString: NEW_YORK_DAILY });
    expect(instants(rule.all())).toEqual([
      '2026-03-06T02:30:00-05:00[America/New_York]',
      '2026-03-07T02:30:00-05:00[America/New_York]',
      '2026-03-09T02:30:00-04:00[America/New_York]',
      '2026-03-10T02:30:00-04:00[America/New_York]',
    ]);
  });

  it('removes the dates listed in EXDATE with the same zone, and COUNT still counts them', () => {
    const rule = new RRuleTemporal({ rruleString: NEW_YORK_DAILY_WITH_EXDATE });
    expect(instants(rule.all())).toEqual([
      '2026-03-06T02:30:00-05:00[America/New_York]',
      '2026-03-09T02:30:00-04:00[America/New_York]',
      '2026-03-10T02:30:00-04:00[America/New_York]',
    ]);
  });

  it('returns the instants inside a window with between, inclusive bounds only when asked', () => {
    const rule = new RRuleTemporal({ rruleString: NEW_YORK_DAILY });
    const from = new Date('2026-03-07T07:30:00Z');
    const to = new Date('2026-03-10T06:30:00Z');
    expect(instants(rule.between(from, to, true))).toEqual([
      '2026-03-07T02:30:00-05:00[America/New_York]',
      '2026-03-09T02:30:00-04:00[America/New_York]',
      '2026-03-10T02:30:00-04:00[America/New_York]',
    ]);
    expect(instants(rule.between(from, to, false))).toEqual([
      '2026-03-09T02:30:00-04:00[America/New_York]',
    ]);
  });

  it('finds the next instant after a moment with no horizon', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=Europe/Berlin:20260101T073000\nRRULE:FREQ=DAILY',
    });
    const next = rule.next(new Date('2031-06-15T12:00:00Z'));
    expect(Object.prototype.toString.call(next)).toBe('[object Temporal.ZonedDateTime]');
    expect(next?.toString()).toBe('2031-06-16T07:30:00+02:00[Europe/Berlin]');
  });

  it('keeps the wall time across the end of daylight saving time', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=America/New_York:20261030T223000\nRRULE:FREQ=DAILY;COUNT=4',
    });
    expect(instants(rule.all())).toEqual([
      '2026-10-30T22:30:00-04:00[America/New_York]',
      '2026-10-31T22:30:00-04:00[America/New_York]',
      '2026-11-01T22:30:00-05:00[America/New_York]',
      '2026-11-02T22:30:00-05:00[America/New_York]',
    ]);
  });
});
