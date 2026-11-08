import type {
  PlannerLap,
  PlannerRingRow,
  PlannerStats,
  PlannerStopwatchRow,
  PlannerTimerRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  averageSplitOf,
  currentLapSourceOf,
  deltaText,
  deltaToneOf,
  digitAt,
  facePlacesOf,
  hourDigitsOf,
  lapExtremesOf,
  lapFloorOf,
  lapRowsOf,
  lapTime,
  ringWindowOf,
  stopwatchSourceOf,
  tickValueAt,
  timedText,
  timerSourceOf,
  timerUseBucketsOf,
  timerUseLabelsOf,
  timerViewsOf,
  timersSubtitleOf,
} from './lap-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const AT = Date.parse('2026-11-07T14:00:00.000Z');

function lapsOf(splits: readonly number[]): readonly PlannerLap[] {
  let elapsed = 0;
  return splits.map((split) => {
    elapsed += split;
    return { elapsed_ms: elapsed, split_ms: split };
  });
}

function stopwatch(patch: Partial<PlannerStopwatchRow>): PlannerStopwatchRow {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000020',
    profile_id: PROFILE,
    running: false,
    started_at: null,
    accumulated_ms: 0,
    laps: [],
    updated_at: new Date(AT).toISOString(),
    ...patch,
  };
}

function timer(id: string, patch: Partial<PlannerTimerRow>): PlannerTimerRow {
  return {
    id,
    profile_id: PROFILE,
    label: null,
    duration_ms: 600_000,
    state: 'running',
    ends_at: new Date(AT + 252_000).toISOString(),
    remaining_ms: null,
    targets: [],
    created_at: new Date(AT - 348_000).toISOString(),
    updated_at: new Date(AT - 348_000).toISOString(),
    ...patch,
  };
}

function ring(refId: string, dismissed: string | null): PlannerRingRow {
  return {
    id: `a1b2c3d4-0000-4000-8000-0000000009${refId.slice(-2)}`,
    kind: 'timer',
    ref_id: refId,
    profile_id: PROFILE,
    due_at: new Date(AT - 60_000).toISOString(),
    rang_at: new Date(AT - 60_000).toISOString(),
    dismissed_at: dismissed,
    snoozes: 0,
    target: null,
    outcome: 'rang',
    missed_reason: null,
  };
}

const ID = (n: number): string => `a1b2c3d4-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

describe('lap rows', () => {
  const laps = lapsOf([103_400, 101_900, 98_000, 104_600, 109_800, 102_600]);

  it('lists laps newest first with deltas against the lap before and running totals', () => {
    const rows = lapRowsOf(laps);
    expect(rows.map((row) => row.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(rows.at(-1)).toEqual({
      number: 1,
      split: 103_400,
      delta: null,
      total: 103_400,
      mark: null,
    });
    expect(rows[0]?.delta).toBe(-7200);
    expect(rows[0]?.total).toBe(620_300);
  });

  it('marks the fastest lap best and the slowest lap slowest', () => {
    const marks = lapRowsOf(laps).map((row) => [row.number, row.mark]);
    expect(marks).toContainEqual([3, 'best']);
    expect(marks).toContainEqual([5, 'slowest']);
    expect(marks.filter(([, mark]) => mark !== null)).toHaveLength(2);
  });

  it('marks nothing with one lap or when every lap took the same time', () => {
    expect(lapExtremesOf(lapsOf([90_000]))).toBeNull();
    expect(lapExtremesOf(lapsOf([90_000, 90_000, 90_000]))).toBeNull();
  });

  it('keeps the first of tied laps as the best', () => {
    expect(lapExtremesOf(lapsOf([90_000, 95_000, 90_000]))).toEqual({ best: 0, slowest: 1 });
  });

  it('averages the splits and drops the bar floor below the fastest lap', () => {
    expect(averageSplitOf(lapsOf([100_000, 110_000]))).toBe(105_000);
    expect(averageSplitOf([])).toBeNull();
    expect(lapFloorOf(lapsOf([100_000, 110_000]))).toBe(90_000);
    expect(lapFloorOf(lapsOf([10_000, 100_000]))).toBe(0);
  });
});

describe('lap text', () => {
  it('writes lap times with hundredths and hours only when needed', () => {
    expect(lapTime(101_200)).toBe('1:41.20');
    expect(lapTime(723_479)).toBe('12:03.47');
    expect(lapTime(3_723_450)).toBe('1:02:03.45');
    expect(lapTime(0)).toBe('0:00.00');
  });

  it('signs deltas and tones faster laps positive and slower laps critical', () => {
    expect(deltaText(-3900)).toBe('-3.90');
    expect(deltaText(6600)).toBe('+6.60');
    expect(deltaText(4)).toBe('0.00');
    expect(deltaText(61_500)).toBe('+1:01.50');
    expect(deltaToneOf(-3900)).toBe('positive');
    expect(deltaToneOf(6600)).toBe('critical');
    expect(deltaToneOf(null)).toBe('variant');
    expect(deltaToneOf(4)).toBe('variant');
  });
});

describe('ticking digits', () => {
  it('counts a running stopwatch up from the hub start and holds a stopped one', () => {
    const running = stopwatchSourceOf(
      stopwatch({ running: true, started_at: new Date(AT).toISOString(), accumulated_ms: 5000 }),
    );
    expect(tickValueAt(running, AT + 1234)).toBe(6234);
    const held = stopwatchSourceOf(stopwatch({ accumulated_ms: 723_479 }));
    expect(tickValueAt(held, AT + 99_999)).toBe(723_479);
    expect(tickValueAt(stopwatchSourceOf(null), AT)).toBe(0);
  });

  it('times the current lap from the last lap', () => {
    const row = stopwatch({
      running: true,
      started_at: new Date(AT).toISOString(),
      accumulated_ms: 0,
      laps: lapsOf([60_000]),
    });
    expect(tickValueAt(currentLapSourceOf(row), AT + 61_500)).toBe(1500);
  });

  it('counts a timer down to whole seconds and never below zero', () => {
    const running = timerSourceOf(timer(ID(1), {}));
    expect(tickValueAt(running, AT)).toBe(252_000);
    expect(tickValueAt(running, AT + 400)).toBe(252_000);
    expect(tickValueAt(running, AT + 1000)).toBe(251_000);
    expect(tickValueAt(running, AT + 900_000)).toBe(0);
    const paused = timerSourceOf(
      timer(ID(2), { state: 'paused', ends_at: null, remaining_ms: 1_860_000 }),
    );
    expect(tickValueAt(paused, AT + 50_000)).toBe(1_860_000);
  });

  it('reads each digit of the face from the time', () => {
    const ms = 723_470;
    const places = facePlacesOf(0, true);
    const shown = places
      .map((place) =>
        place.kind === 'mark' ? place.text : String(digitAt(ms, place.unit, place.base)),
      )
      .join('');
    expect(shown).toBe('12:03.47');
    expect(facePlacesOf(0, false).map((place) => place.key)).toEqual([
      'm0',
      'm1',
      'ms',
      's0',
      's1',
    ]);
  });

  it('adds hour digits only when the time reaches an hour', () => {
    expect(hourDigitsOf(3_599_999)).toBe(0);
    expect(hourDigitsOf(3_600_000)).toBe(1);
    expect(hourDigitsOf(36_000_000)).toBe(2);
    const ms = 37_230_000;
    const shown = facePlacesOf(hourDigitsOf(ms), false)
      .map((place) =>
        place.kind === 'mark' ? place.text : String(digitAt(ms, place.unit, place.base)),
      )
      .join('');
    expect(shown).toBe('10:20:30');
  });
});

describe('timer views', () => {
  const pasta = timer(ID(1), { label: 'Pasta' });
  const focus = timer(ID(2), { label: 'Focus', ends_at: new Date(AT + 1_083_000).toISOString() });
  const laundry = timer(ID(3), { state: 'paused', ends_at: null, remaining_ms: 1_860_000 });
  const tea = timer(ID(4), {
    label: 'Tea',
    state: 'done',
    ends_at: null,
    updated_at: new Date(AT - 60_000).toISOString(),
  });
  const old = timer(ID(5), { state: 'done', ends_at: null });
  const gone = timer(ID(6), { state: 'cancelled', ends_at: null });

  it('shows ringing timers first, then running by end, then paused, and hides finished ones', () => {
    const views = timerViewsOf(
      [laundry, focus, old, tea, pasta, gone],
      [ring(ID(4), null), ring(ID(5), new Date(AT).toISOString())],
    );
    expect(views.map((view) => [view.timer.id, view.phase])).toEqual([
      [ID(4), 'ringing'],
      [ID(1), 'running'],
      [ID(2), 'running'],
      [ID(3), 'paused'],
    ]);
    expect(views[0]?.ring?.ref_id).toBe(ID(4));
  });

  it('counts the timers in the header in the design order', () => {
    const views = timerViewsOf([laundry, focus, tea, pasta], [ring(ID(4), null)]);
    expect(timersSubtitleOf(views)).toBe('2 running · 1 paused · 1 ringing');
    expect(timersSubtitleOf([])).toBe('No timers running');
  });

  it('asks for rings only over the life of finished timers', () => {
    expect(ringWindowOf([pasta, laundry])).toBeNull();
    expect(ringWindowOf([pasta, tea])).toEqual({
      from: tea.created_at,
      to: new Date(Date.parse(tea.updated_at) + 1).toISOString(),
    });
  });
});

function stats(
  range: PlannerStats['range'],
  days: readonly string[],
  use: PlannerStats['timer_use'],
): PlannerStats {
  return {
    range,
    from: days[0] ?? '2026-11-01',
    to: days.at(-1) ?? '2026-11-01',
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: days.map((day) => ({ day, scheduled_minutes: 0, items: 0 })),
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [],
    timer_use: use,
    alarms: [],
  };
}

const WEEK = [
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
];

describe('timer use', () => {
  const use = [
    { day: '2026-11-02', label: 'Focus', count: 3, total_ms: 4_500_000 },
    { day: '2026-11-02', label: null, count: 1, total_ms: 600_000 },
    { day: '2026-11-07', label: 'Focus', count: 2, total_ms: 3_000_000 },
  ];

  it('sums every timer per day for the week, with a bar for every day', () => {
    const buckets = timerUseBucketsOf(stats('week', WEEK, use));
    expect(buckets).toHaveLength(7);
    expect(buckets.map((bucket) => bucket.ms)).toEqual([0, 5_100_000, 0, 0, 0, 0, 3_000_000]);
  });

  it('groups the days into weeks for longer ranges', () => {
    const month = Array.from(
      { length: 14 },
      (_, index) => `2026-10-${String(index + 18).padStart(2, '0')}`,
    );
    const buckets = timerUseBucketsOf(
      stats('month', month, [{ day: '2026-10-30', label: null, count: 1, total_ms: 60_000 }]),
    );
    expect(buckets.map((bucket) => bucket.key)).toEqual(['2026-10-18', '2026-10-25']);
    expect(buckets.map((bucket) => bucket.ms)).toEqual([0, 60_000]);
  });

  it('lists every label by time with its share, unnamed timers as Timer', () => {
    expect(timerUseLabelsOf(stats('week', WEEK, use))).toEqual([
      { label: 'Focus', ms: 7_500_000, share: 7_500_000 / 8_100_000 },
      { label: 'Timer', ms: 600_000, share: 600_000 / 8_100_000 },
    ]);
    expect(timerUseLabelsOf(stats('week', WEEK, []))).toEqual([]);
  });

  it('writes timed totals in hours and minutes', () => {
    expect(timedText(24_000_000)).toBe('6 h 40 min');
    expect(timedText(0)).toBe('0 min');
  });
});
