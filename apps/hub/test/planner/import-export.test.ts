import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlannerCollectionRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportCollectionText, exportItemText } from '../../src/planner/ical/export';
import { importIcs } from '../../src/planner/ical/import';
import { readCalendar } from '../../src/planner/ical/read';
import { calendarOf, eventOf } from '../support/ical';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const ZONE = 'America/New_York';

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'ical', name), 'utf8');

let test: TestStore;
let profileId: string;
let calendar: PlannerCollectionRow;

function newCalendar(name: string): PlannerCollectionRow {
  return test.store.plannerCollections.insert({
    profile_id: profileId,
    kind: 'calendar',
    name,
    colour: 'work',
    icon: 'calendar',
    position: 1,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
  });
}

function importInto(target: PlannerCollectionRow, text: string): ReturnType<typeof importIcs> {
  return importIcs(test.store, () => NOW, {
    profileId,
    collectionId: target.id,
    text,
    defaultZone: ZONE,
  });
}

beforeEach(async () => {
  test = await testStore(() => NOW);
  profileId = test.store.profiles.create({ name: 'Ann' }).id;
  calendar = newCalendar('Family');
});

afterEach(async () => {
  await test.close();
});

describe('import', () => {
  it('imports a Google export with its series, exception, guests and reminder', () => {
    const result = importInto(calendar, fixture('google.ics'));
    expect(result).toMatchObject({ added: 3, updated: 0, unchanged: 0 });
    const rows = test.store.plannerItems.inCollection(calendar.id);
    const master = rows.find(
      (row) => row.ical_uid === 'standup-1@google.com' && row.series_id === null,
    );
    expect(master).toMatchObject({
      title: 'Standup',
      notes: 'Daily sync\nBring notes, please',
      location: 'Room 4, Floor 2',
      start_local: '2026-11-09T09:00:00',
      end_local: '2026-11-09T09:30:00',
      time_zone: 'Europe/Berlin',
      rrule: 'FREQ=WEEKLY;COUNT=4;BYDAY=MO',
      exdates: ['2026-11-16T09:00:00'],
      reminders: [{ minutes_before: 10 }],
      ical_sequence: 2,
      start: '2026-11-09T08:00:00.000Z',
    });
    expect(master?.series_end).toBe('2026-11-30T08:30:00.000Z');
    const moved = rows.find((row) => row.series_id === master?.id);
    expect(moved).toMatchObject({
      title: 'Standup moved',
      original_start: '2026-11-23T09:00:00',
      start_local: '2026-11-23T10:00:00',
      ical_sequence: 3,
      rrule: null,
    });
    const guests = test.store.plannerGuests.forItem(master?.id ?? '');
    expect(
      guests
        .map((guest) => [guest.email, guest.name, guest.response, guest.delivery])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    ).toEqual([
      ['ida@example.com', 'Ida', 'needs_action', 'not_sent'],
      ['sam@example.com', 'Sam Lee', 'yes', 'not_sent'],
    ]);
  });

  it('moves a UTC event into the calendar zone and keeps all-day items as dates', () => {
    importInto(calendar, fixture('google.ics'));
    const rows = test.store.plannerItems.inCollection(calendar.id);
    expect(rows.find((row) => row.title === 'Dentist')).toMatchObject({
      start_local: '2026-11-10T19:00:00',
      end_local: '2026-11-10T20:00:00',
      time_zone: 'Europe/Berlin',
    });
    expect(rows.find((row) => row.title === 'Christmas')).toMatchObject({
      all_day: true,
      start_local: '2026-12-25',
      end_local: '2026-12-26',
      time_zone: null,
    });
  });

  it('reports every part it could not use', () => {
    const result = importInto(calendar, fixture('google.ics'));
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        { part: 'attachment', detail: 'ATTACH', count: 1 },
        { part: 'attendee', detail: 'ORGANIZER', count: 1 },
        { part: 'property', detail: 'TRANSP', count: 2 },
      ]),
    );
  });

  it('reads Outlook zone names and zones that only have a definition', () => {
    const result = importInto(calendar, fixture('outlook.ics'));
    expect(result.added).toBe(3);
    const rows = test.store.plannerItems.inCollection(calendar.id);
    expect(rows.find((row) => row.title === 'Review')).toMatchObject({
      time_zone: 'Europe/Berlin',
      start_local: '2026-11-12T15:00:00',
      reminders: [{ minutes_before: 15 }],
      priority: null,
    });
    expect(rows.find((row) => row.title === 'Plant shift')).toMatchObject({
      time_zone: 'UTC',
      start_local: '2026-11-13T04:30:00',
    });
    expect(rows.find((row) => row.title === 'Plant day')).toMatchObject({
      all_day: true,
      rrule: 'FREQ=MONTHLY;BYDAY=3FR;UNTIL=20270320',
    });
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ part: 'timezone', count: 1 }),
    );
  });

  it('reads floating times in the home zone, to-dos, steps and refuses nothing silently', () => {
    const result = importInto(calendar, fixture('apple.ics'));
    expect(result.added).toBe(5);
    const rows = test.store.plannerItems.inCollection(calendar.id);
    expect(rows.find((row) => row.title === 'Dinner')).toMatchObject({
      time_zone: ZONE,
      start_local: '2026-11-11T19:00:00',
      reminders: [{ minutes_before: 60 }],
    });
    expect(rows.find((row) => row.title === 'Trip')).toMatchObject({
      end_local: '2026-12-03',
      all_day: true,
    });
    const passport = rows.find((row) => row.title === 'Renew passport');
    expect(passport).toMatchObject({ kind: 'task', due_date: '2026-11-30', priority: 1 });
    expect(rows.find((row) => row.title === 'Pay invoice')).toMatchObject({
      status: 'done',
      due_at: '2026-11-15T09:00:00.000Z',
    });
    expect(rows.find((row) => row.title === 'Gather documents')?.parent_id).toBe(passport?.id);
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        { part: 'component', detail: 'VJOURNAL', count: 1 },
        { part: 'alarm', detail: 'an alarm at a fixed time', count: 1 },
        { part: 'property', detail: 'URL', count: 1 },
      ]),
    );
  });

  it('keeps an extra date and a cancelled occurrence of a series', () => {
    const text = calendarOf(
      eventOf(
        'DTSTART;TZID=Europe/Berlin:20261109T090000',
        'DTEND;TZID=Europe/Berlin:20261109T100000',
        'RRULE:FREQ=DAILY;COUNT=3',
        'RDATE;TZID=Europe/Berlin:20261201T090000',
      ),
      [
        'BEGIN:VEVENT',
        'UID:e1',
        'DTSTAMP:20261101T000000Z',
        'RECURRENCE-ID;TZID=Europe/Berlin:20261110T090000',
        'STATUS:CANCELLED',
        'DTSTART;TZID=Europe/Berlin:20261110T090000',
        'END:VEVENT',
      ].join('\r\n'),
    );
    importInto(calendar, text);
    const rows = test.store.plannerItems.inCollection(calendar.id);
    const master = rows.find((row) => row.series_id === null);
    expect(master?.exdates).toEqual(['2026-11-10T09:00:00']);
    const extra = rows.find((row) => row.series_id === master?.id);
    expect(extra).toMatchObject({
      original_start: '2026-12-01T09:00:00',
      start_local: '2026-12-01T09:00:00',
      end_local: '2026-12-01T10:00:00',
      rrule: null,
    });
    expect(rows).toHaveLength(2);
    expect(importInto(calendar, text)).toMatchObject({ unchanged: 1, updated: 0 });
  });

  it('refuses text that is not iCalendar', () => {
    expect(() => importInto(calendar, 'garbage')).toThrow(/not a readable iCalendar/u);
  });
});

describe('re-import', () => {
  it('leaves unchanged items alone and updates by UID', () => {
    importInto(calendar, fixture('google.ics'));
    expect(importInto(calendar, fixture('google.ics'))).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 3,
    });
    const edited = fixture('google.ics')
      .replace('SUMMARY:Standup\r', 'SUMMARY:Standup renamed\r')
      .replace('SEQUENCE:2', 'SEQUENCE:5');
    expect(importInto(calendar, edited)).toMatchObject({ added: 0, updated: 1, unchanged: 2 });
    const rows = test.store.plannerItems.inCollection(calendar.id);
    expect(rows.filter((row) => row.title.startsWith('Standup'))).toHaveLength(2);
    expect(
      rows.find((row) => row.ical_uid === 'standup-1@google.com' && row.series_id === null),
    ).toMatchObject({
      title: 'Standup renamed',
      ical_sequence: 5,
    });
  });

  it('skips a file that is older than what is stored', () => {
    importInto(calendar, fixture('google.ics'));
    const older = fixture('google.ics')
      .replace('SUMMARY:Standup\r', 'SUMMARY:Standup old\r')
      .replace('SEQUENCE:2', 'SEQUENCE:1');
    expect(importInto(calendar, older)).toMatchObject({ updated: 0, unchanged: 3 });
  });

  it('brings back an item that was trashed', () => {
    importInto(calendar, fixture('apple.ics'));
    const dinner = test.store.plannerItems
      .inCollection(calendar.id)
      .find((row) => row.title === 'Dinner');
    test.store.plannerItems.trash(dinner?.id ?? '', profileId);
    const again = importInto(calendar, fixture('apple.ics'));
    expect(again.added).toBe(1);
    expect(
      test.store.plannerItems.inCollection(calendar.id).filter((row) => row.title === 'Dinner'),
    ).toHaveLength(1);
  });
});

describe('export', () => {
  it('writes a calendar that reads back to the same items', () => {
    importInto(calendar, fixture('google.ics'));
    importInto(calendar, fixture('apple.ics'));
    const text = exportCollectionText(test.store, calendar, NOW);
    expect(text).toContain('BEGIN:VTIMEZONE');
    expect(text).toContain('TZID:Europe/Berlin');
    expect(text).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261123T090000');
    expect(text).toContain('EXDATE;TZID=Europe/Berlin:20261116T090000');
    expect(text).toContain('RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO');
    expect(text).toContain('TRIGGER:-PT10M');
    expect(text).toContain('ATTENDEE;CN=Sam Lee;PARTSTAT=ACCEPTED:mailto:sam@example.com');
    expect(text).toContain('STATUS:COMPLETED');
    expect(text).toContain('RELATED-TO:todo-1');
    const target = newCalendar('Copy');
    expect(importInto(target, text)).toMatchObject({ added: 8, updated: 0, unsupported: [] });
    const strip = (id: string): object[] =>
      test.store.plannerItems
        .inCollection(id)
        .map(
          ({
            id: _id,
            collection_id: _c,
            parent_id: _p,
            series_id: _s,
            position: _o,
            created_at: _a,
            updated_at: _u,
            ...rest
          }) => rest,
        )
        .sort((left, right) =>
          `${String(left.ical_uid)}${String(left.original_start)}`.localeCompare(
            `${String(right.ical_uid)}${String(right.original_start)}`,
          ),
        );
    expect(strip(target.id)).toEqual(strip(calendar.id));
    expect(importInto(calendar, text)).toMatchObject({ added: 0, updated: 0, unchanged: 8 });
  });

  it('writes one item with its steps and gives local items a stable UID', () => {
    const task = test.store.plannerItems.insert({
      ...baseTask(),
      title: 'Plan trip',
    });
    test.store.plannerItems.insert({ ...baseTask(), title: 'Book hotel', parent_id: task.id });
    const text = exportItemText(test.store, task, NOW);
    expect(text).toContain(`UID:${task.id}@smarteverything`);
    expect(text.match(/BEGIN:VTODO/gu)).toHaveLength(2);
    expect(text).toContain(`RELATED-TO:${task.id}@smarteverything`);
    const back = readCalendar(text, { defaultZone: ZONE });
    expect(back.entries.map((entry) => entry.title)).toEqual(['Plan trip', 'Book hotel']);
    expect(importInto(calendar, text)).toMatchObject({ added: 0, unchanged: 2 });
    const other = newCalendar('Other');
    expect(importInto(other, text)).toMatchObject({ added: 2 });
    expect(test.store.plannerItems.inCollection(other.id).map((row) => row.ical_uid)).toContain(
      `${task.id}@smarteverything`,
    );
  });
});

function baseTask(): Parameters<TestStore['store']['plannerItems']['insert']>[0] {
  return {
    profile_id: profileId,
    collection_id: calendar.id,
    kind: 'task',
    parent_id: null,
    title: 'Task',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'person',
  };
}
