import { describe, expect, it } from 'vitest';
import {
  clock,
  dayBoundsOf,
  dayLabel,
  dayRelationOf,
  localDayKey,
  zonedInstant,
  zonedStartOfDay,
} from './time';

const MOMENT = '2026-10-10T21:17:51.403Z';
const NOW = Date.parse('2026-10-12T12:00:00.000Z');

describe('cached formatters', () => {
  it('match the locale methods they replace', () => {
    expect(clock(MOMENT, 'America/Edmonton')).toBe(
      new Date(MOMENT).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Edmonton',
      }),
    );
    expect(dayLabel(MOMENT, NOW, 'America/Edmonton')).toBe(
      new Date(MOMENT).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Edmonton',
      }),
    );
  });

  it('labels today and yesterday per now and zone', () => {
    const at = '2026-10-12T06:30:00.000Z';
    const sameDay = Date.parse('2026-10-12T20:00:00.000Z');
    const nextDay = Date.parse('2026-10-13T20:00:00.000Z');
    expect(dayLabel(at, sameDay, 'America/Edmonton')).toBe('Today');
    expect(dayLabel(at, nextDay, 'America/Edmonton')).toBe('Yesterday');
    expect(dayLabel(at, Date.parse('2026-10-12T10:00:00.000Z'), 'Asia/Tokyo')).toBe('Today');
    expect(dayLabel(at, sameDay, 'Asia/Tokyo')).toBe('Yesterday');
    expect(dayLabel(at, sameDay + 3 * 86_400_000, 'Asia/Tokyo')).not.toMatch(/Today|Yesterday/);
    expect(dayLabel(at, sameDay, 'America/Edmonton')).toBe('Today');
  });

  it('keeps zones apart and repeats the same answer', () => {
    expect(localDayKey(MOMENT, 'America/Edmonton')).toBe('2026-10-10');
    expect(localDayKey(MOMENT, 'Asia/Tokyo')).toBe('2026-10-11');
    expect(localDayKey(MOMENT, 'Asia/Tokyo')).toBe('2026-10-11');
  });
});

describe('localDayKey on this device', () => {
  const reference = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  it('names the same day the locale formatter does, across years, leap days and clock changes', () => {
    const step = 37 * 60_000 + 13_000;
    const mismatches: string[] = [];
    for (
      let at = Date.parse('1999-12-30T00:00:00Z');
      at < Date.parse('2031-01-02T00:00:00Z');
      at += step
    ) {
      if (localDayKey(at) !== reference.format(new Date(at)))
        mismatches.push(new Date(at).toISOString());
    }
    expect(mismatches).toEqual([]);
  });

  it('accepts a date, a timestamp or an ISO string', () => {
    const moment = '2026-10-12T12:00:00.000Z';
    expect(localDayKey(new Date(moment))).toBe(localDayKey(Date.parse(moment)));
    expect(localDayKey(moment)).toBe(localDayKey(Date.parse(moment)));
  });

  it('refuses an invalid date like the formatter does', () => {
    expect(() => localDayKey('not a date')).toThrow(RangeError);
  });
});

describe('dayRelationOf', () => {
  const now = Date.parse('2026-10-12T20:00:00.000Z');

  it('names today, yesterday and earlier in the zone given', () => {
    expect(dayRelationOf('2026-10-12T06:30:00.000Z', now, 'America/Edmonton')).toBe('today');
    expect(dayRelationOf('2026-10-11T06:30:00.000Z', now, 'America/Edmonton')).toBe('yesterday');
    expect(dayRelationOf('2026-10-10T06:30:00.000Z', now, 'America/Edmonton')).toBe('earlier');
  });

  it('moves the day boundary with the zone', () => {
    const at = '2026-10-12T06:30:00.000Z';
    expect(dayRelationOf(at, now, 'America/Edmonton')).toBe('today');
    expect(dayRelationOf(at, now, 'Asia/Tokyo')).toBe('yesterday');
  });
});

describe('dayBoundsOf', () => {
  it('spans the day in the zone given, however long that day is', () => {
    const bounds = dayBoundsOf('2026-11-01', 'America/Edmonton');
    expect(new Date(bounds.start).toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(new Date(bounds.end).toISOString()).toBe('2026-11-02T07:00:00.000Z');
  });

  it('spans the day of this device when no zone is given', () => {
    const bounds = dayBoundsOf('2026-10-16', null);
    expect(bounds.start).toBe(new Date(2026, 9, 16).getTime());
    expect(bounds.end).toBe(new Date(2026, 9, 17).getTime());
  });
});

describe('zonedStartOfDay', () => {
  it('starts a day at the zone midnight', () => {
    expect(new Date(zonedStartOfDay('2026-01-15', 'Asia/Bangkok')).toISOString()).toBe(
      '2026-01-14T17:00:00.000Z',
    );
  });

  it('uses the offset in force at local midnight on the day clocks go forward', () => {
    expect(new Date(zonedStartOfDay('2026-03-08', 'America/New_York')).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(new Date(zonedStartOfDay('2026-03-09', 'America/New_York')).toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('uses the offset in force at local midnight on the day clocks go back', () => {
    expect(new Date(zonedStartOfDay('2026-11-01', 'America/New_York')).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(new Date(zonedStartOfDay('2026-11-02', 'America/New_York')).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('places a wall-clock time after the change at the new offset', () => {
    expect(new Date(zonedInstant('2026-03-08', 7 * 60, 'America/New_York')).toISOString()).toBe(
      '2026-03-08T11:00:00.000Z',
    );
  });
});
