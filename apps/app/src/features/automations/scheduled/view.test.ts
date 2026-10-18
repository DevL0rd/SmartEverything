import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_ROW,
  type ScheduleOutcome,
  type ScheduleResult,
  type ScheduleRow,
  type ScheduleState,
} from '@smarteverything/domain';
import {
  canEdit,
  countdown,
  finishedOf,
  forDevice,
  lateLine,
  latestResult,
  missedResults,
  runsLine,
  secondsLeft,
  titleOf,
  upcomingOf,
  whenLine,
} from './view';

const ID = '20000000-0000-4000-8000-000000000001';
const LAMP = '30000000-0000-4000-8000-000000000001';
const FAN = '30000000-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

function rowOf(overrides: Partial<Record<string, unknown>> = {}): ScheduleRow {
  return SCHEDULE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    via: 'app',
    label: null,
    timing: { kind: 'in', seconds: 300 },
    occurrences: ['2026-10-16T12:05:00.000Z'],
    steps: [{ kind: 'wait', seconds: 1 }],
    step_lines: [null],
    device_ids: [],
    state: 'scheduled',
    next_at: '2026-10-16T12:05:00.000Z',
    occurrence: 0,
    step: 0,
    results: [],
    confirmed_at: null,
    confirmed_by: null,
    origin: null,
    created_at: '2026-10-16T11:00:00.000Z',
    updated_at: '2026-10-16T11:00:00.000Z',
    finished_at: null,
    ...overrides,
  });
}

function stateRow(
  state: ScheduleState,
  overrides: Partial<Record<string, unknown>> = {},
): ScheduleRow {
  return rowOf({ state, ...overrides });
}

function result(step: number, outcome: ScheduleOutcome, lateMs = 0): ScheduleResult {
  return {
    occurrence: 0,
    step,
    at: '2026-10-16T12:05:00.000Z',
    outcome,
    line: `step ${String(step)}`,
    detail: null,
    late_ms: lateMs,
  };
}

describe('scheduled action titles', () => {
  it('prefers the label, then the first step line, then a generic name', () => {
    expect(titleOf(rowOf({ label: 'Water plants', step_lines: ['Turn on lamp'] }))).toBe(
      'Water plants',
    );
    expect(titleOf(rowOf({ step_lines: [null, 'Turn on lamp'] }))).toBe('Turn on lamp');
    expect(titleOf(rowOf())).toBe('Scheduled action');
  });
});

describe('scheduled action lists', () => {
  const rows = [
    stateRow('scheduled', { device_ids: [LAMP] }),
    stateRow('running', { device_ids: [FAN] }),
    stateRow('done', { device_ids: [LAMP] }),
  ];

  it('splits active from finished actions', () => {
    expect(upcomingOf(rows).map((row) => row.state)).toEqual(['scheduled', 'running']);
    expect(finishedOf(rows).map((row) => row.state)).toEqual(['done']);
  });

  it('lists a device only the actions still to come that touch it', () => {
    expect(forDevice(rows, LAMP)).toHaveLength(1);
    expect(forDevice(rows, LAMP)[0]?.state).toBe('scheduled');
  });
});

describe('the countdown', () => {
  it('counts seconds left and never goes below zero', () => {
    expect(secondsLeft(rowOf(), NOW)).toBe(300);
    expect(secondsLeft(rowOf({ next_at: '2026-10-16T11:00:00.000Z' }), NOW)).toBe(0);
    expect(secondsLeft(rowOf({ next_at: null }), NOW)).toBeNull();
  });

  it('shows minutes and seconds under an hour and rounds up to whole minutes above', () => {
    expect(countdown(75)).toBe('1:15');
    expect(countdown(3599)).toBe('59:59');
    expect(countdown(3601)).toBe('1 h 1 min');
  });
});

describe('the when line', () => {
  it('shows the countdown and the clock time of a waiting action', () => {
    expect(whenLine(rowOf(), NOW, 'UTC')).toBe('In 5:00 · 12:05 PM');
  });

  it('says what a running or paused action is doing', () => {
    expect(whenLine(stateRow('running'), NOW, 'UTC')).toBe('Running now');
    expect(whenLine(stateRow('waiting'), NOW, 'UTC')).toBe('Next step in 5:00');
    expect(whenLine(stateRow('waiting', { next_at: null }), NOW, 'UTC')).toBe('Waiting');
  });

  it('shows how a finished action ended and when', () => {
    const finished = stateRow('failed', { finished_at: '2026-10-16T11:30:00.000Z' });
    expect(whenLine(finished, NOW, 'UTC')).toBe('Didn’t fully work · today 11:30 AM');
    expect(whenLine(stateRow('cancelled'), NOW, 'UTC')).toBe('Cancelled');
  });
});

describe('run counts and lateness', () => {
  const three = [
    '2026-10-16T12:05:00.000Z',
    '2026-10-17T12:05:00.000Z',
    '2026-10-18T12:05:00.000Z',
  ];

  it('counts runs only for repeating actions', () => {
    expect(runsLine(rowOf())).toBeNull();
    expect(runsLine(rowOf({ occurrences: three, occurrence: 1 }))).toBe('1 of 3 runs');
  });

  it('counts the current run as done once the action has finished', () => {
    const finished = stateRow('done', { occurrences: three, occurrence: 2, finished_at: three[2] });
    expect(runsLine(finished)).toBe('3 of 3 runs');
  });

  it('reports lateness only from a minute upwards, using the latest worst delay', () => {
    expect(lateLine(rowOf({ results: [result(0, 'ok', 59_999)] }))).toBeNull();
    expect(lateLine(rowOf({ results: [result(0, 'ok', 5000), result(1, 'ok', 125_000)] }))).toBe(
      'Ran 2 min 5 s late',
    );
    expect(lateLine(rowOf())).toBeNull();
  });
});

describe('step results', () => {
  const results = [result(0, 'ok'), result(1, 'missed'), result(1, 'failed'), result(2, 'missed')];

  it('finds the latest result of a step', () => {
    expect(latestResult(rowOf({ results }), 1)?.outcome).toBe('failed');
    expect(latestResult(rowOf({ results }), 9)).toBeNull();
  });

  it('lists the missed runs', () => {
    expect(missedResults(rowOf({ results })).map((entry) => entry.step)).toEqual([1, 2]);
  });
});

describe('editing a scheduled action', () => {
  it('allows it only while the action is waiting for its time', () => {
    expect(canEdit(stateRow('scheduled'))).toBe(true);
    expect(canEdit(stateRow('waiting'))).toBe(true);
    expect(canEdit(stateRow('running'))).toBe(false);
    expect(canEdit(stateRow('done'))).toBe(false);
  });
});
