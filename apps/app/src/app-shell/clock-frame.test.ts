import type { PlannerParse } from '../api/planner';
import {
  PLANNER_ALARM_ROW,
  type PlannerAlarmRow,
  type PlannerStopwatchRow,
  type PlannerTimerRow,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { CLOCK_SECTION_ROUTES } from '../features/clock/model/section-routes';
import { isHubOffline } from '../features/clock/frame/hub-status';
import { openClockSection } from '../features/clock/frame/open-section';
import { clockComposerKindOf } from '../features/clock/frame/quick-add';
import {
  alarmSummaryOf,
  cityOf,
  hasRunningTimer,
  stopwatchSummaryOf,
  stopwatchTimeOf,
  timerSummaryOf,
  worldSummaryOf,
} from '../features/clock/frame/rail-summary';
import {
  CLOCK_QUICK_ADD_TARGET,
  CLOCK_SECTION_DEFS,
  clockHrefOf,
  clockSectionOf,
  clockTitleOf,
  railWidthOf,
} from '../features/clock/frame/sections';
import { clock24 } from '../format/time';
import { href } from './hrefs';

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

const { clockMenu } = await import('../features/clock/frame/clock-menu');
const { PLANNER_CLOCK_SETTING } = await import('../features/planner/settings');
const { addPlan, shownKindOf } = await import('../features/planner/item/composer');
const { composerPlanOf } = await import('../features/planner/item/parse-preview');

type WorldClock = PlannerPreferences['clock']['world_clocks'][number];

const AT = '2026-11-07T10:00:00.000Z';

const ZONE = 'Europe/London';

const PARSED: Readonly<Record<string, PlannerParse>> = {
  'wake me 06:30 weekdays': parsedTask({
    title: 'wake me',
    start_local: '2026-11-16T06:30:00',
    time_zone: ZONE,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  }),
  'pasta 10 min': parsedTask({
    title: 'pasta',
    due_date: '2026-11-14',
    due_at: '2026-11-14T17:10:00.000Z',
  }),
};

function parsedTask(patch: Partial<PlannerParse['draft']>): PlannerParse {
  return {
    draft: {
      collection_id: '00000000-0000-4000-8000-000000000020',
      kind: 'task',
      title: '',
      parent_id: null,
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
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [],
      ...patch,
    },
    next_occurrences: [],
    repeat_text: null,
  };
}

type ComposerPorts = Parameters<typeof addPlan>[2];

interface RecordedPorts {
  readonly alarms: unknown[];
  readonly timers: unknown[];
  readonly ports: ComposerPorts;
}

function alarmRow(body: Parameters<ComposerPorts['items']['createAlarm']>[0]): PlannerAlarmRow {
  return PLANNER_ALARM_ROW.parse({
    id: '00000000-0000-4000-8000-000000000030',
    profile_id: '00000000-0000-4000-8000-000000000002',
    label: body.label,
    time: body.time,
    days: body.days,
    once_on: body.once_on,
    skip_on: null,
    enabled: true,
    sound: 'Morning light',
    ramp_seconds: 60,
    vibrate: true,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
    created_at: AT,
    updated_at: AT,
  });
}

function composerPorts(): RecordedPorts {
  const alarms: unknown[] = [];
  const timers: unknown[] = [];
  const ports: ComposerPorts = {
    items: {
      createItem: () => Promise.reject(new Error('The Clock never adds Planner items.')),
      createAlarm: (body) => {
        alarms.push(body);
        return Promise.resolve(alarmRow(body));
      },
    },
    clock: {
      startTimer: (body) => {
        timers.push(body);
        return Promise.resolve(timer({ label: body.label ?? null, duration_ms: body.duration_ms }));
      },
    },
  };
  return { alarms, timers, ports };
}

async function addFromClock(
  section: Parameters<typeof clockComposerKindOf>[0],
  text: string,
  ports: ComposerPorts,
): Promise<void> {
  const parsed = PARSED[text] ?? null;
  const kind = shownKindOf('clock', clockComposerKindOf(section), parsed?.draft.kind ?? null);
  const plan = composerPlanOf({ kind, text, parsed, timeZone: ZONE });
  if (plan === null) throw new Error(`The composer had no plan for ${text}.`);
  await addPlan(plan, null, ports);
}

function timer(patch: Partial<PlannerTimerRow>): PlannerTimerRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    profile_id: '00000000-0000-4000-8000-000000000002',
    label: 'Pasta',
    duration_ms: 600_000,
    state: 'running',
    ends_at: '2026-11-07T10:10:00.000Z',
    remaining_ms: null,
    targets: [],
    created_at: AT,
    updated_at: AT,
    ...patch,
  };
}

function stopwatch(patch: Partial<PlannerStopwatchRow>): PlannerStopwatchRow {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    profile_id: '00000000-0000-4000-8000-000000000002',
    running: false,
    started_at: null,
    accumulated_ms: 0,
    laps: [],
    updated_at: AT,
    ...patch,
  };
}

describe('the clock sections', () => {
  it('cover every section route in the switcher order', () => {
    expect(CLOCK_SECTION_DEFS.map((def) => def.id)).toEqual([...CLOCK_SECTION_ROUTES]);
    expect(CLOCK_SECTION_DEFS.map((def) => def.label)).toEqual([
      'Alarms',
      'Timers',
      'Stopwatch',
      'World clock',
    ]);
  });

  it('link each rail entry and strip segment to its Clock page', () => {
    expect(clockHrefOf('index')).toBe(href.clock.alarms());
    expect(clockHrefOf('timers')).toBe(href.clock.timers());
    expect(clockHrefOf('stopwatch')).toBe(href.clock.stopwatch());
    expect(clockHrefOf('world')).toBe(href.clock.world());
    expect(() => clockHrefOf('insights')).toThrow('The Clock has no section insights.');
  });

  it('give every Clock page the quick add with target clock and the page hint', () => {
    expect(CLOCK_QUICK_ADD_TARGET).toBe('clock');
    expect(clockSectionOf('index').hint).toBe('New alarm. Try: wake me 06:30 weekdays');
    expect(clockSectionOf('timers').hint).toBe('New timer. Try: pasta 10 min');
    expect(clockSectionOf('stopwatch').hint).toBe('New alarm or timer. Try: tea 4 min');
    expect(clockSectionOf('world').hint).toBe('New alarm or timer. Try: wake me 06:30 weekdays');
  });

  it('opens the composer as an alarm on Alarms and World, and as a timer on Timers and Stopwatch', () => {
    expect(clockComposerKindOf('index')).toBe('alarm');
    expect(clockComposerKindOf('world')).toBe('alarm');
    expect(clockComposerKindOf('timers')).toBe('timer');
    expect(clockComposerKindOf('stopwatch')).toBe('timer');
  });

  it('adds the Alarms hint as weekday alarms and the Timers hint as a running timer', async () => {
    const recorded = composerPorts();
    await addFromClock('index', 'wake me 06:30 weekdays', recorded.ports);
    await addFromClock('timers', 'pasta 10 min', recorded.ports);
    expect(recorded.alarms).toEqual([
      { time: '06:30', label: 'wake me', days: [1, 2, 3, 4, 5], once_on: null },
    ]);
    expect(recorded.timers).toEqual([{ duration_ms: 600_000, label: 'pasta' }]);
  });

  it('title the page Clock on phone and at 884, and by its section on desktop', () => {
    expect(clockTitleOf('timers', 412)).toBe('Clock');
    expect(clockTitleOf('timers', 804)).toBe('Clock');
    expect(clockTitleOf('timers', 1360)).toBe('Timers');
    expect(clockTitleOf('world', 1360)).toBe('World clock');
  });

  it('shows the rail in icon width at 884 and wide on desktop', () => {
    expect(railWidthOf(804)).toBe('icon');
    expect(railWidthOf(1360)).toBe('wide');
  });
});

describe('the clock rail summaries', () => {
  const now = new Date(2026, 10, 7, 14, 0).getTime();

  it('name the next alarm by its day', () => {
    expect(alarmSummaryOf(null, now)).toBeNull();
    const today = new Date(2026, 10, 7, 18, 30).toISOString();
    const tomorrow = new Date(2026, 10, 8, 7, 0).toISOString();
    expect(alarmSummaryOf(today, now)).toBe('18:30 today');
    expect(alarmSummaryOf(tomorrow, now)).toBe('07:00 tomorrow');
  });

  it('count down the soonest running timer, then show the paused ones', () => {
    const at = new Date(AT).getTime();
    expect(timerSummaryOf([], at)).toBeNull();
    const pasta = timer({});
    expect(hasRunningTimer([pasta])).toBe(true);
    expect(timerSummaryOf([pasta], at + 347_500)).toBe('4:13 left');
    const tea = timer({
      id: '00000000-0000-4000-8000-000000000009',
      label: null,
      ends_at: '2026-11-07T10:04:12.000Z',
    });
    expect(timerSummaryOf([pasta, tea], at)).toBe('2 running · 4:12 left');
    const paused = timer({ state: 'paused', ends_at: null, remaining_ms: 60_000 });
    expect(hasRunningTimer([paused])).toBe(false);
    expect(timerSummaryOf([paused], at)).toBe('Pasta paused');
    expect(timerSummaryOf([timer({ state: 'done' })], at)).toBeNull();
  });

  it('show a zero stopwatch as nothing and a running one with its live time', () => {
    const at = new Date(AT).getTime();
    expect(stopwatchSummaryOf(null, at)).toBeNull();
    expect(stopwatchSummaryOf(stopwatch({}), at)).toBeNull();
    expect(stopwatchSummaryOf(stopwatch({ accumulated_ms: 723_000 }), at)).toBe('Stopped at 12:03');
    const running = stopwatch({ running: true, started_at: AT, accumulated_ms: 3_000 });
    expect(stopwatchSummaryOf(running, at + 720_900)).toBe('Running 12:03');
    expect(stopwatchTimeOf(running, at + 720_900)).toBe('12:03');
    expect(stopwatchTimeOf(null, at)).toBe('0:00');
  });

  it('show the first world city with its own time', () => {
    const tokyo: WorldClock = { time_zone: 'Asia/Tokyo', label: null };
    expect(worldSummaryOf([], now)).toBeNull();
    expect(cityOf(tokyo)).toBe('Tokyo');
    expect(cityOf({ time_zone: 'America/New_York', label: null })).toBe('New York');
    expect(cityOf({ time_zone: 'Asia/Tokyo', label: 'Office' })).toBe('Office');
    expect(worldSummaryOf([tokyo], now)).toBe(`Tokyo ${clock24(now, 'Asia/Tokyo')}`);
    expect(worldSummaryOf([tokyo], Date.parse('2026-11-07T23:05:00Z'))).toBe('Tokyo 08:05');
  });
});

describe('the clock frame', () => {
  it('shows the offline banner only when the hub is unreachable', () => {
    expect(isHubOffline('interrupted')).toBe(true);
    expect(isHubOffline('refused')).toBe(true);
    expect(isHubOffline('live')).toBe(false);
    expect(isHubOffline('connecting')).toBe(false);
  });

  it('opens Planner settings at its Clock group and Ask AI from the overflow menu', () => {
    const menu = clockMenu();
    expect(menu.map((item) => item.label)).toEqual(['Planner settings', 'Ask AI']);
    pushed.hrefs.length = 0;
    for (const item of menu) item.onPress();
    expect(pushed.hrefs).toEqual([
      href.settings.focus('planner', PLANNER_CLOCK_SETTING),
      href.assistantChat(),
    ]);
  });

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
    openClockSection({ section: 'timers', active: 'index', navigation, router });
    openClockSection({ section: 'timers', active: 'timers', navigation, router });
    expect(dispatched).toEqual([
      { type: 'NAVIGATE', payload: { name: 'timers' }, target: 'sections' },
    ]);
    openClockSection({
      section: 'world',
      active: 'index',
      navigation: { getState: (): undefined => undefined, dispatch: navigation.dispatch },
      router,
    });
    expect(navigated).toEqual([href.clock.world()]);
  });

  it('loads every Clock page and the ring screen', async () => {
    const pages = await Promise.all([
      import('../features/clock/alarms-page'),
      import('../features/clock/timers-page'),
      import('../features/clock/stopwatch-page'),
      import('../features/clock/world-page'),
      import('../features/clock/ring-screen'),
      import('../features/clock'),
    ]);
    const [alarms, timers, stopwatchPage, world, ring, feature] = pages;
    expect(typeof alarms.AlarmsPage).toBe('function');
    expect(typeof timers.TimersPage).toBe('function');
    expect(typeof stopwatchPage.StopwatchPage).toBe('function');
    expect(typeof world.WorldPage).toBe('function');
    expect(typeof ring.RingScreen).toBe('function');
    expect(typeof feature.ClockFrame).toBe('function');
  });
});
