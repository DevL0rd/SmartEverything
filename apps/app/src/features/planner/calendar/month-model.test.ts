import {
  PLANNER_COLLECTION_ROW,
  PLANNER_OCCURRENCE_VIEW,
  type PlannerCollectionRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import {
  agendaDaysOf,
  agendaRowsOf,
  agendaWindowOf,
  dayMapOf,
  monthBoundsOf,
  monthDaysOf,
  monthWeeksOf,
  monthWindowOf,
  yearHeatOf,
  yearWindowOf,
  type AgendaRow,
} from './month-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const FAMILY = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const HEALTH = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const STAMP = '2026-11-01T08:00:00.000Z';
const ZONE = 'Europe/Berlin';
const TODAY = '2026-11-07';
const NOVEMBER = monthBoundsOf('2026-11');

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function calendar(
  collectionId: string,
  name: string,
  colour: 'family' | 'health',
): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: collectionId,
    profile_id: PROFILE,
    kind: 'calendar',
    name,
    colour,
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

const CALENDARS: readonly PlannerCollectionRow[] = [
  calendar(FAMILY, 'Family', 'family'),
  calendar(HEALTH, 'Health', 'health'),
];

function view(title: string, extra: Partial<PlannerOccurrenceView>): PlannerOccurrenceView {
  return PLANNER_OCCURRENCE_VIEW.parse({
    item_id: id(),
    occurrence_key: 'single',
    collection_id: FAMILY,
    kind: 'event',
    title,
    location: null,
    priority: null,
    all_day: false,
    start: null,
    end: null,
    due_at: null,
    due_date: null,
    status: 'open',
    recurring: false,
    moved: false,
    completed_at: null,
    completed_by: null,
    evidence: null,
    attachments: [],
    google_state: null,
    ...extra,
  });
}

function event(title: string, start: string, end: string): PlannerOccurrenceView {
  return view(title, { start, end });
}

function titlesOn(days: ReturnType<typeof dayMapOf>, day: string): readonly string[] {
  return (days.get(day) ?? []).map((entry) => entry.title);
}

describe('the month grid weeks', () => {
  it('shows as many week rows as the month spans, Monday first', () => {
    const november = monthDaysOf('2026-11');
    expect(november).toHaveLength(6);
    expect(november[0]?.[0]).toBe('2026-10-26');
    expect(november[5]).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
    expect(monthDaysOf('2027-02')).toHaveLength(4);
    expect(monthDaysOf('2026-03')).toHaveLength(6);
  });

  it('reads exactly the shown weeks in the calendar time zone', () => {
    expect(monthWindowOf('2026-11', ZONE)).toEqual({
      from: '2026-10-25T23:00:00.000Z',
      to: '2026-12-06T23:00:00.000Z',
    });
    expect(yearWindowOf('2026', ZONE)).toEqual({
      from: '2025-12-31T23:00:00.000Z',
      to: '2026-12-31T23:00:00.000Z',
    });
  });

  it('marks today, the selection and the days outside the month, and counts the rest', () => {
    const days = dayMapOf(
      ['A', 'B', 'C', 'D', 'E'].map((title, index) =>
        event(
          title,
          `2026-11-07T0${String(index + 1)}:00:00Z`,
          `2026-11-07T0${String(index + 1)}:30:00Z`,
        ),
      ),
      ZONE,
      NOVEMBER,
    );
    const weeks = monthWeeksOf({
      month: '2026-11',
      today: TODAY,
      selected: '2026-11-09',
      days,
      fits: 3,
    });
    const cells = weeks.flatMap((week) => week.cells);
    const seventh = cells.find((cell) => cell.day === TODAY);
    expect(seventh?.shown.map((entry) => entry.title)).toEqual(['A', 'B', 'C']);
    expect(seventh?.more).toBe(2);
    expect(seventh?.today).toBe(true);
    expect(seventh?.spoken).toBe('Saturday 7 November, 5 events');
    expect(cells.find((cell) => cell.day === '2026-11-09')?.selected).toBe(true);
    expect(cells.find((cell) => cell.day === '2026-10-26')?.inMonth).toBe(false);
    expect(cells.find((cell) => cell.day === '2026-11-30')?.inMonth).toBe(true);
  });
});

describe('placing occurrences on days', () => {
  it('puts a multi-day event on every day it touches and an all-day event up to its end', () => {
    const days = dayMapOf(
      [
        event('Night flight', '2026-11-07T21:00:00Z', '2026-11-08T07:00:00Z'),
        view('Alex visits', {
          all_day: true,
          start: '2026-11-09T00:00:00Z',
          end: '2026-11-11T00:00:00Z',
        }),
        event('Ends at midnight', '2026-11-12T20:00:00Z', '2026-11-12T23:00:00Z'),
      ],
      ZONE,
      NOVEMBER,
    );
    expect(titlesOn(days, '2026-11-07')).toEqual(['Night flight']);
    expect(titlesOn(days, '2026-11-08')).toEqual(['Night flight']);
    expect(titlesOn(days, '2026-11-09')).toEqual(['Alex visits']);
    expect(titlesOn(days, '2026-11-10')).toEqual(['Alex visits']);
    expect(titlesOn(days, '2026-11-11')).toEqual([]);
    expect(titlesOn(days, '2026-11-12')).toEqual(['Ends at midnight']);
    expect(titlesOn(days, '2026-11-13')).toEqual([]);
  });

  it('orders all-day first, then by time, then undated, and leaves out cancelled and proposed', () => {
    const days = dayMapOf(
      [
        view('Water the plants', { kind: 'task', due_date: TODAY }),
        event('Dinner', '2026-11-07T18:00:00Z', '2026-11-07T20:00:00Z'),
        view('Brush teeth', { kind: 'task', due_at: '2026-11-07T21:00:00Z' }),
        view('Birthday', { all_day: true, start: '2026-11-07T00:00:00Z', end: null }),
        event('Lunch', '2026-11-07T11:00:00Z', '2026-11-07T12:00:00Z'),
        view('Called off', { start: '2026-11-07T09:00:00Z', status: 'cancelled' }),
        view('Descale the kettle', { start: '2026-11-07T15:30:00Z', status: 'proposed' }),
      ],
      ZONE,
      NOVEMBER,
    );
    expect(titlesOn(days, TODAY)).toEqual([
      'Birthday',
      'Lunch',
      'Dinner',
      'Brush teeth',
      'Water the plants',
    ]);
  });
});

function heads(rows: readonly AgendaRow[]): readonly string[] {
  return rows.flatMap((row) =>
    row.kind === 'head' ? [`${row.head.label}: ${row.head.counts}`] : [],
  );
}

describe('the agenda', () => {
  const occurrences = [
    event('Walk on the treadmill', '2026-11-07T13:30:00Z', '2026-11-07T14:00:00Z'),
    view('Brush teeth', { kind: 'task', collection_id: HEALTH, due_at: '2026-11-07T21:00:00Z' }),
    event('Dinner with Alex and Priya', '2026-11-07T18:00:00Z', '2026-11-07T20:00:00Z'),
    event('Night flight', '2026-11-08T21:00:00Z', '2026-11-09T10:00:00Z'),
    view('Advent market', {
      all_day: true,
      start: '2026-12-01T00:00:00Z',
      end: '2026-12-02T00:00:00Z',
      google_state: 'synced',
    }),
  ];
  const window = agendaDaysOf(TODAY);
  const rowsFor = (query: string): readonly AgendaRow[] =>
    agendaRowsOf({
      days: dayMapOf(occurrences, ZONE, window),
      window,
      today: TODAY,
      collections: CALENDARS,
      timeZone: ZONE,
      query,
    });

  it('runs one month from the shown day', () => {
    expect(window).toEqual(['2026-11-07', '2026-12-06']);
    expect(agendaDaysOf('2026-01-31')).toEqual(['2026-01-31', '2026-02-27']);
    expect(agendaWindowOf(TODAY, ZONE)).toEqual({
      from: '2026-11-06T23:00:00.000Z',
      to: '2026-12-06T23:00:00.000Z',
    });
  });

  it('groups by day with counts, and names the month once it changes', () => {
    expect(heads(rowsFor(''))).toEqual([
      'Today, Saturday 7: 2 events · 1 task',
      'Sunday 8: 1 event',
      'Monday 9: 1 event',
      'Tuesday 1 December: 1 event',
    ]);
  });

  it('shows the times, the calendar and the edges of each day card', () => {
    const at = (moment: string): string => clock(moment, ZONE);
    const entries = rowsFor('').flatMap((row) =>
      row.kind === 'entry'
        ? [
            {
              time: row.entry.time,
              range: row.entry.range,
              detail: row.entry.detail,
              colour: row.entry.colour,
              google: row.entry.google,
              edge: row.edge,
            },
          ]
        : [],
    );
    const walkEnd = at('2026-11-07T14:00:00Z');
    const dinnerEnd = at('2026-11-07T20:00:00Z');
    const flight = at('2026-11-08T21:00:00Z');
    const landing = at('2026-11-09T10:00:00Z');
    expect(entries).toEqual([
      {
        time: at('2026-11-07T13:30:00Z'),
        range: `${at('2026-11-07T13:30:00Z')} to ${walkEnd}`,
        detail: `Family · until ${walkEnd}`,
        colour: 'family',
        google: false,
        edge: 'first',
      },
      {
        time: at('2026-11-07T18:00:00Z'),
        range: `${at('2026-11-07T18:00:00Z')} to ${dinnerEnd}`,
        detail: `Family · until ${dinnerEnd}`,
        colour: 'family',
        google: false,
        edge: 'middle',
      },
      {
        time: at('2026-11-07T21:00:00Z'),
        range: at('2026-11-07T21:00:00Z'),
        detail: 'Health · task',
        colour: 'health',
        google: false,
        edge: 'last',
      },
      {
        time: flight,
        range: flight,
        detail: 'Family',
        colour: 'family',
        google: false,
        edge: 'only',
      },
      {
        time: `Until ${landing}`,
        range: `Until ${landing}`,
        detail: 'Family',
        colour: 'family',
        google: false,
        edge: 'only',
      },
      {
        time: 'All day',
        range: 'All day',
        detail: 'Family',
        colour: 'family',
        google: true,
        edge: 'only',
      },
    ]);
  });

  it('searches titles, places and calendar names', () => {
    expect(heads(rowsFor('health'))).toEqual(['Today, Saturday 7: 1 task']);
    expect(heads(rowsFor('  FLIGHT '))).toEqual(['Sunday 8: 1 event', 'Monday 9: 1 event']);
    expect(rowsFor('nothing like this')).toEqual([]);
  });
});

describe('the year heatmap', () => {
  it('sums booked event hours per day, split at midnight, and scales levels to the busiest day', () => {
    const heat = yearHeatOf(
      '2026',
      [
        event('Workshop', '2026-03-02T08:00:00Z', '2026-03-02T16:00:00Z'),
        event('Late shift', '2026-03-03T21:00:00Z', '2026-03-04T01:00:00Z'),
        event('Standup', '2026-03-05T08:00:00Z', '2026-03-05T08:30:00Z'),
        view('All day trip', { all_day: true, start: '2026-03-06T00:00:00Z', end: null }),
        view('Task with a time', {
          kind: 'task',
          start: '2026-03-07T08:00:00Z',
          end: '2026-03-07T12:00:00Z',
        }),
        event('Last year', '2025-12-31T08:00:00Z', '2025-12-31T10:00:00Z'),
      ],
      ZONE,
    );
    expect(heat.months).toHaveLength(12);
    expect(heat.months[1]?.days).toHaveLength(28);
    const march = new Map(heat.months[2]?.days.map((day) => [day.day, day]));
    expect(march.get('2026-03-02')).toMatchObject({ pages: 8, level: 4 });
    expect(march.get('2026-03-03')).toMatchObject({ pages: 2, level: 1 });
    expect(march.get('2026-03-04')).toMatchObject({ pages: 2, level: 1 });
    expect(march.get('2026-03-05')).toMatchObject({ pages: 0.5, level: 1 });
    expect(march.get('2026-03-06')).toMatchObject({ pages: 0, level: 0 });
    expect(march.get('2026-03-07')).toMatchObject({ pages: 0, level: 0 });
    expect(heat.bookedMinutes).toBe(8 * 60 + 4 * 60 + 30);
  });
});
