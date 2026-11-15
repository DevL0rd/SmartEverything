import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import type { IcalEntry } from '../../src/planner/ical/model';
import { timezoneComponent } from '../../src/planner/ical/vtimezone';
import { writeCalendar } from '../../src/planner/ical/write';
import { first, NOW, read } from '../support/ical';

function offsetSeconds(zone: ICAL.Timezone, instant: Temporal.Instant): number {
  const utc = instant
    .toZonedDateTimeISO('UTC')
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
  const time = ICAL.Time.fromDateTimeString(`${utc}Z`);
  return zone.utcOffset(time);
}

describe('writing', () => {
  const entry = (over: Partial<IcalEntry>): IcalEntry => ({
    title: 'Meeting',
    notes: '',
    location: null,
    timing: {
      start: '2026-11-09T09:00:00',
      end: '2026-11-09T10:00:00',
      zone: 'Europe/Berlin',
      allDay: false,
    },
    kind: 'event',
    uid: 'w1@test',
    sequence: 0,
    rrule: null,
    exdates: [],
    extraDates: [],
    reminders: [],
    guests: [],
    overrides: [],
    task: null,
    cancelled: false,
    parentUid: null,
    ...over,
  });

  it.each([
    'Europe/Berlin',
    'America/New_York',
    'Australia/Sydney',
    'Pacific/Auckland',
    'Asia/Kolkata',
    'America/Sao_Paulo',
    'Asia/Tokyo',
  ])('describes %s so that clients get the same offsets', (zone) => {
    const component = timezoneComponent(zone, 2026);
    const rules = new ICAL.Timezone(component);
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const day of [3, 15, 28]) {
        const instant = Temporal.ZonedDateTime.from(
          `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00[UTC]`,
        ).toInstant();
        const expected = instant.toZonedDateTimeISO(zone).offsetNanoseconds / 1e9;
        expect(offsetSeconds(rules, instant)).toBe(expected);
      }
    }
  });

  it('writes a zone without changes as one standard observance', () => {
    const text = timezoneComponent('Asia/Tokyo', 2026).toString();
    expect(text).toContain('BEGIN:STANDARD');
    expect(text).not.toContain('RRULE');
    expect(text).toContain('TZOFFSETTO:+0900');
  });

  it('writes UTC times without a zone definition and all-day events with an exclusive end', () => {
    const text = writeCalendar(
      [
        entry({
          timing: {
            start: '2026-11-09T09:00:00',
            end: '2026-11-09T10:00:00',
            zone: 'UTC',
            allDay: false,
          },
        }),
        entry({
          uid: 'w2@test',
          timing: { start: '2026-12-24', end: '2026-12-26', zone: null, allDay: true },
        }),
      ],
      { name: 'Test', now: NOW },
    );
    expect(text).toContain('DTSTART:20261109T090000Z');
    expect(text).not.toContain('BEGIN:VTIMEZONE');
    expect(text).toContain('DTSTART;VALUE=DATE:20261224');
    expect(text).toContain('DTEND;VALUE=DATE:20261227');
    expect(text).toContain('X-WR-CALNAME:Test');
    expect(text).toContain('DTSTAMP:20261114T120000Z');
  });

  it('escapes and folds text and keeps it readable', () => {
    const notes = `Line one, with; special\\chars\n${'long '.repeat(40)}`;
    const text = writeCalendar([entry({ notes, title: 'Dinner, "fun"; yes' })], {
      name: null,
      now: NOW,
    });
    expect(text).toContain(String.raw`SUMMARY:Dinner\, "fun"\; yes`);
    expect(text.split('\r\n').every((line) => line.length <= 76)).toBe(true);
    const back = first(text);
    expect(back.title).toBe('Dinner, "fun"; yes');
    expect(back.notes).toBe(notes);
  });

  it('round-trips a series with an exception, reminders and guests through text', () => {
    const original = entry({
      rrule: 'FREQ=WEEKLY;COUNT=6;BYDAY=MO,WE',
      exdates: ['2026-11-11T09:00:00'],
      reminders: [10, 1440],
      guests: [
        { email: 'a@example.com', name: 'A', response: 'yes' },
        { email: 'b@example.com', name: null, response: 'needs_action' },
      ],
      overrides: [
        {
          originalStart: '2026-11-16T09:00:00',
          sequence: 4,
          content: {
            title: 'Moved',
            notes: '',
            location: 'Elsewhere',
            timing: {
              start: '2026-11-16T14:00:00',
              end: '2026-11-16T15:00:00',
              zone: 'Europe/Berlin',
              allDay: false,
            },
          },
        },
      ],
    });
    const back = first(writeCalendar([original], { name: null, now: NOW }));
    expect(back).toEqual(original);
  });

  it('round-trips tasks with due dates, priority, completion and a parent', () => {
    const task = entry({
      kind: 'task',
      uid: 't1@test',
      timing: null,
      task: {
        dueDate: '2026-11-30',
        dueAt: null,
        priority: 2,
        done: true,
        completedAt: '2026-11-14T08:00:00.000Z',
      },
      parentUid: 'p@test',
    });
    const timed = entry({
      kind: 'task',
      uid: 't2@test',
      timing: null,
      task: {
        dueDate: null,
        dueAt: '2026-11-15T09:00:00.000Z',
        priority: null,
        done: false,
        completedAt: null,
      },
    });
    const calendar = read(writeCalendar([task, timed], { name: null, now: NOW }));
    expect(calendar.entries).toEqual([task, timed]);
  });

  it('writes a cancelled item and a local-zone series that reads back in the same zone', () => {
    const cancelled = entry({ cancelled: true });
    const text = writeCalendar([cancelled], { name: null, now: NOW });
    expect(text).toContain('STATUS:CANCELLED');
    expect(first(text).cancelled).toBe(true);
    const sydney = entry({
      timing: { start: '2026-11-09T09:00:00', end: null, zone: 'Australia/Sydney', allDay: false },
      rrule: 'FREQ=DAILY;COUNT=3',
    });
    expect(first(writeCalendar([sydney], { name: null, now: NOW })).timing).toEqual(sydney.timing);
  });
});
