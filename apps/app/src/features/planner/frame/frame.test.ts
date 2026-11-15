import type { PlannerItemRow } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import { PLANNER_SECTION_ROUTES } from '../model/section-routes';
import { personChoicesOf, shownPersonFor } from './person';
import { opensComposer, opensSearch, plannerComposerKindOf } from './quick-add';
import { isOpenTask, plannerSubtitleOf, todaySummaryOf } from './rail-summary';
import {
  PLANNER_QUICK_ADD_TARGET,
  PLANNER_SECTION_DEFS,
  plannerHrefOf,
  plannerSectionOf,
} from './sections';

const pushed = vi.hoisted(() => {
  const hrefs: unknown[] = [];
  return { hrefs };
});

vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  router: {
    push: (target: unknown): void => {
      pushed.hrefs.push(target);
    },
  },
}));

const { plannerMenu } = await import('./planner-menu');
const { PLANNER_SEARCH_ACTION, withPlannerSearch } = await import('./search-key');
const { shownPlannerPerson } = await import('./person');

const ME = '00000000-0000-4000-8000-000000000001';
const ALEX = '00000000-0000-4000-8000-000000000002';
const AT = '2026-11-07T10:00:00.000Z';

function task(patch: Partial<PlannerItemRow>): PlannerItemRow {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    profile_id: ME,
    collection_id: '00000000-0000-4000-8000-000000000020',
    kind: 'task',
    parent_id: null,
    title: 'Pay rent',
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
    created_at: AT,
    updated_at: AT,
    deleted_at: null,
    ...patch,
  };
}

describe('the planner sections', () => {
  it('cover every section route in the switcher order', () => {
    expect(PLANNER_SECTION_DEFS.map((def) => def.id)).toEqual([...PLANNER_SECTION_ROUTES]);
    expect(PLANNER_SECTION_DEFS.map((def) => def.label)).toEqual([
      'Today',
      'Tasks',
      'Calendar',
      'Insights',
      'Booking',
    ]);
  });

  it('link each rail entry and tab to its Planner page', () => {
    expect(plannerHrefOf('index')).toBe(href.planner.index());
    expect(plannerHrefOf('tasks')).toBe(href.planner.tasks());
    expect(plannerHrefOf('calendar')).toBe(href.planner.calendar());
    expect(plannerHrefOf('insights')).toBe(href.planner.insights());
    expect(plannerHrefOf('booking')).toBe(href.planner.booking());
    expect(() => plannerHrefOf('timers')).toThrow('The Planner has no section timers.');
  });

  it('give every Planner page the quick add with target planner and the page hint', () => {
    expect(PLANNER_QUICK_ADD_TARGET).toBe('planner');
    expect(plannerSectionOf('index').hint).toBe('Add to today. Try: dentist Tue 15:30 #family');
    expect(plannerSectionOf('tasks').hint).toBe('New task. Try: pay rent on the 1st !2');
    expect(plannerSectionOf('calendar').hint).toBe('New event. Try: dentist Tue 15:30');
    expect(plannerSectionOf('index').phoneHint).toBe('Add to today');
  });

  it('names every section with one label that serves as its title at every size', () => {
    expect(PLANNER_SECTION_DEFS.map((def) => def.label)).toEqual([
      'Today',
      'Tasks',
      'Calendar',
      'Insights',
      'Booking',
    ]);
  });
});

describe('the planner summaries', () => {
  it('count missed and left for Today, and hide zero', () => {
    const summary = { personId: ME, missed: 2, left: 5, nextAlarmAt: null, runningTimers: 0 };
    expect(todaySummaryOf(summary)).toBe('2 missed · 5 left');
    expect(todaySummaryOf({ ...summary, missed: 0 })).toBe('5 left');
    expect(todaySummaryOf({ ...summary, missed: 0, left: 0 })).toBeNull();
    expect(todaySummaryOf(null)).toBeNull();
  });

  it('count open top-level tasks only', () => {
    const open = task({});
    expect(
      [
        open,
        task({ status: 'done' }),
        task({ kind: 'event' }),
        task({ parent_id: open.id }),
        task({ deleted_at: AT }),
      ].map(isOpenTask),
    ).toEqual([true, false, false, false, false]);
  });

  it('add the Today summary to the date line', () => {
    expect(plannerSubtitleOf('Saturday 7 November', '2 missed · 5 left')).toBe(
      'Saturday 7 November · 2 missed · 5 left',
    );
    expect(plannerSubtitleOf('Saturday 7 November', null)).toBe('Saturday 7 November');
  });
});

describe('the planner person picker', () => {
  const profiles = [
    { id: ME, name: 'Owner' },
    { id: ALEX, name: 'Alex' },
  ];

  it('shows the signed-in person until the owner picks someone else', () => {
    expect(personChoicesOf(profiles, ME, null)).toEqual([
      { person: null, name: 'Owner', shown: true },
      { person: ALEX, name: 'Alex', shown: false },
    ]);
    expect(personChoicesOf(profiles, ME, ALEX).map((choice) => choice.shown)).toEqual([
      false,
      true,
    ]);
  });

  it('lets only the owner look at another person', () => {
    expect(shownPersonFor(true, ALEX)).toBe(ALEX);
    expect(shownPersonFor(false, ALEX)).toBeNull();
  });
});

describe('the planner menu', () => {
  const people = personChoicesOf(
    [
      { id: ME, name: 'Owner' },
      { id: ALEX, name: 'Alex' },
    ],
    ME,
    null,
  );

  it('lists the person picker on phone', () => {
    const menu = plannerMenu({ people, googleNeedsAttention: false });
    expect(menu.map((item) => item.label)).toEqual(['Owner', 'Alex']);
    expect(menu.map((item) => item.selected)).toEqual([true, false]);
    expect(new Set(menu.map((item) => item.group))).toEqual(new Set(['Show the planner of']));
    menu[1]?.onPress();
    expect(shownPlannerPerson.get()).toBe(ALEX);
    shownPlannerPerson.set(null);
  });

  it('shows Google needs attention only when the link has a problem', () => {
    const quiet = plannerMenu({ people: [], googleNeedsAttention: false });
    expect(quiet.map((item) => item.label)).toEqual([]);
    const loud = plannerMenu({ people: [], googleNeedsAttention: true });
    expect(loud.map((item) => item.label)).toEqual(['Google needs attention']);
    pushed.hrefs.length = 0;
    loud[0]?.onPress();
    expect(pushed.hrefs).toEqual([href.settings.page('connections/google')]);
  });
});

describe('the planner frame', () => {
  it('opens the composer on each section with the kind that section adds', () => {
    expect(plannerComposerKindOf('index')).toBeNull();
    expect(plannerComposerKindOf('tasks')).toBe('task');
    expect(plannerComposerKindOf('calendar')).toBe('event');
    expect(plannerComposerKindOf('insights')).toBeNull();
    expect(plannerComposerKindOf('booking')).toBeNull();
  });

  it('opens the Planner search on a plain slash, never while typing or with a modifier', () => {
    const press = { key: '/', ctrlKey: false, metaKey: false, altKey: false };
    expect(opensSearch(press, false)).toBe(true);
    expect(opensSearch(press, true)).toBe(false);
    expect(opensSearch({ ...press, ctrlKey: true }, false)).toBe(false);
    expect(opensSearch({ ...press, metaKey: true }, false)).toBe(false);
    expect(opensSearch({ ...press, key: 'n' }, false)).toBe(false);
  });

  it('drops the header search action when the page shows the shell search', () => {
    expect(withPlannerSearch([], false)).toEqual([PLANNER_SEARCH_ACTION]);
    expect(withPlannerSearch([], true)).toEqual([]);
  });

  it('offers the Planner search in the header with its slash shortcut', () => {
    expect(PLANNER_SEARCH_ACTION.href).toBe(href.planner.search());
    expect(PLANNER_SEARCH_ACTION.shortcut).toBe('/');
    expect(href.planner.search('dentist')).toEqual({
      pathname: '/planner/search',
      params: { q: 'dentist' },
    });
  });

  it('opens the composer on a plain N, never while typing or with a modifier', () => {
    const press = { key: 'n', ctrlKey: false, metaKey: false, altKey: false };
    expect(opensComposer(press, false)).toBe(true);
    expect(opensComposer({ ...press, key: 'N' }, false)).toBe(true);
    expect(opensComposer(press, true)).toBe(false);
    expect(opensComposer({ ...press, ctrlKey: true }, false)).toBe(false);
    expect(opensComposer({ ...press, metaKey: true }, false)).toBe(false);
    expect(opensComposer({ ...press, altKey: true }, false)).toBe(false);
    expect(opensComposer({ ...press, key: 'm' }, false)).toBe(false);
  });
});
