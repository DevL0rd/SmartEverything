import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_PATCH,
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_ROW,
  type GoogleChoice,
  type GoogleSyncLogEntry,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_REMINDER_OVERRIDES,
  pendingChoiceOf,
  reminderCaptionOf,
  titleCaptionOf,
  whenCaptionOf,
} from './google-captions';
import { reminderSummaryOf, toggledReminders } from './item-fields';
import { itemHistoryOf, whenTextOf, withEndTime, withStartTime } from './item-history';
import { stepCreateOf, stepsOf } from './item-steps';
import {
  patchOf,
  repeatChangeOf,
  repeatOptionsOf,
  repeatTextOf,
  scopeBarShown,
  scopeChoicesOf,
  scopeIn,
} from './repeat-scope-bar';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const LIST = '00000000-0000-4000-8000-000000000002';
const CALENDAR = '00000000-0000-4000-8000-000000000003';
const ITEM = '00000000-0000-4000-8000-000000000010';
const STAMP = '2026-11-07T08:00:00.000Z';
const KEY = '2026-11-10T13:30:00.000Z';
const TODAY = { now: Date.parse('2026-11-07T10:00:00Z'), timeZone: 'UTC' };

let counter = 100;

function id(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function item(extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: ITEM,
    profile_id: PROFILE,
    collection_id: LIST,
    kind: 'task',
    parent_id: null,
    title: 'Walk on the treadmill',
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
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

const TIMED = {
  start_local: '2026-11-07T14:30:00',
  end_local: '2026-11-07T15:00:00',
  time_zone: 'Europe/Berlin',
} as const;

function walk(extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return item({ ...TIMED, rrule: 'FREQ=WEEKLY;BYDAY=TU,TH,SA', ...extra });
}

function collection(kind: 'list' | 'calendar', google: boolean): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: kind === 'list' ? LIST : CALENDAR,
    profile_id: PROFILE,
    kind,
    name: 'Health',
    colour: 'health',
    icon: 'heart',
    position: 0,
    visible: true,
    default_reminders: [],
    source: google ? 'google' : 'local',
    google: google ? { id: 'g-list', etag: null, syncToken: null } : null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function googled(state: 'synced' | 'sending' | 'conflict'): NonNullable<PlannerItemRow['google']> {
  return {
    id: state === 'sending' ? null : 'g-1',
    calendarOrListId: 'g-list',
    etag: null,
    base: {},
    state,
  };
}

function occurrence(
  key: string,
  status: PlannerOccurrenceRow['status'],
  itemId = ITEM,
  summary: string | null = null,
): PlannerOccurrenceRow {
  const done = status === 'done';
  return PLANNER_OCCURRENCE_ROW.parse({
    item_id: itemId,
    occurrence_key: key,
    status,
    completed_at: done ? STAMP : null,
    completed_by: done ? 'signal' : null,
    evidence:
      done && summary !== null
        ? { source: 'treadmill', deviceId: null, summary, sessionId: null }
        : null,
    moved_start: null,
    moved_end: null,
  });
}

function choice(resolved: boolean): GoogleChoice {
  return {
    item_id: ITEM,
    list_id: 'g-list',
    candidates: [
      { google_id: 'a', title: 'Walk', created_at: STAMP },
      { google_id: 'b', title: 'Walk', created_at: STAMP },
    ],
    resolved_google_id: resolved ? 'a' : null,
    resolved_at: resolved ? STAMP : null,
  };
}

function logEntry(entryChoice: GoogleChoice | null): GoogleSyncLogEntry {
  return {
    id: id(),
    profile_id: PROFILE,
    at: STAMP,
    trigger: 'visible',
    product: 'tasks',
    counts: { pulled: 0, created: 0, updated: 0, deleted: 0, pushed: 0, conflicts: 0 },
    conflicts: [],
    error: null,
    choice: entryChoice,
  };
}

describe('repeat scope save bar', () => {
  it('offers this one, this and later and all for an occurrence of a series', () => {
    expect(scopeChoicesOf({ occurrenceKey: KEY, changes: { priority: 2 } })).toEqual([
      'this',
      'following',
      'all',
    ]);
  });

  it('offers only all when no occurrence is named', () => {
    expect(scopeChoicesOf({ occurrenceKey: null, changes: { priority: 2 } })).toEqual(['all']);
  });

  it('drops this one when the repeat rule itself changes', () => {
    const choices = scopeChoicesOf({ occurrenceKey: KEY, changes: { rrule: 'FREQ=DAILY' } });
    expect(choices).toEqual(['following', 'all']);
    expect(scopeIn('this', choices)).toBe('following');
    expect(scopeIn('all', choices)).toBe('all');
  });

  it('maps each scope to a PATCH body the endpoint accepts', () => {
    const changes = { priority: 2 };
    for (const scope of ['this', 'following', 'all'] as const) {
      const body = patchOf(scope, KEY, changes);
      const parsed = PLANNER_ITEM_PATCH.parse(body);
      expect(parsed.scope).toBe(scope);
      expect(parsed.occurrence_key).toBe(scope === 'all' ? undefined : KEY);
      expect(parsed.changes).toEqual(changes);
    }
  });

  it('never names this or following without an occurrence', () => {
    expect(patchOf('this', null, { notes: 'x' })).toEqual({
      scope: 'all',
      changes: { notes: 'x' },
    });
  });

  it('shows the bar only for a repeating item with a pending change', () => {
    expect(scopeBarShown(walk(), { priority: 1 })).toBe(true);
    expect(scopeBarShown(walk(), {})).toBe(false);
    expect(scopeBarShown(item(), { priority: 1 })).toBe(false);
  });
});

describe('repeat rule wording and choices', () => {
  it('reads common rules in plain words', () => {
    expect(repeatTextOf(null)).toBe('Doesn’t repeat');
    expect(repeatTextOf('FREQ=DAILY')).toBe('Every day');
    expect(repeatTextOf('FREQ=WEEKLY;BYDAY=TU,TH,SA')).toBe('Tue, Thu, Sat');
    expect(repeatTextOf('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Weekdays');
    expect(repeatTextOf('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Every 2 weeks · Mon');
    expect(repeatTextOf('FREQ=MONTHLY;COUNT=5')).toBe('Every month · 5 times');
  });

  it('keeps a custom rule as a choice and offers the weekday of the start', () => {
    const values = repeatOptionsOf(walk()).map((option) => option.value);
    expect(values[0]).toBe('none');
    expect(values).toContain('FREQ=WEEKLY;BYDAY=TU,TH,SA');
    expect(values).toContain('FREQ=WEEKLY;BYDAY=SA');
  });

  it('offers no repeat choices for an item without a start', () => {
    expect(repeatOptionsOf(item({ due_date: '2026-11-08' }))).toEqual([]);
  });

  it('clears excluded dates with the rule', () => {
    expect(repeatChangeOf('none')).toEqual({ rrule: null, exdates: [] });
    expect(repeatChangeOf('FREQ=DAILY')).toEqual({ rrule: 'FREQ=DAILY' });
  });
});

describe('Google captions', () => {
  it('says time kept here under When for a timed Google task', () => {
    const list = collection('list', true);
    expect(whenCaptionOf(item({ ...TIMED, google: googled('synced') }), list)).toBe(
      'time kept here',
    );
    expect(whenCaptionOf(item({ due_date: '2026-11-08', google: googled('synced') }), list)).toBe(
      null,
    );
    expect(whenCaptionOf(item({ ...TIMED }), collection('list', false))).toBe(null);
  });

  it('counts the reminders past the Google limit of five on an event', () => {
    const reminders = [0, 5, 10, 15, 30, 60, 120].map((minutes) => ({ minutes_before: minutes }));
    const event = item({ ...TIMED, kind: 'event', collection_id: CALENDAR, reminders });
    expect(GOOGLE_REMINDER_OVERRIDES).toBe(5);
    expect(reminderCaptionOf({ ...event, google: googled('synced') })).toBe(
      '2 reminders kept here',
    );
    expect(reminderCaptionOf(event)).toBe(null);
    expect(
      reminderCaptionOf({ ...event, reminders: reminders.slice(0, 5), google: googled('synced') }),
    ).toBe(null);
  });

  it('shows Sending to Google, then the choice, then the conflict link', () => {
    const sending = item({ google: googled('sending') });
    expect(titleCaptionOf(sending, null)).toEqual({
      kind: 'sending',
      text: 'Sending to Google',
      action: null,
    });
    expect(titleCaptionOf(sending, choice(false))).toEqual({
      kind: 'choose',
      text: 'Google has 2 tasks like this',
      action: 'Choose',
    });
    expect(titleCaptionOf(item({ google: googled('conflict') }), null)?.action).toBe(
      'See the sync log',
    );
    expect(titleCaptionOf(item({ google: googled('synced') }), null)).toBe(null);
  });

  it('finds only an open choice for this item in the sync log', () => {
    expect(pendingChoiceOf([logEntry(null), logEntry(choice(true))], ITEM)).toBe(null);
    expect(pendingChoiceOf([logEntry(choice(false))], ITEM)?.candidates).toHaveLength(2);
    expect(pendingChoiceOf([logEntry(choice(false))], LIST)).toBe(null);
  });
});

describe('item fields', () => {
  it('moves the end with the start and keeps the length', () => {
    expect(withStartTime(walk(), { hour: 23, minute: 45 })).toEqual({
      start_local: '2026-11-07T23:45:00',
      end_local: '2026-11-08T00:15:00',
    });
  });

  it('puts an end before the start on the next day', () => {
    expect(withEndTime(walk(), { hour: 9, minute: 0 })).toEqual({
      end_local: '2026-11-08T09:00:00',
    });
  });

  it('toggles one reminder and clears all with none', () => {
    const reminders = [{ minutes_before: 10 }];
    expect(toggledReminders(reminders, '10')).toEqual([]);
    expect(toggledReminders(reminders, '60')).toEqual([
      { minutes_before: 10 },
      { minutes_before: 60 },
    ]);
    expect(toggledReminders(reminders, 'none')).toEqual([]);
  });

  it('lists many reminders in full under the row instead of cutting them', () => {
    const reminders = [0, 10, 60].map((minutes) => ({ minutes_before: minutes }));
    expect(reminderSummaryOf(reminders)).toEqual({
      value: '3 reminders',
      list: 'At the time, 10 min before, 1 h before',
    });
    expect(reminderSummaryOf(reminders.slice(1, 2))).toEqual({
      value: '10 min before',
      list: null,
    });
  });

  it('words the when row', () => {
    expect(whenTextOf(walk(), TODAY)).toBe('Today 14:30 to 15:00');
    expect(whenTextOf(item(), TODAY)).toBe('No date');
    expect(whenTextOf(item({ due_date: '2026-11-08' }), TODAY)).toBe('Tomorrow');
  });
});

describe('steps and history', () => {
  it('lists child tasks in order and marks the done ones', () => {
    const first = item({ id: id(), parent_id: ITEM, title: 'Fill the bottle', position: 1 });
    const second = item({ id: id(), parent_id: ITEM, title: 'Shoes by the door', position: 2 });
    const gone = item({ id: id(), parent_id: ITEM, title: 'Gone', deleted_at: STAMP });
    const steps = stepsOf(
      [second, gone, first, item()],
      [occurrence('single', 'done', first.id)],
      ITEM,
    );
    expect(steps.map((step) => [step.item.title, step.done])).toEqual([
      ['Fill the bottle', true],
      ['Shoes by the door', false],
    ]);
    expect(stepCreateOf(item(), steps, '  Stretch ')).toEqual({
      collection_id: LIST,
      kind: 'task',
      title: 'Stretch',
      parent_id: ITEM,
      position: 3,
    });
    expect(stepCreateOf(item(), steps, '   ')).toBe(null);
  });

  it('keeps every past occurrence in time order with the latest evidence', () => {
    const model = itemHistoryOf(
      [
        occurrence('2026-11-05T13:30:00.000Z', 'done', ITEM, '32 min · 2.4 km'),
        occurrence('2026-11-03T13:30:00.000Z', 'missed'),
        occurrence('2026-11-07T13:30:00.000Z', 'skipped'),
        occurrence('single', 'done', LIST),
      ],
      ITEM,
      TODAY,
    );
    expect(model.entries.map((entry) => entry.status)).toEqual(['missed', 'done', 'skipped']);
    expect(model.done).toBe(1);
    expect(model.latest?.summary).toBe('32 min · 2.4 km');
  });
});
