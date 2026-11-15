import { describe, expect, it } from 'vitest';
import { IcalParseError, unsupportedSummary } from '../../src/planner/ical/model';
import { calendarOf, eventOf, first, fixture, read, ZONE } from '../support/ical';

describe('reading real-world calendars', () => {
  it('reads a Google series with its exclusion, exception, reminder and guests', () => {
    const calendar = read(fixture('google.ics'));
    expect(calendar.entries.map((entry) => entry.uid)).toEqual([
      'standup-1@google.com',
      'dentist-2@google.com',
      'xmas-3@google.com',
    ]);
    const [series] = calendar.entries;
    expect(series).toMatchObject({
      title: 'Standup',
      notes: 'Daily sync\nBring notes, please',
      location: 'Room 4, Floor 2',
      sequence: 2,
      rrule: 'FREQ=WEEKLY;COUNT=4;BYDAY=MO',
      exdates: ['2026-11-16T09:00:00'],
      reminders: [10],
      timing: {
        start: '2026-11-09T09:00:00',
        end: '2026-11-09T09:30:00',
        zone: 'Europe/Berlin',
        allDay: false,
      },
    });
    expect(series?.overrides).toEqual([
      {
        originalStart: '2026-11-23T09:00:00',
        sequence: 3,
        content: {
          title: 'Standup moved',
          notes: '',
          location: null,
          timing: {
            start: '2026-11-23T10:00:00',
            end: '2026-11-23T10:30:00',
            zone: 'Europe/Berlin',
            allDay: false,
          },
        },
      },
    ]);
    expect(series?.guests).toEqual([
      { email: 'sam@example.com', name: 'Sam Lee', response: 'yes' },
      { email: 'ida@example.com', name: 'Ida', response: 'needs_action' },
    ]);
  });

  it('reads an all-day event with an exclusive end as its last day', () => {
    const entries = read(fixture('google.ics')).entries;
    expect(entries.find((entry) => entry.uid === 'xmas-3@google.com')?.timing).toEqual({
      start: '2026-12-25',
      end: '2026-12-26',
      zone: null,
      allDay: true,
    });
  });

  it('maps Windows zone names and falls back to the zone rules, listing both', () => {
    const calendar = read(fixture('outlook.ics'));
    const zones = Object.fromEntries(calendar.entries.map((entry) => [entry.title, entry.timing]));
    expect(zones['Review']).toMatchObject({ zone: 'Europe/Berlin', start: '2026-11-12T15:00:00' });
    expect(zones['Plant shift']).toMatchObject({ zone: 'UTC', start: '2026-11-13T04:30:00' });
    expect(unsupportedSummary(calendar.unsupported)).toContainEqual({
      part: 'timezone',
      detail:
        'The time zone "Contoso Plant Time" has no standard name, so its times were converted to UTC',
      count: 1,
    });
  });

  it('reads Apple floating times in the home zone and to-dos with parents', () => {
    const calendar = read(fixture('apple.ics'));
    const byUid = new Map(calendar.entries.map((entry) => [entry.uid, entry]));
    expect(byUid.get('3F2A9C00-1111-4444-8888-ABCDEF012345')?.timing).toMatchObject({
      zone: ZONE,
      start: '2026-11-11T19:00:00',
    });
    expect(byUid.get('todo-1')?.task).toMatchObject({ dueDate: '2026-11-30', priority: 1 });
    expect(byUid.get('todo-3')?.parentUid).toBe('todo-1');
    expect(byUid.get('todo-2')?.task).toMatchObject({
      done: true,
      dueAt: '2026-11-15T09:00:00.000Z',
      completedAt: '2026-11-14T08:00:00.000Z',
    });
  });
});

describe('time zones and times', () => {
  it('keeps a recurring UTC event in UTC and moves a single one into the calendar zone', () => {
    const recurring = first(
      calendarOf(eventOf('DTSTART:20261109T090000Z', 'DTEND:20261109T100000Z', 'RRULE:FREQ=DAILY')),
    );
    expect(recurring.timing).toMatchObject({ zone: 'UTC', start: '2026-11-09T09:00:00' });
    const single = first(calendarOf(eventOf('DTSTART:20261109T090000Z', 'DTEND:20261109T100000Z')));
    expect(single.timing).toMatchObject({ zone: ZONE, start: '2026-11-09T04:00:00' });
  });

  it('reads the calendar time zone from X-WR-TIMEZONE for floating times', () => {
    const text = calendarOf('X-WR-TIMEZONE:Asia/Tokyo', eventOf('DTSTART:20261109T090000'));
    expect(first(text).timing).toMatchObject({ zone: 'Asia/Tokyo' });
  });

  it('reads an unknown time zone in the calendar zone and says so', () => {
    const calendar = read(
      calendarOf(eventOf('DTSTART;TZID=Nowhere/Land:20261109T090000', 'DURATION:PT45M')),
    );
    expect(calendar.entries[0]?.timing).toMatchObject({
      zone: ZONE,
      end: '2026-11-09T09:45:00',
    });
    expect(calendar.unsupported[0]).toMatchObject({ part: 'timezone' });
  });

  it('converts an end given in another zone and refuses an end before the start', () => {
    const converted = first(
      calendarOf(
        eventOf(
          'DTSTART;TZID=Europe/Berlin:20261109T090000',
          'DTEND;TZID=Europe/London:20261109T100000',
        ),
      ),
    );
    expect(converted.timing).toMatchObject({ zone: 'Europe/Berlin', end: '2026-11-09T11:00:00' });
    const reversed = read(
      calendarOf(eventOf('DTSTART:20261109T090000Z', 'DTEND:20261109T080000Z')),
    );
    expect(reversed.entries[0]?.timing?.end).toBeNull();
    expect(reversed.unsupported).toContainEqual({
      part: 'property',
      detail: 'DTEND before DTSTART',
    });
  });

  it('reads multi-day and duration based all-day events', () => {
    const span = first(
      calendarOf(eventOf('DTSTART;VALUE=DATE:20261109', 'DTEND;VALUE=DATE:20261112')),
    );
    expect(span.timing).toMatchObject({ start: '2026-11-09', end: '2026-11-11' });
    const day = first(calendarOf(eventOf('DTSTART;VALUE=DATE:20261109')));
    expect(day.timing).toMatchObject({ start: '2026-11-09', end: null });
  });
});

describe('recurrence', () => {
  it('turns exclusions, extra dates and cancelled occurrences into the item model', () => {
    const entry = first(
      calendarOf(
        eventOf(
          'DTSTART;TZID=Europe/Berlin:20261109T090000',
          'DTEND;TZID=Europe/Berlin:20261109T100000',
          'RRULE:FREQ=DAILY;COUNT=5',
          'EXDATE;TZID=Europe/Berlin:20261110T090000,20261111T090000',
          'RDATE;TZID=Europe/Berlin:20261201T090000',
        ),
        [
          'BEGIN:VEVENT',
          'UID:e1',
          'DTSTAMP:20261101T000000Z',
          'RECURRENCE-ID;TZID=Europe/Berlin:20261112T090000',
          'STATUS:CANCELLED',
          'DTSTART;TZID=Europe/Berlin:20261112T090000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(entry.exdates).toEqual(['2026-11-10T09:00:00', '2026-11-11T09:00:00']);
    expect(entry.extraDates).toEqual(['2026-12-01T09:00:00']);
    expect(entry.overrides).toEqual([
      { originalStart: '2026-11-12T09:00:00', content: null, sequence: 0 },
    ]);
  });

  it('converts an exclusion given in UTC into the series zone', () => {
    const entry = first(
      calendarOf(
        eventOf(
          'DTSTART;TZID=Europe/Berlin:20261109T090000',
          'RRULE:FREQ=DAILY;COUNT=3',
          'EXDATE:20261110T080000Z',
        ),
      ),
    );
    expect(entry.exdates).toEqual(['2026-11-10T09:00:00']);
  });

  it('uses a date UNTIL for all-day events and a date-time UNTIL for timed ones', () => {
    const allDay = first(
      calendarOf(
        eventOf('DTSTART;VALUE=DATE:20261109', 'RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z'),
      ),
    );
    expect(allDay.rrule).toBe('FREQ=WEEKLY;UNTIL=20261231');
    const timed = first(
      calendarOf(
        eventOf('DTSTART;TZID=Europe/Berlin:20261109T090000', 'RRULE:FREQ=WEEKLY;UNTIL=20261231'),
      ),
    );
    expect(timed.rrule).toBe('FREQ=WEEKLY;UNTIL=20261231T235959');
  });

  it('imports an event whose rule the Planner cannot run as a single event and lists the rule', () => {
    const calendar = read(
      calendarOf(eventOf('DTSTART:20261109T090000Z', 'RRULE:FREQ=WEEKLY;BYMONTHDAY=3')),
    );
    expect(calendar.entries[0]?.rrule).toBeNull();
    expect(calendar.unsupported[0]).toMatchObject({ part: 'recurrence' });
  });

  it('lists RANGE=THISANDFUTURE and EXRULE and keeps an orphan exception as its own event', () => {
    const calendar = read(
      calendarOf(
        [
          'BEGIN:VEVENT',
          'UID:lone',
          'DTSTAMP:20261101T000000Z',
          'RECURRENCE-ID;RANGE=THISANDFUTURE:20261109T090000Z',
          'SUMMARY:Lone',
          'DTSTART:20261109T100000Z',
          'EXRULE:FREQ=DAILY',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(calendar.entries).toHaveLength(1);
    expect(calendar.entries[0]?.uid).toBe('lone#2026-11-09T09:00:00Z');
    expect(calendar.unsupported).toContainEqual({ part: 'recurrence', detail: 'EXRULE' });
  });
});

describe('reminders, guests and the parts left out', () => {
  it('reads reminders relative to the start or the end and lists the others', () => {
    const calendar = read(
      calendarOf(
        eventOf(
          'DTSTART:20261109T090000Z',
          'DTEND:20261109T100000Z',
          'BEGIN:VALARM',
          'TRIGGER;RELATED=END:-PT90M',
          'ACTION:DISPLAY',
          'END:VALARM',
          'BEGIN:VALARM',
          'TRIGGER:-PT1H',
          'ACTION:EMAIL',
          'END:VALARM',
          'BEGIN:VALARM',
          'TRIGGER:PT5M',
          'ACTION:DISPLAY',
          'END:VALARM',
          'BEGIN:VALARM',
          'TRIGGER;VALUE=DATE-TIME:20261109T080000Z',
          'ACTION:DISPLAY',
          'END:VALARM',
        ),
      ),
    );
    expect(calendar.entries[0]?.reminders).toEqual([30, 60]);
    expect(calendar.unsupported.map((item) => item.detail)).toEqual([
      'an alarm after the start',
      'an alarm at a fixed time',
    ]);
  });

  it('maps answers, merges repeated guests and lists attendees without an email', () => {
    const calendar = read(
      calendarOf(
        eventOf(
          'DTSTART:20261109T090000Z',
          'ATTENDEE;PARTSTAT=DECLINED;CN=Al:mailto:Al@example.com',
          'ATTENDEE;PARTSTAT=TENTATIVE:mailto:al@example.com',
          'ATTENDEE;CUTYPE=ROOM:mailto:room@example.com',
          'ATTENDEE:tel:+123',
          'ATTENDEE:mailto:not-an-email',
        ),
      ),
    );
    expect(calendar.entries[0]?.guests).toEqual([
      { email: 'al@example.com', name: null, response: 'maybe' },
    ]);
    expect(calendar.unsupported.filter((item) => item.part === 'attendee')).toHaveLength(3);
  });

  it('lists the event priority, status and unknown components instead of dropping them', () => {
    const calendar = read(
      calendarOf(
        eventOf('DTSTART:20261109T090000Z', 'PRIORITY:1', 'X-CUSTOM:yes', 'CATEGORIES:a,b'),
        'BEGIN:VFREEBUSY\r\nUID:f\r\nEND:VFREEBUSY',
      ),
    );
    expect(
      unsupportedSummary(calendar.unsupported)
        .map((item) => item.detail)
        .sort(),
    ).toEqual(['CATEGORIES', 'PRIORITY on an event', 'VFREEBUSY', 'X-CUSTOM']);
  });

  it('lists an event without a start and a second item with the same UID', () => {
    const calendar = read(
      calendarOf(
        eventOf('UID:a', 'SUMMARY:No start'),
        eventOf('UID:b', 'DTSTART:20261109T090000Z', 'SUMMARY:One'),
        eventOf('UID:b', 'DTSTART:20261110T090000Z', 'SUMMARY:Two'),
      ),
    );
    expect(calendar.entries.map((entry) => entry.title)).toEqual(['One']);
    expect(calendar.unsupported.map((item) => item.detail)).toEqual([
      'an event without a start',
      'a second item with the same UID',
    ]);
  });

  it('refuses text that is not a calendar and reads an empty calendar', () => {
    expect(() => read('garbage')).toThrow(IcalParseError);
    expect(() => read('BEGIN:VEVENT\r\nEND:VEVENT')).toThrow(IcalParseError);
    expect(read(calendarOf()).entries).toEqual([]);
  });

  it('gives an item without a UID a stable one', () => {
    const text = calendarOf(
      ['BEGIN:VEVENT', 'DTSTART:20261109T090000Z', 'SUMMARY:No uid', 'END:VEVENT'].join('\r\n'),
    );
    expect(first(text).uid).toBe(first(text).uid);
    expect(first(text).uid).toMatch(/@imported$/u);
  });

  it('reads the feed refresh interval', () => {
    expect(read(calendarOf('REFRESH-INTERVAL;VALUE=DURATION:PT90M')).refreshMinutes).toBe(90);
    expect(read(calendarOf('X-PUBLISHED-TTL:P1D')).refreshMinutes).toBe(1440);
    expect(read(calendarOf('X-PUBLISHED-TTL:nonsense')).refreshMinutes).toBeNull();
    expect(read(calendarOf()).refreshMinutes).toBeNull();
  });
});
