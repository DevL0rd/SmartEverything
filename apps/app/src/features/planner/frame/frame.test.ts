import {
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceView,
  type PlannerStats,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { clock } from '../../../format/time';
import { PLANNER_SECTION_ROUTES } from '../model/section-routes';
import { openPlannerSection } from './open-section';
import { personChoicesOf, shownPersonFor } from './person';
import { opensComposer, plannerComposerKindOf } from './quick-add';
import {
  calendarSummaryOf,
  insightsSummaryOf,
  plannerSubtitleOf,
  tasksSummaryOf,
  todaySummaryOf,
} from './rail-summary';
import {
  PLANNER_QUICK_ADD_TARGET,
  PLANNER_SECTION_DEFS,
  plannerHrefOf,
  plannerSectionOf,
  plannerTitleOf,
  railWidthOf,
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
    created_by: 'person',
    created_at: AT,
    updated_at: AT,
    deleted_at: null,
    ...patch,
  };
}

function event(
  title: string,
  start: string | null,
  patch: Partial<PlannerOccurrenceView> = {},
): PlannerOccurrenceView {
  const view: PlannerOccurrenceView = {
    item_id: '00000000-0000-4000-8000-000000000030',
    occurrence_key: start ?? 'once',
    collection_id: '00000000-0000-4000-8000-000000000020',
    kind: 'event',
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
    ...patch,
  };
  return view;
}

function day(upcoming: readonly PlannerOccurrenceView[]): PlannerDay {
  return {
    date: '2026-11-07',
    time_zone: 'Europe/Berlin',
    now: AT,
    missed: [],
    current: [],
    upcoming,
    done: [],
    happened: [],
    rings: [],
    next_alarm_at: null,
    strip: [],
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
    ]);
  });

  it('put Today, Tasks and Calendar on the phone tabs and Insights in the menu', () => {
    expect(PLANNER_SECTION_DEFS.filter((def) => def.phoneTab).map((def) => def.label)).toEqual([
      'Today',
      'Tasks',
      'Calendar',
    ]);
  });

  it('link each rail entry and tab to its Planner page', () => {
    expect(plannerHrefOf('index')).toBe(href.planner.index());
    expect(plannerHrefOf('tasks')).toBe(href.planner.tasks());
    expect(plannerHrefOf('calendar')).toBe(href.planner.calendar());
    expect(plannerHrefOf('insights')).toBe(href.planner.insights());
    expect(() => plannerHrefOf('timers')).toThrow('The Planner has no section timers.');
  });

  it('give every Planner page the quick add with target planner and the page hint', () => {
    expect(PLANNER_QUICK_ADD_TARGET).toBe('planner');
    expect(plannerSectionOf('index').hint).toBe('Add to today. Try: dentist Tue 15:30 #family');
    expect(plannerSectionOf('tasks').hint).toBe('New task. Try: pay rent on the 1st !2');
    expect(plannerSectionOf('calendar').hint).toBe('New event. Try: dentist Tue 15:30');
  });

  it('title the page Planner on phone, at 884 and on desktop Today, else by section', () => {
    expect(plannerTitleOf('tasks', 412)).toBe('Planner');
    expect(plannerTitleOf('tasks', 804)).toBe('Planner');
    expect(plannerTitleOf('index', 1360)).toBe('Planner');
    expect(plannerTitleOf('calendar', 1360)).toBe('Calendar');
  });

  it('shows the rail in icon width at 884 and wide on desktop', () => {
    expect(railWidthOf(804)).toBe('icon');
    expect(railWidthOf(1360)).toBe('wide');
  });
});

describe('the planner rail summaries', () => {
  it('count missed and left for Today, and hide zero', () => {
    const summary = { personId: ME, missed: 2, left: 5, nextAlarmAt: null, runningTimers: 0 };
    expect(todaySummaryOf(summary)).toBe('2 missed · 5 left');
    expect(todaySummaryOf({ ...summary, missed: 0 })).toBe('5 left');
    expect(todaySummaryOf({ ...summary, missed: 0, left: 0 })).toBeNull();
    expect(todaySummaryOf(null)).toBeNull();
  });

  it('count open top-level tasks only', () => {
    const open = task({});
    expect(tasksSummaryOf([])).toBeNull();
    expect(
      tasksSummaryOf([
        open,
        task({ status: 'done' }),
        task({ kind: 'event' }),
        task({ parent_id: open.id }),
        task({ deleted_at: AT }),
      ]),
    ).toBe('1 open');
  });

  it('name the next timed event of the day', () => {
    const now = Date.parse(AT);
    const later = '2026-11-07T14:30:00.000Z';
    const soon = '2026-11-07T11:00:00.000Z';
    const past = '2026-11-07T09:00:00.000Z';
    const upcoming = [
      event('Dentist', later),
      event('Standup', soon),
      event('Breakfast', past),
      event('Holiday', soon, { all_day: true }),
      event('Call', soon, { kind: 'task' }),
    ];
    expect(calendarSummaryOf(day(upcoming), now)).toBe(`Standup ${clock(soon, 'Europe/Berlin')}`);
    expect(calendarSummaryOf(day([]), now)).toBeNull();
    expect(calendarSummaryOf(null, now)).toBeNull();
  });

  it('show the on time share with a space before the percent sign', () => {
    const stats = { on_time: { on_time: 41, late: 9 } } as const;
    expect(insightsSummaryOf({ ...emptyStats(), ...stats })).toBe('On time 82 %');
    expect(insightsSummaryOf(emptyStats())).toBeNull();
    expect(insightsSummaryOf(null)).toBeNull();
  });

  it('add the Today summary to the date line', () => {
    expect(plannerSubtitleOf('Saturday 7 November', '2 missed · 5 left')).toBe(
      'Saturday 7 November · 2 missed · 5 left',
    );
    expect(plannerSubtitleOf('Saturday 7 November', null)).toBe('Saturday 7 November');
  });
});

function emptyStats(): PlannerStats {
  return {
    range: 'week',
    from: '2026-11-02',
    to: '2026-11-08',
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: [],
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [],
    timer_use: [],
    alarms: [],
  };
}

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

  it('starts with the person picker on phone, then Insights and Planner settings', () => {
    const menu = plannerMenu({ people, insights: true, googleNeedsAttention: false });
    expect(menu.map((item) => item.label)).toEqual([
      'Showing: Owner',
      'Show Alex',
      'Insights',
      'Planner settings',
    ]);
    pushed.hrefs.length = 0;
    menu[2]?.onPress();
    menu[3]?.onPress();
    expect(pushed.hrefs).toEqual([href.planner.insights(), mainPageSettings('planner').href]);
    menu[1]?.onPress();
    expect(shownPlannerPerson.get()).toBe(ALEX);
    shownPlannerPerson.set(null);
  });

  it('shows Google needs attention only when the link has a problem', () => {
    const quiet = plannerMenu({ people: [], insights: false, googleNeedsAttention: false });
    expect(quiet.map((item) => item.label)).toEqual(['Planner settings']);
    const loud = plannerMenu({ people: [], insights: false, googleNeedsAttention: true });
    expect(loud.map((item) => item.label)).toEqual(['Google needs attention', 'Planner settings']);
    pushed.hrefs.length = 0;
    loud[0]?.onPress();
    expect(pushed.hrefs).toEqual([href.settings.page('connections/google')]);
  });
});

describe('the planner frame', () => {
  it('switches sections inside the section tabs without a push', () => {
    const dispatched: unknown[] = [];
    const navigated: unknown[] = [];
    const navigation = {
      getState: (): { readonly type: string; readonly key: string } => ({
        type: 'tab',
        key: 'sections',
      }),
      dispatch: (action: unknown): void => {
        dispatched.push(action);
      },
    };
    const router = {
      navigate: (target: unknown): void => {
        navigated.push(target);
      },
    };
    openPlannerSection({ section: 'tasks', active: 'index', navigation, router });
    openPlannerSection({ section: 'tasks', active: 'tasks', navigation, router });
    expect(dispatched).toEqual([
      { type: 'NAVIGATE', payload: { name: 'tasks' }, target: 'sections' },
    ]);
    openPlannerSection({
      section: 'insights',
      active: 'index',
      navigation: { getState: (): undefined => undefined, dispatch: navigation.dispatch },
      router,
    });
    expect(navigated).toEqual([href.planner.insights()]);
  });

  it('opens the composer on each section with the kind that section adds', () => {
    expect(plannerComposerKindOf('index')).toBeNull();
    expect(plannerComposerKindOf('tasks')).toBe('task');
    expect(plannerComposerKindOf('calendar')).toBe('event');
    expect(plannerComposerKindOf('insights')).toBeNull();
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
