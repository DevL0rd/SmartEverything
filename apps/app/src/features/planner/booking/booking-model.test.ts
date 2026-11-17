import { clockFormatOf } from '../../../format/clock-text';
import type {
  PlannerBookingPageRow,
  PlannerCollectionRow,
  PlannerGuestRow,
  PlannerItemRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { changesOf, createBodyOf, draftOf, draftProblemOf } from './booking-draft';
import {
  aheadTextOf,
  availabilitySummaryOf,
  bookingCalendarsOf,
  bookingLinkOf,
  bookingPageOrderOf,
  bookingWeekOf,
  pageBookingsOf,
  cellsOf,
  paintedCells,
  spanTextOf,
  upcomingBookingsOf,
  gridSpanOf,
  hourSpanOf,
  nextDaysOf,
  weeklyMinutesOf,
  weeklyTextOf,
  windowsOf,
  workingWindowsOf,
} from './booking-model';

const ME = '00000000-0000-4000-8000-000000000001';
const WORK = '00000000-0000-4000-8000-000000000020';
const AT = '2026-11-14T10:00:00.000Z';
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const name = (day: number): string => NAMES[day] ?? '';
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

function page(patch: Partial<PlannerBookingPageRow> = {}): PlannerBookingPageRow {
  return {
    id: '00000000-0000-4000-8000-000000000400',
    profile_id: ME,
    collection_id: WORK,
    title: 'Intro call',
    description: '',
    minutes: 30,
    availability: [{ day: 1, start: '09:00', end: '17:00' }],
    buffer_before: 0,
    buffer_after: 0,
    notice_minutes: 240,
    ahead_days: 30,
    location: null,
    enabled: true,
    token: 't'.repeat(43),
    created_at: AT,
    updated_at: AT,
    ...patch,
  };
}

function booking(id: string, start: string, patch: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return {
    id,
    profile_id: ME,
    collection_id: WORK,
    kind: 'event',
    parent_id: null,
    title: `Intro call: ${id}`,
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
    start,
    end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
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
    created_by: 'booking',
    created_at: AT,
    updated_at: AT,
    deleted_at: null,
    ...patch,
  };
}

function collection(
  label: string,
  kind: PlannerCollectionRow['kind'],
  source: PlannerCollectionRow['source'],
): PlannerCollectionRow {
  return {
    id: WORK,
    profile_id: ME,
    kind,
    name: label,
    colour: 'work',
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source,
    google: null,
    feed: null,
    created_at: AT,
    updated_at: AT,
  };
}

function guest(itemId: string, patch: Partial<PlannerGuestRow> = {}): PlannerGuestRow {
  return {
    id: `${itemId.slice(0, -3)}900`,
    item_id: itemId,
    kind: 'email',
    profile_id: null,
    email: 'sam@example.com',
    name: 'Sam',
    response: 'yes',
    note: null,
    delivery: 'sent',
    delivery_detail: null,
    invited_at: AT,
    responded_at: AT,
    ...patch,
  };
}

const H24 = clockFormatOf(true);
const H12 = clockFormatOf(false);

describe('the availability grid', () => {
  it('turns windows into half hour cells and back, merging touching runs', () => {
    const windows = [
      { day: 1, start: '09:00', end: '10:00' },
      { day: 1, start: '10:00', end: '11:30' },
      { day: 3, start: '13:30', end: '14:00' },
    ];
    expect(cellsOf(windows).size).toBe(6);
    expect(windowsOf(cellsOf(windows))).toEqual([
      { day: 1, start: '09:00', end: '11:30' },
      { day: 3, start: '13:30', end: '14:00' },
    ]);
  });

  it('rounds a window outward to whole half hours and ends the last one at 23:59', () => {
    const late = [{ day: 0, start: '22:10', end: '23:59' }];
    expect(windowsOf(cellsOf(late))).toEqual([{ day: 0, start: '22:00', end: '23:59' }]);
  });

  it('paints a rectangle of days and slots on or off', () => {
    const on = paintedCells(new Set(), { day: 1, slot: 18 }, { day: 5, slot: 19 }, true);
    expect(windowsOf(on)).toEqual(
      [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '10:00' })),
    );
    const off = paintedCells(on, { day: 3, slot: 18 }, { day: 3, slot: 19 }, false);
    expect(windowsOf(off).map((window) => window.day)).toEqual([1, 2, 4, 5]);
  });

  it('uses the working hours preference for a new page and adds up the weekly time', () => {
    const windows = workingWindowsOf({ days: [5, 1], start: '09:00', end: '17:30' });
    expect(windows).toEqual([
      { day: 1, start: '09:00', end: '17:30' },
      { day: 5, start: '09:00', end: '17:30' },
    ]);
    expect(weeklyMinutesOf(windows)).toBe(17 * 60);
    expect(workingWindowsOf({ days: [1], start: '18:00', end: '09:00' })).toEqual([]);
  });

  it('summarises the week by runs of days with the same times', () => {
    const weekdays = workingWindowsOf({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    expect(availabilitySummaryOf(weekdays, MONDAY_FIRST, name, H24)).toBe('Mon–Fri 09:00–17:00');
    expect(availabilitySummaryOf(weekdays, MONDAY_FIRST, name, H12)).toBe(
      `Mon–Fri ${H12.text('09:00')}–${H12.text('17:00')}`,
    );
    expect(
      availabilitySummaryOf(
        [
          { day: 2, start: '10:00', end: '11:00' },
          { day: 4, start: '10:00', end: '11:00' },
        ],
        MONDAY_FIRST,
        name,
        H24,
      ),
    ).toBe('Tue 10:00–11:00 · Thu 10:00–11:00');
    expect(availabilitySummaryOf([], MONDAY_FIRST, name, H24)).toBe('No open times');
  });
});

describe('the booking page link', () => {
  it('uses the public address, else the hub address the app uses, else waits', () => {
    const token = 'a'.repeat(43);
    expect(bookingLinkOf(token, { publicUrl: 'https://home.example/', hubUrl: null })).toEqual({
      url: `https://home.example/book/${token}`,
      reach: 'public',
    });
    expect(bookingLinkOf(token, { publicUrl: null, hubUrl: 'http://192.168.1.5:8787' })).toEqual({
      url: `http://192.168.1.5:8787/book/${token}`,
      reach: 'home',
    });
    expect(bookingLinkOf(token, { publicUrl: null, hubUrl: null })).toEqual({
      url: null,
      reach: 'unknown',
    });
  });

  it('lists pages that are on first, then by name', () => {
    const pages = bookingPageOrderOf([
      page({ id: '00000000-0000-4000-8000-000000000401', title: 'B', enabled: false }),
      page({ id: '00000000-0000-4000-8000-000000000402', title: 'C' }),
      page({ id: '00000000-0000-4000-8000-000000000403', title: 'A' }),
    ]);
    expect(pages.map((entry) => entry.title)).toEqual(['A', 'C', 'B']);
  });

  it('offers only own calendars that are not feeds', () => {
    const rows = [
      collection('a', 'calendar', 'local'),
      collection('b', 'list', 'local'),
      collection('c', 'calendar', 'feed'),
      collection('d', 'calendar', 'google'),
    ];
    expect(bookingCalendarsOf(rows).map((row) => row.name)).toEqual(['a', 'd']);
  });
});

describe('the bookings', () => {
  const A = '00000000-0000-4000-8000-000000000501';
  const B = '00000000-0000-4000-8000-000000000502';
  const C = '00000000-0000-4000-8000-000000000503';
  const D = '00000000-0000-4000-8000-000000000504';
  const items = [
    booking(B, '2026-11-18T09:00:00.000Z'),
    booking(A, '2026-11-16T09:00:00.000Z'),
    booking(C, '2026-11-17T09:00:00.000Z', { status: 'cancelled' }),
    booking(D, '2026-11-13T09:00:00.000Z'),
    booking('00000000-0000-4000-8000-000000000505', '2026-11-16T12:00:00.000Z', {
      created_by: 'person',
    }),
  ];

  it('lists live bookings that have not ended, soonest first, with the booker', () => {
    const now = Date.parse('2026-11-14T11:00:00.000Z');
    const upcoming = upcomingBookingsOf(items, [guest(A), guest(B, { name: null })], now);
    expect(upcoming.map((entry) => entry.item.id)).toEqual([A, B]);
    expect(upcoming[0]?.booker?.name).toBe('Sam');
    expect(upcoming[1]?.booker?.email).toBe('sam@example.com');
  });

  it('counts the bookings of each day of the week', () => {
    const dayOf = (moment: number): string => new Date(moment).toISOString().slice(0, 10);
    const days = ['2026-11-16', '2026-11-17', '2026-11-18'];
    expect(bookingWeekOf(items, days, dayOf)).toEqual([
      { day: '2026-11-16', count: 1 },
      { day: '2026-11-17', count: 0 },
      { day: '2026-11-18', count: 1 },
    ]);
  });

  it('counts each booking page on its own', () => {
    const intro = '00000000-0000-4000-8000-000000000401';
    const review = '00000000-0000-4000-8000-000000000402';
    const dayOf = (moment: number): string => new Date(moment).toISOString().slice(0, 10);
    const paged = [
      booking(A, '2026-11-16T09:00:00.000Z', { booking_page_id: intro }),
      booking(B, '2026-11-16T11:00:00.000Z', { booking_page_id: review }),
      booking(D, '2026-11-17T11:00:00.000Z', { booking_page_id: intro }),
    ];
    expect(
      bookingWeekOf(pageBookingsOf(paged, intro), ['2026-11-16', '2026-11-17'], dayOf),
    ).toEqual([
      { day: '2026-11-16', count: 1 },
      { day: '2026-11-17', count: 1 },
    ]);
    expect(pageBookingsOf(paged, review).map((item) => item.id)).toEqual([B]);
  });

  it('shows the seven days from today and zooms the strip to the open hours', () => {
    const shift = (day: string, by: number): string => {
      const at = new Date(`${day}T12:00:00.000Z`);
      at.setUTCDate(at.getUTCDate() + by);
      return at.toISOString().slice(0, 10);
    };
    expect(nextDaysOf('2026-11-14', shift)).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
    expect(
      hourSpanOf([
        { day: 1, start: '09:30', end: '12:00' },
        { day: 2, start: '14:00', end: '17:45' },
      ]),
    ).toEqual({ from: 9 * 60, to: 18 * 60 });
    expect(hourSpanOf([])).toEqual({ from: 0, to: 24 * 60 });
    const day = { start: '07:00', end: '22:00' };
    expect(gridSpanOf([], day)).toEqual({ from: 7 * 60, to: 22 * 60 });
    expect(gridSpanOf([{ day: 1, start: '05:30', end: '08:00' }], day)).toEqual({
      from: 5 * 60,
      to: 22 * 60,
    });
    expect(gridSpanOf([], { start: '07:00', end: '01:00' })).toEqual({ from: 0, to: 24 * 60 });
    expect(gridSpanOf([], null)).toEqual({ from: 0, to: 24 * 60 });
    expect(weeklyTextOf(24 * 60)).toBe('24 h a week');
    expect(weeklyTextOf(90)).toBe('1 h 30 min a week');
    expect(weeklyTextOf(0)).toBe('No open times yet');
  });
});

describe('the booking page editor', () => {
  const defaults = { availability: [{ day: 1, start: '09:00', end: '17:00' }], collectionId: WORK };

  it('starts a new page from the working hours and the first calendar', () => {
    const draft = draftOf(null, defaults);
    expect(draft.availability).toEqual(defaults.availability);
    expect(draft.collection_id).toBe(WORK);
    expect(draftProblemOf(draft)).toBe('title');
    expect(createBodyOf(draft)).toBeNull();
    expect(createBodyOf({ ...draft, title: ' Intro ', location: '  ' })).toMatchObject({
      title: 'Intro',
      location: null,
      enabled: true,
    });
    expect(draftProblemOf({ ...draft, title: 'Intro', collection_id: null })).toBe('calendar');
  });

  it('sends only the fields that changed and nothing when nothing did', () => {
    const row = page();
    const draft = draftOf(row, defaults);
    expect(changesOf(row, draft)).toBeNull();
    expect(changesOf(row, { ...draft, minutes: 45, location: 'Studio' })).toEqual({
      minutes: 45,
      location: 'Studio',
    });
    const availability = [{ day: 2, start: '09:00', end: '12:00' }];
    expect(changesOf(row, { ...draft, availability })).toEqual({ availability });
  });

  it('writes lengths, buffers and notice in days, hours and minutes', () => {
    expect(spanTextOf(0)).toBe('None');
    expect(spanTextOf(45)).toBe('45 min');
    expect(spanTextOf(90)).toBe('1 h 30 min');
    expect(spanTextOf(24 * 60 + 60)).toBe('1 day 1 h');
    expect(aheadTextOf(14)).toBe('2 weeks');
    expect(aheadTextOf(10)).toBe('10 days');
    expect(aheadTextOf(1)).toBe('1 day');
  });
});
