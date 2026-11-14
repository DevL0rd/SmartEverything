import {
  PLANNER_COLLECTION_ROW,
  PLANNER_DAY,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock24 } from '../../../format/time';
import {
  FADE_FROM_MINUTES,
  fadeStepsOf,
  riverCaptionOf,
  riverKeyOf,
  riverOccurrencesOf,
  riverRowsOf,
  riverSubtitleOf,
  riverTimeOf,
  sameSteps,
  type RiverInput,
} from './river-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const FAMILY = 'a1b2c3d4-0000-4000-8000-000000000002';
const HOME = 'a1b2c3d4-0000-4000-8000-000000000003';
const LENS = 'a1b2c3d4-0000-4000-8000-000000000010';
const DENTIST = 'a1b2c3d4-0000-4000-8000-000000000011';
const RECYCLING = 'a1b2c3d4-0000-4000-8000-000000000012';
const COOK = 'a1b2c3d4-0000-4000-8000-000000000013';
const DINNER = 'a1b2c3d4-0000-4000-8000-000000000014';
const BRUSH = 'a1b2c3d4-0000-4000-8000-000000000015';
const BIRTHDAY = 'a1b2c3d4-0000-4000-8000-000000000016';
const ANYTIME = 'a1b2c3d4-0000-4000-8000-000000000017';
const MEETING = 'a1b2c3d4-0000-4000-8000-000000000018';
const ZONE = 'Europe/Berlin';
const STAMP = '2026-11-01T00:00:00.000Z';
const NOW = Date.parse('2026-11-07T13:20:00.000Z');
const MINUTE = 60_000;

function collection(
  id: string,
  name: string,
  colour: PlannerCollectionRow['colour'],
): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id,
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

const COLLECTIONS = [collection(FAMILY, 'Family', 'family'), collection(HOME, 'Home', 'home')];

function item(id: string, estimate: number | null): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id,
    profile_id: PROFILE,
    collection_id: HOME,
    kind: 'task',
    parent_id: null,
    title: 'Cook dinner',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: estimate,
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
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
  });
}

function view(
  itemId: string,
  title: string,
  start: string | null,
  extra: Partial<PlannerOccurrenceView> = {},
): PlannerOccurrenceView {
  return {
    item_id: itemId,
    occurrence_key: 'single',
    collection_id: HOME,
    kind: 'task',
    title,
    location: null,
    priority: null,
    all_day: false,
    start,
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
  };
}

const LENS_VIEW = view(LENS, 'Walk on the treadmill', '2026-11-07T13:30:00.000Z');
const DENTIST_VIEW = view(DENTIST, 'Dentist', '2026-11-07T14:30:00.000Z', {
  kind: 'event',
  end: '2026-11-07T15:15:00.000Z',
  location: 'Smile Dental',
  google_state: 'synced',
});
const RECYCLING_VIEW = view(RECYCLING, 'Take out the recycling', '2026-11-07T16:00:00.000Z', {
  google_state: 'sending',
});
const COOK_VIEW = view(COOK, 'Cook dinner', '2026-11-07T17:30:00.000Z');
const DINNER_VIEW = view(DINNER, 'Dinner with Alex and Priya', '2026-11-07T18:00:00.000Z', {
  kind: 'event',
  collection_id: FAMILY,
  end: '2026-11-07T20:00:00.000Z',
});
const BRUSH_VIEW = view(BRUSH, 'Brush teeth', '2026-11-07T21:00:00.000Z');
const BIRTHDAY_VIEW = view(BIRTHDAY, 'Priya’s birthday', null, { kind: 'event', all_day: true });
const ANYTIME_VIEW = view(ANYTIME, 'Water the plants', null, { due_date: '2026-11-07' });
const MEETING_VIEW = view(MEETING, 'Stand-up', '2026-11-07T13:00:00.000Z', {
  kind: 'event',
  end: '2026-11-07T13:45:00.000Z',
});

function dayOf(overrides: Partial<PlannerDay> = {}): PlannerDay {
  return PLANNER_DAY.parse({
    date: '2026-11-07',
    time_zone: ZONE,
    now: '2026-11-07T13:20:00.000Z',
    missed: [],
    current: [],
    upcoming: [
      LENS_VIEW,
      ANYTIME_VIEW,
      DINNER_VIEW,
      DENTIST_VIEW,
      BRUSH_VIEW,
      RECYCLING_VIEW,
      COOK_VIEW,
      BIRTHDAY_VIEW,
    ],
    done: [],
    happened: [],
    rings: [],
    next_alarm_at: null,
    strip: [],
    ...overrides,
  });
}

function input(day: PlannerDay, hidden: ReadonlySet<string> = new Set()): RiverInput {
  return { day, collections: COLLECTIONS, items: [item(COOK, 45)], hidden };
}

function titles(occurrences: readonly { readonly title: string }[]): readonly string[] {
  return occurrences.map((occurrence) => occurrence.title);
}

describe('riverOccurrencesOf', () => {
  it('leaves out the item the now lens shows and orders the rest of the day by time', () => {
    expect(titles(riverOccurrencesOf(dayOf()))).toEqual([
      'Priya’s birthday',
      'Dentist',
      'Take out the recycling',
      'Cook dinner',
      'Dinner with Alex and Priya',
      'Brush teeth',
      'Water the plants',
    ]);
  });

  it('keeps items that are happening now ahead of later ones', () => {
    const day = dayOf({ current: [LENS_VIEW, MEETING_VIEW], upcoming: [BRUSH_VIEW, COOK_VIEW] });
    expect(titles(riverOccurrencesOf(day))).toEqual(['Stand-up', 'Cook dinner', 'Brush teeth']);
  });

  it('is empty when the lens holds the only item', () => {
    expect(riverOccurrencesOf(dayOf({ upcoming: [LENS_VIEW] }))).toEqual([]);
  });
});

describe('riverRowsOf', () => {
  it('names the calendar, its colour and the Google state of each row', () => {
    const rows = riverRowsOf(input(dayOf()));
    const dentist = rows.find((row) => row.title === 'Dentist');
    const recycling = rows.find((row) => row.title === 'Take out the recycling');
    const dinner = rows.find((row) => row.title === 'Dinner with Alex and Priya');
    expect(dentist).toMatchObject({ calendar: 'Home', colour: 'home', google: true, now: false });
    expect(dentist?.sending).toBe(false);
    expect(recycling).toMatchObject({ google: true, sending: true });
    expect(dinner).toMatchObject({ calendar: 'Family', colour: 'family', google: false });
  });

  it('reads the row in one spoken line', () => {
    const rows = riverRowsOf(input(dayOf()));
    const recycling = rows.find((row) => row.title === 'Take out the recycling');
    expect(recycling?.spoken).toBe(
      `${clock24('2026-11-07T16:00:00.000Z', ZONE)}, Take out the recycling, Home, from Google, sending to Google`,
    );
  });

  it('drops rows that an action has just hidden', () => {
    const hidden = new Set([riverKeyOf(COOK_VIEW)]);
    expect(titles(riverRowsOf(input(dayOf(), hidden)))).not.toContain('Cook dinner');
  });

  it('marks the rows that are happening now', () => {
    const day = dayOf({ current: [LENS_VIEW, MEETING_VIEW], upcoming: [BRUSH_VIEW] });
    expect(riverRowsOf(input(day)).map((row) => row.now)).toEqual([true, false]);
  });
});

describe('riverTimeOf and riverSubtitleOf', () => {
  it('shows the start, all day or any time in the time column', () => {
    expect(riverTimeOf(DENTIST_VIEW, ZONE)).toBe('15:30');
    expect(
      riverTimeOf(view(COOK, 'Cook', null, { due_at: '2026-11-07T07:05:00.000Z' }), ZONE),
    ).toBe('08:05');
    expect(riverTimeOf(BIRTHDAY_VIEW, ZONE)).toBe('All day');
    expect(riverTimeOf(ANYTIME_VIEW, ZONE)).toBe('Any time');
    expect(
      riverTimeOf(view(COOK, 'Cook', null, { due_at: '2026-11-07T17:00:00.000Z' }), ZONE),
    ).toBe(clock24('2026-11-07T17:00:00.000Z', ZONE));
  });

  it('says until when, the estimate and the place', () => {
    expect(riverSubtitleOf(DENTIST_VIEW, undefined, ZONE)).toBe(
      `Until ${clock24('2026-11-07T15:15:00.000Z', ZONE)} · Smile Dental`,
    );
    expect(riverSubtitleOf(COOK_VIEW, item(COOK, 45), ZONE)).toBe('45 min');
    expect(riverSubtitleOf(COOK_VIEW, item(COOK, 90), ZONE)).toBe('1h 30m');
    expect(riverSubtitleOf(BRUSH_VIEW, undefined, ZONE)).toBeNull();
    expect(riverSubtitleOf(BIRTHDAY_VIEW, undefined, ZONE)).toBeNull();
  });
});

describe('fadeStepsOf', () => {
  const rows = riverRowsOf(input(dayOf()));

  it('steps the soft fade down with the distance from now and never brightens further down', () => {
    expect(fadeStepsOf(rows, NOW, 'soft')).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });

  it('fades sooner when the fade is strong', () => {
    expect(fadeStepsOf(rows, NOW, 'strong')).toEqual([0, 1, 3, 4, 4, 4, 4]);
  });

  it('keeps every row at full strength when the fade is off', () => {
    expect(fadeStepsOf(rows, NOW, 'off')).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(FADE_FROM_MINUTES.off).toEqual([]);
  });

  it('brightens rows as the day moves towards them, minute by minute', () => {
    const later = NOW + 3 * 60 * MINUTE;
    expect(fadeStepsOf(rows, later, 'soft')).toEqual([0, 0, 0, 0, 0, 3, 3]);
  });

  it('keeps rows that are happening now at full strength', () => {
    const day = dayOf({ current: [LENS_VIEW, MEETING_VIEW], upcoming: [BRUSH_VIEW] });
    expect(fadeStepsOf(riverRowsOf(input(day)), NOW, 'strong')).toEqual([0, 4]);
  });
});

describe('sameSteps', () => {
  it('compares steps by value', () => {
    expect(sameSteps([0, 1], [0, 1])).toBe(true);
    expect(sameSteps([0, 1], [0, 2])).toBe(false);
    expect(sameSteps([0], [0, 0])).toBe(false);
  });
});

describe('riverCaptionOf', () => {
  it('counts what is left and the booked time', () => {
    expect(riverCaptionOf({ left: 5, bookedMinutes: 165, savedAt: null, timeZone: ZONE })).toBe(
      '5 left · 2h 45m booked',
    );
    expect(riverCaptionOf({ left: 1, bookedMinutes: 0, savedAt: null, timeZone: ZONE })).toBe(
      '1 left',
    );
  });

  it('says when the day was saved while the hub is offline', () => {
    expect(riverCaptionOf({ left: 3, bookedMinutes: 90, savedAt: NOW, timeZone: ZONE })).toBe(
      `as saved ${clock24(NOW, ZONE)}`,
    );
  });
});
