import { PLANNER_ITEM_ROW, type PlannerItemRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { longDate } from '../../../format/time';
import { deleteChoicesOf } from './item-delete';

const STAMP = '2026-11-07T08:00:00.000Z';
const KEY = '2026-11-10T13:30:00.000Z';
const ZONE = 'Europe/Berlin';

function item(extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: '00000000-0000-4000-8000-000000000010',
    profile_id: '00000000-0000-4000-8000-000000000001',
    collection_id: '00000000-0000-4000-8000-000000000002',
    kind: 'task',
    parent_id: null,
    title: 'Walk on the treadmill',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-07T14:30:00',
    end_local: '2026-11-07T15:00:00',
    time_zone: 'Europe/Berlin',
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
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

const WEEKLY = 'FREQ=WEEKLY;BYDAY=TU,TH,SA';

describe('deleteChoicesOf', () => {
  it('offers one plain delete of the whole item when it does not repeat', () => {
    const choices = deleteChoicesOf(item(), KEY, ZONE);
    expect(choices.map((choice) => [choice.label, choice.scope])).toEqual([
      ['Delete', { scope: 'all' }],
    ]);
    expect(choices[0]?.question).toBe('The task and its history go.');
  });

  it('names an event as an event in the question', () => {
    expect(deleteChoicesOf(item({ kind: 'event' }), null, ZONE)[0]?.question).toBe(
      'The event and its history go.',
    );
  });

  it('offers only the whole series when no repeat was opened', () => {
    expect(
      deleteChoicesOf(item({ rrule: WEEKLY }), null, ZONE).map((choice) => choice.scope),
    ).toEqual([{ scope: 'all' }]);
  });

  it('offers this one, this and later and every repeat for an opened repeat', () => {
    const choices = deleteChoicesOf(item({ rrule: WEEKLY }), KEY, ZONE);
    expect(choices.map((choice) => choice.label)).toEqual([
      'Delete this one',
      'Delete this and later',
      'Delete every repeat',
    ]);
    expect(choices.map((choice) => choice.scope)).toEqual([
      { scope: 'this', occurrenceKey: KEY },
      { scope: 'following', occurrenceKey: KEY },
      { scope: 'all' },
    ]);
  });

  it('names the opened day in the question of a repeat', () => {
    const [one, later] = deleteChoicesOf(item({ rrule: WEEKLY }), KEY, ZONE);
    const day = longDate(KEY, ZONE);
    expect(one?.question).toBe(`Only the task on ${day} goes. The other repeats stay.`);
    expect(later?.question).toBe(
      `The task on ${day} and every later repeat go. Earlier ones stay.`,
    );
    expect(deleteChoicesOf(item({ rrule: WEEKLY }), '2026-11-12', ZONE)[0]?.question).toContain(
      longDate('2026-11-12T12:00:00Z', 'UTC'),
    );
  });

  it('gives every choice its own id', () => {
    const ids = deleteChoicesOf(item({ rrule: WEEKLY }), KEY, ZONE).map((choice) => choice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
