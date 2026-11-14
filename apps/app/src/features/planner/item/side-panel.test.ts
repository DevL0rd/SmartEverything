import {
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_VIEW,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAssistantWith } from '../../assistant';
import { askAboutItem, askPromptOf } from './item-ask';
import { titleOf } from './item-title';
import { googleUrlOf, itemMenuOf, itemShortcutOf, shortcutEntryOf } from './item-menu';
import {
  dayBarOf,
  fractionIn,
  lengthMinutesOf,
  movedSpanOf,
  occurrenceIn,
  onWatchCalendar,
  panelDayOf,
  proposalNear,
} from './panel-model';
import {
  clearPlannerSelection,
  isSelected,
  itemHrefOf,
  readPlannerSelection,
  selectPlannerItem,
} from './selection';

vi.mock('../../assistant', () => ({ askAssistantWith: vi.fn() }));

const STAMP = '2026-11-07T08:00:00.000Z';
const ITEM_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_ID = '00000000-0000-4000-8000-000000000011';
const PROPOSAL_ID = '00000000-0000-4000-8000-000000000012';
const KEY = '2026-11-10T13:30:00.000Z';
const ZONE = 'Europe/Berlin';
const HOUR = 3_600_000;
const WEEKLY = 'FREQ=WEEKLY;BYDAY=TU';

function item(extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: ITEM_ID,
    profile_id: '00000000-0000-4000-8000-000000000001',
    collection_id: '00000000-0000-4000-8000-000000000002',
    kind: 'event',
    parent_id: null,
    title: 'Dentist',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-07T15:30:00',
    end_local: '2026-11-07T16:15:00',
    time_zone: ZONE,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: '2026-11-07T14:30:00.000Z',
    end: '2026-11-07T15:15:00.000Z',
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

function view(extra: Partial<PlannerOccurrenceView> = {}): PlannerOccurrenceView {
  return PLANNER_OCCURRENCE_VIEW.parse({
    item_id: ITEM_ID,
    occurrence_key: 'single',
    collection_id: '00000000-0000-4000-8000-000000000002',
    kind: 'event',
    title: 'Dentist',
    location: null,
    priority: null,
    all_day: false,
    start: '2026-11-07T14:30:00.000Z',
    end: '2026-11-07T15:15:00.000Z',
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

const GOOGLE = {
  id: 'abc123',
  calendarOrListId: 'family@group.calendar.google.com',
  etag: null,
  base: {},
  state: 'synced',
} as const;

describe('itemMenuOf', () => {
  it('lists the board actions with their shortcuts and no Google entry for a hub item', () => {
    const model = itemMenuOf({ item: item(), occurrenceKey: null, offline: false });
    expect(model.quick.map((entry) => entry.label)).toEqual(['Done', 'Skip', 'Ask AI']);
    expect(model.items.map((entry) => [entry.label, entry.shortcut ?? null])).toEqual([
      ['Reschedule', 'R'],
      ['Attach a device', 'A'],
      ['Repeat', null],
      ['Delete', 'Del'],
    ]);
  });

  it('adds Open in Google only for an item Google already knows', () => {
    const synced = itemMenuOf({
      item: item({ google: GOOGLE }),
      occurrenceKey: null,
      offline: false,
    });
    expect(synced.items.some((entry) => entry.label === 'Open in Google')).toBe(true);
    const sending = itemMenuOf({
      item: item({ google: { ...GOOGLE, id: null, state: 'sending' } }),
      occurrenceKey: null,
      offline: false,
    });
    expect(sending.items.some((entry) => entry.label === 'Open in Google')).toBe(false);
  });

  it('offers every repeat scope for one occurrence of a series with Del on the first', () => {
    const model = itemMenuOf({ item: item({ rrule: WEEKLY }), occurrenceKey: KEY, offline: false });
    const deletes = model.items.filter((entry) => entry.destructive === true);
    expect(deletes.map((entry) => [entry.label, entry.shortcut ?? null])).toEqual([
      ['Delete this one', 'Del'],
      ['Delete this and later', null],
      ['Delete every repeat', null],
    ]);
  });

  it('blocks Done and Skip on a series opened without an occurrence', () => {
    const model = itemMenuOf({
      item: item({ rrule: WEEKLY }),
      occurrenceKey: null,
      offline: false,
    });
    expect(model.quick.filter((entry) => entry.disabled).map((entry) => entry.id)).toEqual([
      'done',
      'skip',
    ]);
  });

  it('disables every write while offline but keeps Ask AI', () => {
    const model = itemMenuOf({ item: item(), occurrenceKey: null, offline: true });
    const enabled = [...model.quick, ...model.items].filter((entry) => !entry.disabled);
    expect(enabled.map((entry) => entry.id)).toEqual(['ask']);
  });

  it('marks a single item done under the single occurrence key', () => {
    const model = itemMenuOf({ item: item(), occurrenceKey: null, offline: false });
    expect(model.quick[0]?.action).toEqual({ kind: 'done', key: 'single' });
  });
});

describe('googleUrlOf', () => {
  it('opens a calendar event by its event and calendar id', () => {
    const url = googleUrlOf(item({ google: GOOGLE }));
    const eid = btoa('abc123 family@group.calendar.google.com').replace(/=+$/u, '');
    expect(url).toBe(`https://calendar.google.com/calendar/event?eid=${eid}`);
  });

  it('opens a task in Google Tasks', () => {
    expect(googleUrlOf(item({ kind: 'task', google: GOOGLE }))).toBe(
      'https://tasks.google.com/task/abc123',
    );
  });
});

describe('item shortcuts', () => {
  const press = { ctrlKey: false, metaKey: false, altKey: false };

  it('reads R, A and Delete and nothing while typing or with a modifier', () => {
    expect(itemShortcutOf({ ...press, key: 'R' }, false)).toBe('reschedule');
    expect(itemShortcutOf({ ...press, key: 'a' }, false)).toBe('attach');
    expect(itemShortcutOf({ ...press, key: 'Delete' }, false)).toBe('delete');
    expect(itemShortcutOf({ ...press, key: 'r' }, true)).toBeNull();
    expect(itemShortcutOf({ ...press, key: 'r', metaKey: true }, false)).toBeNull();
    expect(itemShortcutOf({ ...press, key: 'x' }, false)).toBeNull();
  });

  it('maps Delete to the first delete choice and refuses a disabled entry', () => {
    const series = itemMenuOf({
      item: item({ rrule: WEEKLY }),
      occurrenceKey: KEY,
      offline: false,
    });
    expect(shortcutEntryOf(series, 'delete')?.id).toBe('delete-this');
    const offline = itemMenuOf({ item: item(), occurrenceKey: null, offline: true });
    expect(shortcutEntryOf(offline, 'reschedule')).toBeNull();
  });
});

describe('panel model', () => {
  it('finds the day of an occurrence key, a timed item and a due date', () => {
    expect(panelDayOf(item(), '2026-11-10', ZONE)).toBe('2026-11-10');
    expect(panelDayOf(item(), '2026-11-10T23:30:00.000Z', ZONE)).toBe('2026-11-11');
    expect(panelDayOf(item(), null, ZONE)).toBe('2026-11-07');
    expect(
      panelDayOf(
        item({
          kind: 'task',
          start: null,
          end: null,
          start_local: null,
          end_local: null,
          due_date: '2026-11-09',
        }),
        null,
        ZONE,
      ),
    ).toBe('2026-11-09');
  });

  it('picks the selected occurrence and falls back to the item’s only one', () => {
    const views = [view({ occurrence_key: KEY }), view({ item_id: OTHER_ID })];
    expect(occurrenceIn(views, ITEM_ID, KEY)?.occurrence_key).toBe(KEY);
    expect(occurrenceIn(views, ITEM_ID, null)?.occurrence_key).toBe(KEY);
    expect(occurrenceIn(views, PROPOSAL_ID, null)).toBeNull();
  });

  it('draws two hours either side with the free stretch before the item', () => {
    const focus = view();
    const lunch = view({
      item_id: OTHER_ID,
      start: '2026-11-07T13:00:00.000Z',
      end: '2026-11-07T14:00:00.000Z',
    });
    const now = Date.parse('2026-11-07T13:30:00.000Z');
    const bar = dayBarOf([lunch, focus], focus, now);
    expect(bar?.from).toBe(Date.parse(focus.start ?? '') - 2 * HOUR);
    expect(bar?.to).toBe(Date.parse(focus.end ?? '') + 2 * HOUR);
    expect(bar?.blocks.map((block) => block.kind)).toEqual(['busy', 'focus']);
    expect(bar?.free).toEqual({
      from: Date.parse('2026-11-07T14:00:00.000Z'),
      to: Date.parse('2026-11-07T14:30:00.000Z'),
    });
    expect(bar?.now).toBe(now);
    expect(bar === null ? 0 : fractionIn(bar, bar.to)).toBe(1);
  });

  it('draws no bar for an all-day item and leaves out the now line outside the window', () => {
    expect(dayBarOf([], view({ all_day: true }), 0)).toBeNull();
    expect(dayBarOf([view()], view(), 0)?.now).toBeNull();
  });

  it('proposes the first AI proposal after the item that day', () => {
    const before = view({
      item_id: PROPOSAL_ID,
      status: 'proposed',
      title: 'Early',
      start: '2026-11-07T10:00:00.000Z',
      end: '2026-11-07T10:30:00.000Z',
    });
    const after = view({
      item_id: OTHER_ID,
      status: 'proposed',
      title: 'Descale the kettle',
      start: '2026-11-07T15:30:00.000Z',
      end: '2026-11-07T16:00:00.000Z',
    });
    expect(proposalNear([before, view(), after], view())?.title).toBe('Descale the kettle');
    expect(proposalNear([before, view()], view())?.title).toBe('Early');
    expect(proposalNear([view()], view())).toBeNull();
  });

  it('keeps a moved proposal’s length', () => {
    const proposal = view({ start: '2026-11-07T15:30:00.000Z', end: '2026-11-07T16:00:00.000Z' });
    expect(lengthMinutesOf(proposal)).toBe(30);
    expect(movedSpanOf('2026-11-07T17:00:00.000Z', 30)).toEqual({
      start: '2026-11-07T17:00:00.000Z',
      end: '2026-11-07T17:30:00.000Z',
    });
  });

  it('shows the watch line only for an upcoming booked event with a watch and push on', () => {
    const now = Date.parse('2026-11-07T10:00:00.000Z');
    expect(onWatchCalendar({ view: view(), push: true, watch: true, now })).toBe(true);
    expect(onWatchCalendar({ view: view(), push: false, watch: true, now })).toBe(false);
    expect(onWatchCalendar({ view: view(), push: true, watch: false, now })).toBe(false);
    expect(
      onWatchCalendar({ view: view({ status: 'proposed' }), push: true, watch: true, now }),
    ).toBe(false);
    expect(onWatchCalendar({ view: view(), push: true, watch: true, now: now + 24 * HOUR })).toBe(
      false,
    );
  });
});

describe('selection', () => {
  afterEach(() => {
    clearPlannerSelection();
  });

  it('marks every occurrence row of an item picked without a key and only the picked one otherwise', () => {
    expect(isSelected(null, ITEM_ID, KEY)).toBe(false);
    const whole = { itemId: ITEM_ID, occurrenceKey: null, intent: 'view' } as const;
    expect(isSelected(whole, ITEM_ID, KEY)).toBe(true);
    const one = { itemId: ITEM_ID, occurrenceKey: KEY, intent: 'view' } as const;
    expect(isSelected(one, ITEM_ID, KEY)).toBe(true);
    expect(isSelected(one, ITEM_ID, '2026-11-17T13:30:00.000Z')).toBe(false);
    expect(isSelected(one, OTHER_ID, KEY)).toBe(false);
  });

  it('selects and clears the panel item', () => {
    selectPlannerItem({ itemId: ITEM_ID, occurrenceKey: KEY, intent: 'attach' });
    expect(readPlannerSelection()).toEqual({
      itemId: ITEM_ID,
      occurrenceKey: KEY,
      intent: 'attach',
    });
    clearPlannerSelection();
    expect(readPlannerSelection()).toBeNull();
  });
});

describe('item screen', () => {
  it('opens an item with the occurrence it was picked at', () => {
    expect(itemHrefOf(ITEM_ID, KEY)).toStrictEqual({
      pathname: '/planner/item/[itemId]',
      params: { itemId: ITEM_ID, occurrence: KEY },
    });
    expect(itemHrefOf(ITEM_ID, null)).toStrictEqual({
      pathname: '/planner/item/[itemId]',
      params: { itemId: ITEM_ID },
    });
  });

  it('asks the assistant about the item and the picked occurrence', () => {
    expect(askPromptOf(item(), 'single')).toBe(
      `About my event “Dentist” (planner item ${ITEM_ID}): `,
    );
    const series = item({ kind: 'task', rrule: WEEKLY, title: 'Stretch' });
    askAboutItem(series, KEY);
    expect(askAssistantWith).toHaveBeenCalledWith(
      `About my task “Stretch” (planner item ${ITEM_ID}, occurrence ${KEY}): `,
    );
  });

  it('keeps a typed title and refuses an empty one', () => {
    expect(titleOf('  Dentist at 4  ')).toBe('Dentist at 4');
    expect(titleOf('   ')).toBeNull();
  });
});
