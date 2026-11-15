import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

const BERLIN_SERIES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//contract//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:weekly-1@example.com',
  'SEQUENCE:2',
  'SUMMARY:Standup',
  'DTSTART;TZID=Europe/Berlin:20261109T090000',
  'DTEND;TZID=Europe/Berlin:20261109T093000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4',
  'EXDATE;TZID=Europe/Berlin:20261116T090000',
  'ATTENDEE;CN=Sam;PARTSTAT=ACCEPTED:mailto:sam@example.com',
  'ORGANIZER:mailto:ida@example.com',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT10M',
  'DESCRIPTION:reminder',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly-1@example.com',
  'RECURRENCE-ID;TZID=Europe/Berlin:20261123T090000',
  'SUMMARY:Standup moved',
  'DTSTART;TZID=Europe/Berlin:20261123T100000',
  'DTEND;TZID=Europe/Berlin:20261123T103000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday@example.com',
  'SUMMARY:Holiday',
  'DTSTART;VALUE=DATE:20261225',
  'DTEND;VALUE=DATE:20261226',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function jcalOf(text: string): unknown[] {
  const jcal: unknown = ICAL.parse(text);
  if (!Array.isArray(jcal)) throw new Error('the text did not parse to one calendar');
  return jcal;
}

function parsed(): readonly ICAL.Event[] {
  const calendar = new ICAL.Component(jcalOf(BERLIN_SERIES));
  for (const zone of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(zone);
  }
  return calendar.getAllSubcomponents('vevent').map((component) => new ICAL.Event(component));
}

function series(): { readonly master: ICAL.Event; readonly moved: ICAL.Event } {
  const events = parsed();
  const master = events.find(
    (event) => event.uid === 'weekly-1@example.com' && !event.isRecurrenceException(),
  );
  const moved = events.find((event) => event.isRecurrenceException());
  if (master === undefined || moved === undefined) {
    throw new Error('the sample calendar lost its series');
  }
  return { master, moved };
}

describe('ical.js contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'ical.js')).toBe(installedVersion('ical.js'));
  });

  it('reads the identity, sequence, zone and rule of a recurring event', () => {
    const { master } = series();
    expect(master.uid).toBe('weekly-1@example.com');
    expect(master.sequence).toBe(2);
    expect(master.summary).toBe('Standup');
    expect(master.isRecurring()).toBe(true);
    expect(master.startDate.zone.tzid).toBe('Europe/Berlin');
    expect(master.startDate.toString()).toBe('2026-11-09T09:00:00');
    expect(master.component.getFirstPropertyValue('rrule')?.toString()).toBe(
      'FREQ=WEEKLY;COUNT=4;BYDAY=MO',
    );
  });

  it('lists the excluded dates and the reminder trigger in seconds', () => {
    const { master } = series();
    expect(
      master.component
        .getAllProperties('exdate')
        .map((property) => String(property.getFirstValue())),
    ).toEqual(['2026-11-16T09:00:00']);
    const alarm = master.component.getFirstSubcomponent('valarm');
    expect(alarm?.getFirstPropertyValue('trigger')?.toString()).toBe('-PT10M');
    const trigger = alarm?.getFirstPropertyValue('trigger');
    expect(trigger instanceof ICAL.Duration ? trigger.toSeconds() : null).toBe(-600);
  });

  it('reads attendees with their answer and the organiser', () => {
    const { master } = series();
    expect(
      master.attendees.map((attendee) => [
        attendee.getParameter('cn'),
        attendee.getParameter('partstat'),
        attendee.getFirstValue(),
      ]),
    ).toEqual([['Sam', 'ACCEPTED', 'mailto:sam@example.com']]);
    expect(master.component.getFirstProperty('organizer')?.getFirstValue()).toBe(
      'mailto:ida@example.com',
    );
  });

  it('relates a moved occurrence to its series by RECURRENCE-ID and skips the excluded date', () => {
    const { master, moved } = series();
    master.relateException(moved);
    expect(moved.recurrenceId.toString()).toBe('2026-11-23T09:00:00');
    const iterator = master.iterator();
    const seen: string[][] = [];
    let next: unknown = iterator.next();
    while (next instanceof ICAL.Time && seen.length < 6) {
      const details = master.getOccurrenceDetails(next);
      seen.push([
        details.recurrenceId.toString(),
        details.startDate.toString(),
        details.item.summary,
      ]);
      next = iterator.next();
    }
    expect(seen).toEqual([
      ['2026-11-09T09:00:00', '2026-11-09T09:00:00', 'Standup'],
      ['2026-11-23T09:00:00', '2026-11-23T10:00:00', 'Standup moved'],
      ['2026-11-30T09:00:00', '2026-11-30T09:00:00', 'Standup'],
    ]);
  });

  it('tells an all-day event from a timed one', () => {
    const holiday = parsed().find((event) => event.uid === 'allday@example.com');
    expect(holiday?.startDate.isDate).toBe(true);
    expect(holiday?.startDate.toString()).toBe('2026-12-25');
    expect(holiday?.endDate.toString()).toBe('2026-12-26');
  });

  it('writes a calendar that parses back with escaped text, sequence, guest and rule', () => {
    const calendar = new ICAL.Component(['vcalendar', [], []]);
    calendar.updatePropertyWithValue('version', '2.0');
    calendar.updatePropertyWithValue('prodid', '-//contract//EN');
    const component = new ICAL.Component('vevent');
    const event = new ICAL.Event(component);
    event.uid = 'out-1@example.com';
    event.summary = 'Dinner, "fun"; yes';
    event.startDate = ICAL.Time.fromDateTimeString('2026-11-09T19:00:00');
    event.endDate = ICAL.Time.fromDateTimeString('2026-11-09T20:00:00');
    component.addPropertyWithValue('sequence', 3);
    const guest = component.addProperty(new ICAL.Property('attendee'));
    guest.setValue('mailto:sam@example.com');
    guest.setParameter('partstat', 'NEEDS-ACTION');
    guest.setParameter('rsvp', 'TRUE');
    component.addPropertyWithValue('rrule', ICAL.Recur.fromString('FREQ=DAILY;COUNT=2'));
    calendar.addSubcomponent(component);
    const text = calendar.toString();
    expect(text).toContain('SUMMARY:Dinner\\, "fun"\\; yes');
    expect(text).toContain('ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:sam@example.com');
    const vevent = new ICAL.Component(jcalOf(text)).getFirstSubcomponent('vevent');
    if (vevent === null) throw new Error('the written calendar has no VEVENT');
    const back = new ICAL.Event(vevent);
    expect(back.summary).toBe('Dinner, "fun"; yes');
    expect(back.sequence).toBe(3);
    expect(back.uid).toBe('out-1@example.com');
  });

  it('refuses text that is not iCalendar', () => {
    expect(() => {
      ICAL.parse('garbage');
    }).toThrow(/invalid line/u);
  });
});
