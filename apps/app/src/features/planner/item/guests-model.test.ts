import {
  PLANNER_GUEST_ROW,
  PLANNER_ITEM_ROW,
  PROFILE_ROW,
  type PlannerGuestRow,
  type PlannerItemRow,
  type ProfileRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { answeredGuest } from '../data/guests';
import { lockOf } from './item-body';
import {
  canResend,
  countsTextOf,
  deliveryOf,
  emailEntryOf,
  entriesOf,
  guestViewsOf,
  inviteeChoicesOf,
  openInvitationsOf,
  responseCountsOf,
  shownSuggestionsOf,
  toggledPerson,
  withGuest,
  withoutGuest,
} from './guests-model';

const STAMP = '2026-11-01T08:00:00.000Z';
const ALEX = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SAM = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const ITEM = 'a1b2c3d4-0000-4000-8000-0000000000e1';

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function emailGuest(extra: Partial<PlannerGuestRow> = {}): PlannerGuestRow {
  return PLANNER_GUEST_ROW.parse({
    id: id(),
    item_id: ITEM,
    kind: 'email',
    profile_id: null,
    email: 'anna@example.com',
    name: 'Anna Keller',
    response: 'needs_action',
    note: null,
    delivery: 'sent',
    delivery_detail: null,
    invited_at: STAMP,
    responded_at: null,
    ...extra,
  });
}

function personGuest(profileId: string, extra: Partial<PlannerGuestRow> = {}): PlannerGuestRow {
  return PLANNER_GUEST_ROW.parse({
    ...emailGuest(),
    kind: 'person',
    profile_id: profileId,
    email: null,
    name: null,
    delivery: 'not_sent',
    ...extra,
  });
}

function profile(profileId: string, name: string, position: number): ProfileRow {
  return PROFILE_ROW.parse({
    id: profileId,
    name,
    colour: 'aqua',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: null,
    fitness_goals: {
      steps: null,
      move_kcal: null,
      active_minutes: null,
      sleep_minutes: null,
      hydration_ml: null,
    },
    max_heart_rate: null,
    position,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function event(extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: ITEM,
    profile_id: ALEX,
    collection_id: id(),
    kind: 'event',
    parent_id: null,
    title: 'Dinner',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-14T19:00:00',
    end_local: '2026-11-14T21:00:00',
    time_zone: 'Europe/Berlin',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: '2026-11-14T18:00:00.000Z',
    end: '2026-11-14T20:00:00.000Z',
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
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

describe('guest list edits', () => {
  const rows = [personGuest(SAM), emailGuest()];

  it('turns the stored guests into the list the hub takes back', () => {
    expect(entriesOf(rows)).toEqual([
      { kind: 'person', profile_id: SAM },
      { kind: 'email', email: 'anna@example.com', name: 'Anna Keller' },
    ]);
  });

  it('toggles a household member in and out', () => {
    const entries = entriesOf(rows);
    expect(toggledPerson(entries, SAM)).toEqual([entries[1]]);
    expect(toggledPerson([], SAM)).toEqual([{ kind: 'person', profile_id: SAM }]);
  });

  it('adds an email once whatever its case and removes it by key', () => {
    const entries = entriesOf(rows);
    const again = withGuest(entries, { kind: 'email', email: 'ANNA@example.com', name: null });
    expect(again).toBe(entries);
    expect(withoutGuest(entries, 'email:anna@example.com')).toEqual([entries[0]]);
  });

  it('reads a plain address and a named one, and refuses anything else', () => {
    expect(emailEntryOf(' lena@example.net ')).toEqual({
      kind: 'email',
      email: 'lena@example.net',
      name: null,
    });
    expect(emailEntryOf('Lena Fischer <lena@example.net>')).toEqual({
      kind: 'email',
      email: 'lena@example.net',
      name: 'Lena Fischer',
    });
    expect(emailEntryOf('lena at example')).toBeNull();
  });

  it('hides suggestions that are already guests', () => {
    const shown = shownSuggestionsOf(
      [
        { email: 'Anna@example.com', name: 'Anna' },
        { email: 'tomas@example.com', name: null },
      ],
      entriesOf(rows),
    );
    expect(shown.map((one) => one.email)).toEqual(['tomas@example.com']);
  });

  it('offers everyone in the home but the organiser, in household order', () => {
    const people = [profile(SAM, 'Sam', 2), profile(ALEX, 'Alex', 0), profile(id(), 'Robin', 1)];
    expect(inviteeChoicesOf(people, ALEX).map((one) => one.name)).toEqual(['Robin', 'Sam']);
  });
});

describe('responses and delivery', () => {
  it('counts every response and words only the ones present', () => {
    const counts = responseCountsOf([
      emailGuest({ response: 'yes', responded_at: STAMP }),
      emailGuest({ response: 'yes', responded_at: STAMP }),
      emailGuest({ response: 'maybe', responded_at: STAMP }),
      emailGuest(),
    ]);
    expect(counts).toEqual({ yes: 2, maybe: 1, no: 0, waiting: 1 });
    expect(countsTextOf(counts)).toBe('2 yes · 1 maybe · 1 waiting');
    expect(countsTextOf({ yes: 0, maybe: 0, no: 0, waiting: 0 })).toBeNull();
  });

  it('says how each email invitation went and when it can be sent again', () => {
    const failed = emailGuest({ delivery: 'failed', delivery_detail: '550 mailbox unavailable' });
    expect(deliveryOf(failed)).toEqual({
      text: 'Not delivered: 550 mailbox unavailable',
      tone: 'critical',
    });
    expect(deliveryOf(emailGuest({ delivery: 'link_only' }))?.text).toBe(
      'Not emailed · invite by link',
    );
    expect(deliveryOf(emailGuest({ delivery: 'google' }))?.text).toBe('Invited by Google');
    expect(deliveryOf(personGuest(SAM))).toBeNull();
    expect(canResend(failed)).toBe(true);
    expect(canResend(emailGuest({ delivery: 'link_only' }))).toBe(false);
    expect(canResend(personGuest(SAM))).toBe(false);
  });

  it('names members from their profile and lists answers before the waiting ones', () => {
    const views = guestViewsOf(
      [
        emailGuest({ email: 'x@example.com', name: null }),
        personGuest(SAM, { response: 'yes', responded_at: STAMP }),
      ],
      [profile(SAM, 'Sam', 1)],
    );
    expect(views.map((view) => [view.name, view.detail])).toEqual([
      ['Sam', null],
      ['x@example.com', null],
    ]);
  });

  it('records an answer with its note and time', () => {
    const now = new Date('2026-11-02T10:00:00.000Z');
    expect(answeredGuest(personGuest(SAM), { response: 'no', note: 'Away' }, now)).toMatchObject({
      response: 'no',
      note: 'Away',
      responded_at: '2026-11-02T10:00:00.000Z',
    });
  });
});

describe('openInvitationsOf', () => {
  const now = Date.parse('2026-11-14T10:00:00.000Z');

  it('keeps unanswered invitations still ahead, soonest first', () => {
    const later = { item: event({ id: id(), title: 'Later' }), guest: personGuest(SAM) };
    const sooner = {
      item: event({
        id: id(),
        title: 'Sooner',
        start: '2026-11-14T12:00:00.000Z',
        end: '2026-11-14T13:00:00.000Z',
      }),
      guest: personGuest(SAM),
    };
    const over = {
      item: event({
        id: id(),
        title: 'Over',
        start: '2026-11-13T12:00:00.000Z',
        end: '2026-11-13T13:00:00.000Z',
      }),
      guest: personGuest(SAM),
    };
    const answered = {
      item: event({ id: id(), title: 'Answered' }),
      guest: personGuest(SAM, { response: 'yes', responded_at: STAMP }),
    };
    expect(
      openInvitationsOf([later, over, answered, sooner], now).map((one) => one.item.title),
    ).toEqual(['Sooner', 'Later']);
  });
});

describe('lockOf', () => {
  it('lets a guest only answer and an assignee only write notes on the task itself', () => {
    const dinner = event();
    expect(lockOf('guest', dinner, false)).toEqual({ fields: true, notes: true, actions: true });
    expect(lockOf('owner', dinner, false)).toEqual({ fields: false, notes: false, actions: false });
    expect(lockOf('assignee', { ...dinner, kind: 'task' }, false)).toEqual({
      fields: true,
      notes: false,
      actions: false,
    });
    expect(lockOf('assignee', { ...dinner, kind: 'task', parent_id: id() }, false).fields).toBe(
      false,
    );
    expect(lockOf('owner', dinner, true).fields).toBe(true);
  });

  it('locks a view share and leaves an edit share open', () => {
    const dinner = event();
    expect(lockOf('view', dinner, false)).toEqual({ fields: true, notes: true, actions: true });
    expect(lockOf('edit', dinner, false)).toEqual({ fields: false, notes: false, actions: false });
    expect(lockOf(null, dinner, false)).toEqual({ fields: true, notes: true, actions: true });
  });
});
