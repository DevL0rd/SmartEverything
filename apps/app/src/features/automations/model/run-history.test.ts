import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_RUN_ID,
  type AutomationRunRow,
  type AutomationV2,
} from '@smarteverything/domain';
import { catalogFixture } from './catalog-fixture';
import {
  countRunsOnDay,
  newestFirst,
  newestRuns,
  runDays,
  runLook,
  stepTitle,
  tookMs,
} from './run-history';

const STEP = '80000000-0000-4000-8000-000000000001';
const CASE = '80000000-0000-4000-8000-000000000002';

function run(
  id: string,
  createdAt: string,
  change: Partial<AutomationRunRow> = {},
): AutomationRunRow {
  return {
    id: AUTOMATION_RUN_ID.parse(`90000000-0000-4000-8000-00000000000${id}`),
    automation_id: '90000000-0000-4000-8000-0000000000aa',
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status: 'succeeded',
    current_node: null,
    trace: [],
    error: null,
    created_at: createdAt,
    started_at: createdAt,
    finished_at: createdAt,
    ...change,
  };
}

describe('the newest runs', () => {
  const runs = [
    run('1', '2026-10-15T10:00:00.000Z'),
    run('2', '2026-10-16T09:00:00.000Z'),
    run('3', '2026-10-16T12:00:00.000Z'),
    run('4', '2026-10-14T10:00:00.000Z'),
    run('5', '2026-10-16T12:00:00.000Z'),
    run('6', '2026-10-13T10:00:00.000Z'),
  ];

  it('are the first of the full newest-first order, ties in the order they came', () => {
    for (const count of [0, 1, 2, 3, 5, 6, 9]) {
      expect(newestRuns(runs, count).map((item) => item.id)).toEqual(
        newestFirst(runs)
          .slice(0, count)
          .map((item) => item.id),
      );
    }
  });

  it('leave the runs they were given alone', () => {
    const before = runs.map((item) => item.id);
    newestRuns(runs, 2);
    expect(runs.map((item) => item.id)).toEqual(before);
  });
});

describe('counting the runs of one day', () => {
  const zone = 'America/Edmonton';

  it('counts the runs between the first and the last instant of the day in that zone', () => {
    const runs = [
      run('1', '2026-10-16T05:59:59.000Z'),
      run('2', '2026-10-16T06:00:00.000Z'),
      run('3', '2026-10-17T05:59:59.000Z'),
      run('4', '2026-10-17T06:00:00.000Z'),
    ];
    expect(countRunsOnDay(runs, '2026-10-16', zone)).toBe(2);
    expect(countRunsOnDay(runs, '2026-10-17', zone)).toBe(1);
  });

  it('follows a 25 hour day when the clocks go back', () => {
    const runs = [
      run('1', '2026-11-01T06:00:00.000Z'),
      run('2', '2026-11-02T06:30:00.000Z'),
      run('3', '2026-11-02T07:00:00.000Z'),
    ];
    expect(countRunsOnDay(runs, '2026-11-01', zone)).toBe(2);
    expect(countRunsOnDay(runs, '2026-11-02', zone)).toBe(1);
  });

  it('counts nothing for a day without runs', () => {
    expect(countRunsOnDay([], '2026-10-16', zone)).toBe(0);
  });
});

describe('run history', () => {
  it('lists the newest run first and groups runs by day', () => {
    const runs = newestFirst([
      run('1', '2026-10-15T10:00:00.000Z'),
      run('2', '2026-10-16T09:00:00.000Z'),
      run('3', '2026-10-16T12:00:00.000Z'),
    ]);
    expect(runs.map((item) => item.id.slice(-1))).toEqual(['3', '2', '1']);
    const days = runDays(runs, 'UTC');
    expect(days.map((day) => day.runs.length)).toEqual([2, 1]);
  });

  it('gives each outcome its own look instead of one check for everything', () => {
    const looks = (['succeeded', 'failed', 'cancelled', 'interrupted', 'ignored'] as const).map(
      (status) => runLook(status).icon,
    );
    expect(new Set(looks).size).toBe(5);
    expect(runLook('failed').tone).toBe('critical');
  });

  it('measures how long a finished run took', () => {
    const finished = run('1', '2026-10-16T09:00:00.000Z', {
      started_at: '2026-10-16T09:00:00.000Z',
      finished_at: '2026-10-16T09:00:02.500Z',
    });
    expect(tookMs(finished)).toBe(2500);
    expect(tookMs(run('2', '2026-10-16T09:00:00.000Z', { finished_at: null }))).toBeNull();
  });

  it('names a traced step from the current program, never by its id', () => {
    const names = catalogFixture().names;
    const automation: AutomationV2 = {
      when: [{ on: 'time', at: '07:00' }],
      steps: [
        { do: 'notify', id: STEP, message: 'Hi' },
        { do: 'if', branches: [{ id: CASE, when: { daylight: 'day' }, then: [] }] },
      ],
    };
    expect(stepTitle(names, automation, STEP)).toBe('Send “Hi”');
    expect(stepTitle(names, automation, CASE)).toBe('Check case 1');
    expect(stepTitle(names, automation, 'gone')).toBe('A step that was removed');
    expect(stepTitle(names, null, STEP)).toBe('A step that was removed');
  });
});
