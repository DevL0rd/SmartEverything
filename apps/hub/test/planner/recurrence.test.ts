import { describe, expect, it } from 'vitest';
import {
  checkSeries,
  nextOccurrence,
  occurrencesBetween,
  type RecurrenceSeries,
} from '../../src/planner/recurrence';

function timed(
  rrule: string,
  start = '2026-01-01T09:00',
  timeZone = 'UTC',
  exdates: readonly string[] = [],
): RecurrenceSeries {
  return { start, timeZone, rrule, exdates };
}

function allDay(
  rrule: string,
  start = '2026-01-01',
  exdates: readonly string[] = [],
): RecurrenceSeries {
  return { start, timeZone: null, rrule, exdates };
}

function range(series: RecurrenceSeries, from: string, to: string): readonly string[] {
  return occurrencesBetween(series, Temporal.Instant.from(from), Temporal.Instant.from(to)).map(
    (occurrence) => occurrence.local,
  );
}

const WIDE_FROM = '1990-01-01T00:00:00Z';
const WIDE_TO = '2100-01-01T00:00:00Z';

describe('RFC 5545 section 3.8.5.3 examples', () => {
  it('expands a daily rule for ten occurrences', () => {
    const days = range(timed('FREQ=DAILY;COUNT=10'), WIDE_FROM, WIDE_TO);
    expect(days).toHaveLength(10);
    expect(days[0]).toBe('2026-01-01T09:00:00');
    expect(days[9]).toBe('2026-01-10T09:00:00');
  });

  it('expands every other day until a date', () => {
    const days = range(timed('FREQ=DAILY;INTERVAL=2;UNTIL=20260109T090000Z'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual([
      '2026-01-01T09:00:00',
      '2026-01-03T09:00:00',
      '2026-01-05T09:00:00',
      '2026-01-07T09:00:00',
      '2026-01-09T09:00:00',
    ]);
  });

  it('expands weekly on Monday Wednesday and Friday', () => {
    const days = range(timed('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual([
      '2026-01-02T09:00:00',
      '2026-01-05T09:00:00',
      '2026-01-07T09:00:00',
      '2026-01-09T09:00:00',
      '2026-01-12T09:00:00',
      '2026-01-14T09:00:00',
    ]);
  });

  it('respects WKST when the interval skips weeks', () => {
    const monday = range(
      timed('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;WKST=MO;COUNT=4', '2025-08-05T09:00'),
      WIDE_FROM,
      WIDE_TO,
    );
    const sunday = range(
      timed('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;WKST=SU;COUNT=4', '2025-08-05T09:00'),
      WIDE_FROM,
      WIDE_TO,
    );
    expect(monday).toEqual([
      '2025-08-05T09:00:00',
      '2025-08-10T09:00:00',
      '2025-08-19T09:00:00',
      '2025-08-24T09:00:00',
    ]);
    expect(sunday).toEqual([
      '2025-08-05T09:00:00',
      '2025-08-17T09:00:00',
      '2025-08-19T09:00:00',
      '2025-08-31T09:00:00',
    ]);
  });

  it('expands every 15 minutes within hours', () => {
    const slots = range(timed('FREQ=DAILY;BYHOUR=9,10;BYMINUTE=0,30;COUNT=5'), WIDE_FROM, WIDE_TO);
    expect(slots).toEqual([
      '2026-01-01T09:00:00',
      '2026-01-01T09:30:00',
      '2026-01-01T10:00:00',
      '2026-01-01T10:30:00',
      '2026-01-02T09:00:00',
    ]);
  });
});

describe('BYDAY ordinals, BYMONTHDAY and BYSETPOS', () => {
  it('finds the first Friday of each month', () => {
    const days = range(timed('FREQ=MONTHLY;BYDAY=1FR;COUNT=3'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-02T09:00:00', '2026-02-06T09:00:00', '2026-03-06T09:00:00']);
  });

  it('finds the last Friday of each month', () => {
    const days = range(timed('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-30T09:00:00', '2026-02-27T09:00:00', '2026-03-27T09:00:00']);
  });

  it('finds the second Tuesday of March every year', () => {
    const days = range(timed('FREQ=YEARLY;BYMONTH=3;BYDAY=2TU;COUNT=3'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-03-10T09:00:00', '2027-03-09T09:00:00', '2028-03-14T09:00:00']);
  });

  it('counts a negative BYMONTHDAY from the end of the month', () => {
    const days = range(timed('FREQ=MONTHLY;BYMONTHDAY=-3;COUNT=3'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-29T09:00:00', '2026-02-26T09:00:00', '2026-03-29T09:00:00']);
  });

  it('skips months that lack day 31', () => {
    const days = range(timed('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-31T09:00:00', '2026-03-31T09:00:00', '2026-05-31T09:00:00']);
  });

  it('selects the last weekday of the month with BYSETPOS', () => {
    const days = range(
      timed('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3'),
      WIDE_FROM,
      WIDE_TO,
    );
    expect(days).toEqual(['2026-01-30T09:00:00', '2026-02-27T09:00:00', '2026-03-31T09:00:00']);
  });

  it('selects the second to last weekday with a negative BYSETPOS', () => {
    const days = range(
      timed('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=2'),
      WIDE_FROM,
      WIDE_TO,
    );
    expect(days).toEqual(['2026-01-29T09:00:00', '2026-02-26T09:00:00']);
  });

  it('selects the third instance of a weekday set with a positive BYSETPOS', () => {
    const days = range(timed('FREQ=MONTHLY;BYDAY=TU,WE,TH;BYSETPOS=3;COUNT=2'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-07T09:00:00', '2026-02-05T09:00:00']);
  });
});

describe('leap day', () => {
  it('recurs on 29 February only in leap years', () => {
    const days = range(
      timed('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=3', '2027-01-01T09:00'),
      WIDE_FROM,
      WIDE_TO,
    );
    expect(days).toEqual(['2028-02-29T09:00:00', '2032-02-29T09:00:00', '2036-02-29T09:00:00']);
  });

  it('expands a yearly rule starting on 29 February', () => {
    const days = range(timed('FREQ=YEARLY;COUNT=3', '2024-02-29T09:00'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2024-02-29T09:00:00', '2028-02-29T09:00:00', '2032-02-29T09:00:00']);
  });
});

describe('UNTIL and COUNT', () => {
  it('includes an occurrence that falls exactly on UNTIL', () => {
    const days = range(timed('FREQ=DAILY;UNTIL=20260103T090000Z'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-01T09:00:00', '2026-01-02T09:00:00', '2026-01-03T09:00:00']);
  });

  it('stops before an occurrence after UNTIL', () => {
    const days = range(timed('FREQ=DAILY;UNTIL=20260103T085959Z'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-01T09:00:00', '2026-01-02T09:00:00']);
  });

  it('ends an all-day rule on a date UNTIL', () => {
    const days = range(allDay('FREQ=DAILY;UNTIL=20260103'), WIDE_FROM, WIDE_TO);
    expect(days).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('counts occurrences from the start', () => {
    expect(range(timed('FREQ=WEEKLY;COUNT=4'), WIDE_FROM, WIDE_TO)).toHaveLength(4);
  });

  it('returns nothing from next once COUNT is exhausted', () => {
    const series = timed('FREQ=DAILY;COUNT=2');
    expect(nextOccurrence(series, Temporal.Instant.from('2026-01-02T09:00:00Z'))).toBeNull();
  });

  it('rejects a date UNTIL on a timed start', () => {
    expect(checkSeries(timed('FREQ=DAILY;UNTIL=20260103'))).toMatchObject({
      ok: false,
      failure: 'type-mismatch',
    });
  });

  it('rejects a date-time UNTIL on an all-day start', () => {
    expect(checkSeries(allDay('FREQ=DAILY;UNTIL=20260103T000000Z'))).toMatchObject({
      ok: false,
      failure: 'type-mismatch',
    });
  });

  it('rejects COUNT together with UNTIL', () => {
    expect(checkSeries(timed('FREQ=DAILY;COUNT=2;UNTIL=20260103T090000Z'))).toMatchObject({
      ok: false,
      failure: 'invalid',
    });
  });
});

describe('EXDATE', () => {
  it('removes a timed occurrence by its local date-time', () => {
    const series = timed('FREQ=DAILY;COUNT=4', '2026-01-01T09:00', 'Europe/Berlin', [
      '2026-01-02T09:00',
    ]);
    expect(range(series, WIDE_FROM, WIDE_TO)).toEqual([
      '2026-01-01T09:00:00',
      '2026-01-03T09:00:00',
      '2026-01-04T09:00:00',
    ]);
  });

  it('removes an all-day occurrence by date', () => {
    const series = allDay('FREQ=DAILY;COUNT=3', '2026-01-01', ['2026-01-02']);
    expect(range(series, WIDE_FROM, WIDE_TO)).toEqual(['2026-01-01', '2026-01-03']);
  });

  it('rejects a date EXDATE on a timed start', () => {
    expect(
      checkSeries(timed('FREQ=DAILY', '2026-01-01T09:00', 'UTC', ['2026-01-02'])),
    ).toMatchObject({
      ok: false,
      failure: 'type-mismatch',
    });
  });

  it('rejects a date-time EXDATE on an all-day start', () => {
    expect(checkSeries(allDay('FREQ=DAILY', '2026-01-01', ['2026-01-02T09:00']))).toMatchObject({
      ok: false,
      failure: 'type-mismatch',
    });
  });

  it('skips an excluded occurrence in next', () => {
    const series = timed('FREQ=DAILY', '2026-01-01T09:00', 'UTC', ['2026-01-02T09:00']);
    const next = nextOccurrence(series, Temporal.Instant.from('2026-01-01T09:00:00Z'));
    expect(next?.local).toBe('2026-01-03T09:00:00');
  });
});

describe('daylight saving time', () => {
  it('keeps the wall time across a spring forward change', () => {
    const series = timed('FREQ=DAILY;COUNT=3', '2026-03-07T09:00', 'America/New_York');
    const found = occurrencesBetween(
      series,
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant?.toString())).toEqual([
      '2026-03-07T14:00:00Z',
      '2026-03-08T13:00:00Z',
      '2026-03-09T13:00:00Z',
    ]);
  });

  it('moves an occurrence in the spring forward gap to the compatible time', () => {
    const series = timed('FREQ=DAILY;COUNT=3', '2026-03-07T02:30', 'America/New_York');
    const found = occurrencesBetween(
      series,
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant?.toString())).toEqual([
      '2026-03-07T07:30:00Z',
      '2026-03-08T07:30:00Z',
      '2026-03-09T06:30:00Z',
    ]);
  });

  it('stops a gap-shifted daily rule at an UNTIL instant', () => {
    const series = timed(
      'FREQ=DAILY;UNTIL=20260308T073000Z',
      '2026-03-07T02:30',
      'America/New_York',
    );
    const found = occurrencesBetween(
      series,
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant?.toString())).toEqual([
      '2026-03-07T07:30:00Z',
      '2026-03-08T07:30:00Z',
    ]);
  });

  it('fires once at the first occurrence of a repeated autumn hour', () => {
    const series = timed('FREQ=DAILY;COUNT=3', '2026-10-31T01:30', 'America/New_York');
    const found = occurrencesBetween(
      series,
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant?.toString())).toEqual([
      '2026-10-31T05:30:00Z',
      '2026-11-01T05:30:00Z',
      '2026-11-02T06:30:00Z',
    ]);
  });

  it('keeps an hourly rule on exact elapsed hours through the change', () => {
    const series = timed('FREQ=HOURLY;COUNT=3', '2026-03-08T00:00', 'America/New_York');
    const found = occurrencesBetween(
      series,
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant?.toString())).toEqual([
      '2026-03-08T05:00:00Z',
      '2026-03-08T06:00:00Z',
      '2026-03-08T07:00:00Z',
    ]);
  });

  it('keeps an all-day rule on its dates', () => {
    const found = range(allDay('FREQ=DAILY;COUNT=3', '2026-03-07'), WIDE_FROM, WIDE_TO);
    expect(found).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });
});

describe('next occurrence and ranges', () => {
  it('finds the next occurrence after an instant far in the future with no horizon', () => {
    const next = nextOccurrence(timed('FREQ=DAILY'), Temporal.Instant.from('2090-06-15T09:00:00Z'));
    expect(next?.local).toBe('2090-06-16T09:00:00');
    expect(next?.instant?.toString()).toBe('2090-06-16T09:00:00Z');
  });

  it('includes the instant itself only when inclusive', () => {
    const at = Temporal.Instant.from('2026-01-02T09:00:00Z');
    expect(nextOccurrence(timed('FREQ=DAILY'), at)?.local).toBe('2026-01-03T09:00:00');
    expect(nextOccurrence(timed('FREQ=DAILY'), at, true)?.local).toBe('2026-01-02T09:00:00');
  });

  it('finds a yearly leap day occurrence years ahead', () => {
    const next = nextOccurrence(
      timed('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2027-01-01T09:00'),
      Temporal.Instant.from('2027-01-01T00:00:00Z'),
    );
    expect(next?.local).toBe('2028-02-29T09:00:00');
  });

  it('returns the first occurrence for an instant before the start', () => {
    const next = nextOccurrence(timed('FREQ=DAILY'), Temporal.Instant.from('2020-01-01T00:00:00Z'));
    expect(next?.local).toBe('2026-01-01T09:00:00');
  });

  it('treats a range as start inclusive and end exclusive', () => {
    const days = range(timed('FREQ=DAILY'), '2026-01-03T09:00:00Z', '2026-01-05T09:00:00Z');
    expect(days).toEqual(['2026-01-03T09:00:00', '2026-01-04T09:00:00']);
  });

  it('gives all-day occurrences no instant', () => {
    const found = occurrencesBetween(
      allDay('FREQ=DAILY;COUNT=2'),
      Temporal.Instant.from(WIDE_FROM),
      Temporal.Instant.from(WIDE_TO),
    );
    expect(found.map((o) => o.instant)).toEqual([null, null]);
  });
});

describe('validation', () => {
  it('accepts a normal rule', () => {
    expect(checkSeries(timed('FREQ=WEEKLY;BYDAY=MO'))).toEqual({ ok: true });
  });

  it('rejects 30 February as impossible', () => {
    expect(checkSeries(timed('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'))).toMatchObject({
      ok: false,
      failure: 'impossible',
    });
  });

  it('rejects day 31 of a 30 day month as impossible', () => {
    expect(checkSeries(timed('FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31'))).toMatchObject({
      ok: false,
      failure: 'impossible',
    });
  });

  it('rejects an unknown frequency', () => {
    expect(checkSeries(timed('FREQ=BOGUS'))).toMatchObject({ ok: false, failure: 'invalid' });
  });

  it('rejects a zero interval', () => {
    expect(checkSeries(timed('FREQ=DAILY;INTERVAL=0'))).toMatchObject({
      ok: false,
      failure: 'invalid',
    });
  });

  it('rejects an unknown time zone', () => {
    expect(checkSeries(timed('FREQ=DAILY', '2026-01-01T09:00', 'Mars/Base'))).toMatchObject({
      ok: false,
      failure: 'invalid',
    });
  });

  it('rejects a rule that smuggles another iCalendar line', () => {
    expect(checkSeries(timed('FREQ=DAILY\nEXDATE:20260101T090000Z'))).toMatchObject({
      ok: false,
      failure: 'invalid',
    });
  });

  it('rejects an all-day start with a time zone', () => {
    expect(
      checkSeries({ start: '2026-01-01', timeZone: 'UTC', rrule: 'FREQ=DAILY', exdates: [] }),
    ).toMatchObject({ ok: false, failure: 'type-mismatch' });
  });

  it('rejects a timed start without a time zone', () => {
    expect(
      checkSeries({ start: '2026-01-01T09:00', timeZone: null, rrule: 'FREQ=DAILY', exdates: [] }),
    ).toMatchObject({ ok: false, failure: 'type-mismatch' });
  });
});
