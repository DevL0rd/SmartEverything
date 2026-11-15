import {
  PLANNER_COLLECTION_ROW,
  PLANNER_COLLECTION_SHARE_ROW,
  type PlannerCollectionRow,
  type PlannerCollectionShareRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  canEditItems,
  canImport,
  canShare,
  eventLookOf,
  sectionsOf,
  shareCandidatesOf,
  shownCalendarsOf,
  sourceText,
  viewerCalendarsOf,
  type ViewerCalendar,
} from './calendars-model';

const ALEX = 'a1b2c3d4-0000-4000-8000-000000000001';
const SAM = 'a1b2c3d4-0000-4000-8000-000000000002';
const ROBIN = 'a1b2c3d4-0000-4000-8000-000000000003';
const STAMP = '2026-11-01T08:00:00.000Z';
const PEOPLE = [
  { id: ALEX, name: 'Alex' },
  { id: SAM, name: 'Sam' },
  { id: ROBIN, name: 'Robin' },
];

let next = 0;

function calendar(
  owner: string,
  name: string,
  extra: Partial<PlannerCollectionRow> = {},
): PlannerCollectionRow {
  next += 1;
  return PLANNER_COLLECTION_ROW.parse({
    id: `c0000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    profile_id: owner,
    kind: 'calendar',
    name,
    colour: 'personal',
    icon: 'calendar',
    position: next,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  });
}

function share(
  row: PlannerCollectionRow,
  profile: string,
  extra: Partial<PlannerCollectionShareRow> = {},
): PlannerCollectionShareRow {
  return PLANNER_COLLECTION_SHARE_ROW.parse({
    collection_id: row.id,
    profile_id: profile,
    role: 'view',
    colour: null,
    visible: true,
    created_at: STAMP,
    ...extra,
  });
}

const personal = calendar(ALEX, 'Personal');
const family = calendar(ALEX, 'Family', { audience: 'household', colour: 'family' });
const samsWork = calendar(SAM, 'Sam work', { colour: 'work' });
const samsPrivate = calendar(SAM, 'Sam private');
const football = calendar(ALEX, 'Football', {
  source: 'feed',
  feed: {
    kind: 'ics',
    url: 'https://example.com/football.ics',
    refresh_minutes: 360,
    etag: null,
    last_modified: null,
    fetched_at: null,
    failure: null,
  },
});
const holidays = calendar(ALEX, 'Holidays', {
  source: 'feed',
  feed: { kind: 'holidays', country: 'DE', state: 'BE' },
});
const birthdays = calendar(ALEX, 'Birthdays', { source: 'feed', feed: { kind: 'birthdays' } });
const groceries = calendar(ALEX, 'Groceries', { kind: 'list' });
const COLLECTIONS = [
  personal,
  family,
  samsWork,
  samsPrivate,
  football,
  holidays,
  birthdays,
  groceries,
];
const SHARES = [
  share(samsWork, ALEX, { colour: 'health', visible: false }),
  share(personal, SAM, { role: 'edit' }),
  share(personal, ROBIN),
];

function asAlex(): readonly ViewerCalendar[] {
  return viewerCalendarsOf({
    collections: COLLECTIONS,
    shares: SHARES,
    profiles: PEOPLE,
    me: ALEX,
  });
}

function named(calendars: readonly ViewerCalendar[], name: string): ViewerCalendar {
  const found = calendars.find((entry) => entry.row.name === name);
  if (found === undefined) throw new Error(`${name} is not visible`);
  return found;
}

describe('the calendars a person sees', () => {
  it('sorts every visible calendar into its section and hides the rest', () => {
    const sections = sectionsOf(asAlex()).map((section) => [
      section.key,
      section.calendars.map((entry) => entry.row.name),
    ]);
    expect(sections).toEqual([
      ['mine', ['Personal']],
      ['family', ['Family']],
      ['shared', ['Sam work']],
      ['subscriptions', ['Football']],
      ['holidays', ['Holidays']],
      ['birthdays', ['Birthdays']],
    ]);
  });

  it('gives a shared calendar the colour and visibility the viewer chose', () => {
    const shared = named(asAlex(), 'Sam work');
    expect(shared).toMatchObject({ role: 'view', ownerName: 'Sam' });
    expect(shared.row).toMatchObject({ colour: 'health', visible: false });
    expect(sourceText(shared)).toBe('Shared by Sam · view only');
  });

  it('lets every member edit the Family calendar and lists what the owner shared', () => {
    const asSam = viewerCalendarsOf({
      collections: COLLECTIONS,
      shares: SHARES,
      profiles: PEOPLE,
      me: SAM,
    });
    expect(named(asSam, 'Family')).toMatchObject({ role: 'edit', section: 'family' });
    expect(named(asSam, 'Personal')).toMatchObject({ role: 'edit', section: 'shared' });
    expect(sourceText(named(asAlex(), 'Personal'))).toBe('Shared with 2 people');
    expect(sourceText(named(asSam, 'Family'))).toBe('Everyone at home · made by Alex');
    expect(sourceText(named(asSam, 'Personal'))).toBe('Shared by Alex · can edit');
    expect(
      viewerCalendarsOf({ collections: COLLECTIONS, shares: [], profiles: [], me: null }),
    ).toEqual([]);
  });

  it('decides what each calendar allows', () => {
    const calendars = asAlex();
    expect(canShare(named(calendars, 'Personal'))).toBe(true);
    expect(canShare(named(calendars, 'Family'))).toBe(false);
    expect(canShare(named(calendars, 'Sam work'))).toBe(false);
    expect(canEditItems(named(calendars, 'Sam work'))).toBe(false);
    expect(canEditItems(named(calendars, 'Football'))).toBe(false);
    expect(canEditItems(named(calendars, 'Birthdays'))).toBe(true);
    expect(canImport(named(calendars, 'Holidays'))).toBe(false);
    expect(canImport(named(calendars, 'Family'))).toBe(true);
  });

  it('sends every calendar when all are shown and only the shown ones otherwise', () => {
    const calendars = asAlex().map((entry) => entry.row);
    expect(shownCalendarsOf(calendars.filter((row) => row.visible))).toBeNull();
    expect(shownCalendarsOf(calendars)).toEqual(
      calendars.filter((row) => row.name !== 'Sam work').map((row) => row.id),
    );
  });

  it('offers everyone but the owner for sharing, with their current role', () => {
    const candidates = shareCandidatesOf(named(asAlex(), 'Personal'), PEOPLE).map((entry) => [
      entry.person.name,
      entry.share?.role ?? null,
    ]);
    expect(candidates).toEqual([
      ['Sam', 'edit'],
      ['Robin', 'view'],
    ]);
  });
});

describe('event looks', () => {
  it('shows the answer to an invitation before the look of the calendar', () => {
    expect(eventLookOf(personal, 'needs_action')).toBe('invited');
    expect(eventLookOf(holidays, 'maybe')).toBe('maybe');
    expect(eventLookOf(personal, 'no')).toBe('declined');
    expect(eventLookOf(personal, 'yes')).toBe('plain');
    expect(eventLookOf(football, null)).toBe('feed');
    expect(eventLookOf(holidays, null)).toBe('holiday');
    expect(eventLookOf(birthdays, null)).toBe('birthday');
    expect(eventLookOf(undefined, null)).toBe('plain');
  });
});
