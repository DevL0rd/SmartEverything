import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_RUN_START_REQUEST,
  AUTOMATION_TEST_INPUT,
  type AutomationTestsRunReply,
  type StoredTest,
} from '@smarteverything/domain';
import {
  defaultStart,
  durationText,
  eventTimes,
  expectationText,
  resultsSummary,
  saveProblem,
  scenarioOf,
  scenarioProblem,
  simulateRequest,
  spanMsOf,
  testBody,
  testRows,
  virtualTimeText,
  type EventRow,
  type ScenarioDraft,
  type ScriptRow,
} from './scenario-model';

const START = { date: '2026-10-19', clock: '19:00', zone: 'Asia/Bangkok' };

function event(id: string, when: EventRow['when'], value: EventRow['value'] = true): EventRow {
  return { id, when, device: 'Kitchen light', control: 'power', value };
}

function draft(over: Partial<ScenarioDraft> = {}): ScenarioDraft {
  return { start: START, world: [], events: [], scripts: [], ...over };
}

describe('timeline times', () => {
  it('resolves after rows from the previous row and at rows to the next such clock time', () => {
    const times = eventTimes(
      draft({
        events: [
          event('a', { kind: 'after', minutes: 10 }),
          event('b', { kind: 'at', clock: '19:30' }),
          event('c', { kind: 'at', clock: '07:00' }),
        ],
      }),
    );
    expect(times.map((time) => new Date(time).toISOString())).toEqual([
      '2026-10-19T12:10:00.000Z',
      '2026-10-19T12:30:00.000Z',
      '2026-10-20T00:00:00.000Z',
    ]);
  });

  it('follows the zone through a spring-forward night', () => {
    const times = eventTimes(
      draft({
        start: { date: '2026-03-07', clock: '23:00', zone: 'America/New_York' },
        events: [event('a', { kind: 'at', clock: '03:00' })],
      }),
    );
    expect(new Date(times[0] ?? 0).toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('measures the span from the start to the last row', () => {
    expect(spanMsOf(draft())).toBe(0);
    expect(spanMsOf(draft({ events: [event('a', { kind: 'after', minutes: 480 })] }))).toBe(
      480 * 60_000,
    );
  });
});

describe('scenario body', () => {
  const scripts: readonly ScriptRow[] = [
    { id: 's1', target: 'Kitchen light', outcome: 'fail', message: '', delaySeconds: 30 },
    { id: 's2', target: '', outcome: 'slow', message: '', delaySeconds: 5 },
    { id: 's3', target: 'Fan', outcome: 'offline', message: '', delaySeconds: 30 },
  ];

  it('builds start, pretend values, outcome scripts and a timed timeline', () => {
    const scenario = scenarioOf(
      draft({
        world: [{ id: 'w', kind: 'device', device: 'Lamp', control: 'power', value: false }],
        events: [event('a', { kind: 'after', minutes: 10 }, false)],
        scripts,
      }),
    );
    expect(scenario).toEqual({
      start: START,
      devices: [{ device: 'Lamp', control: 'power', value: false }],
      variables: [],
      effects: [
        {
          device: 'Kitchen light',
          outcome: { kind: 'fail', message: 'The command failed in the simulation.' },
        },
        { outcome: { kind: 'slow', delayMs: 5000 } },
        { device: 'Fan', outcome: { kind: 'offline' } },
      ],
      timeline: [
        {
          at: '2026-10-19T12:10:00.000Z',
          device: { device: 'Kitchen light', control: 'power', value: false },
        },
      ],
    });
  });

  it('makes a start request the hub accepts', () => {
    const parsed = AUTOMATION_RUN_START_REQUEST.parse(
      simulateRequest('0d9b1f3e-5a7c-4e21-9b3d-6f1a2c4e8d70', draft(), ['n1']),
    );
    expect(parsed.mode).toBe('simulate');
    expect(parsed.breakpoints).toEqual(['n1']);
  });

  it('starts from today in the home zone', () => {
    expect(defaultStart(Date.parse('2026-10-19T12:34:00Z'), 'Asia/Bangkok')).toEqual({
      date: '2026-10-19',
      clock: '19:34',
      zone: 'Asia/Bangkok',
    });
  });
});

describe('problems', () => {
  it('names what blocks a run', () => {
    expect(scenarioProblem(draft())).toBeNull();
    expect(scenarioProblem(draft({ start: { ...START, date: '2026-02-31' } }))).toBe(
      'Pick a start date.',
    );
    expect(scenarioProblem(draft({ start: { ...START, clock: '25:00' } }))).toBe(
      'Pick a start time.',
    );
    expect(
      scenarioProblem(
        draft({ events: [{ ...event('a', { kind: 'after', minutes: 1 }), device: '' }] }),
      ),
    ).toBe('Finish or remove the unfinished timeline rows.');
  });

  it('asks for a name and finished checks before saving', () => {
    expect(saveProblem('', draft(), [])).toBe('Give the test a name.');
    expect(
      saveProblem('Evening', draft(), [{ id: 'c', kind: 'command', effect: '', target: '' }]),
    ).toBe('Finish or remove the unfinished checks.');
    expect(saveProblem('Evening', draft(), [])).toBeNull();
  });
});

describe('virtual time', () => {
  it('shows the day, the clock and how far the simulation got', () => {
    const startMs = Date.parse('2026-10-19T12:00:00Z');
    expect(
      virtualTimeText({
        startMs,
        nowMs: startMs + 10 * 60_000,
        spanMs: 8 * 3_600_000,
        zone: 'Asia/Bangkok',
      }),
    ).toBe('Simulated · Mon 19:10, 10 min of 8 h');
    expect(virtualTimeText({ startMs, nowMs: startMs, spanMs: 0, zone: 'Asia/Bangkok' })).toBe(
      'Simulated · Mon 19:00',
    );
  });

  it('writes durations in days, hours and minutes', () => {
    expect(durationText(30_000)).toBe('under 1 min');
    expect(durationText(90 * 60_000)).toBe('1 h 30 min');
    expect(durationText(26 * 3_600_000)).toBe('1 d 2 h');
  });
});

describe('saved tests', () => {
  const stored: StoredTest = {
    automation_id: 'auto-1',
    id: 't1',
    name: 'Evening',
    scenario: {},
    expectations: [
      { kind: 'status', equals: 'succeeded' },
      { kind: 'command', effect: 'setLights', target: 'Lamp', times: 2 },
      { kind: 'mystery' },
    ],
    updated_at: '2026-10-19T12:00:00.000Z',
  };
  const second: StoredTest = { ...stored, id: 't2', name: 'Morning', expectations: [] };
  const reply: AutomationTestsRunReply = {
    passed: 1,
    failed: 1,
    results: [
      {
        testId: 't1',
        name: 'Evening',
        passed: false,
        outcome: 'succeeded',
        failures: [
          {
            expectation: { kind: 'status', equals: 'failed' },
            message: 'Expected the run to fail but it succeeded.',
          },
        ],
      },
      { testId: 't2', name: 'Morning', passed: true, outcome: 'succeeded', failures: [] },
    ],
  };

  it('shows pending, failed and passed rows with readable checks', () => {
    expect(testRows([stored], null)[0]).toMatchObject({ status: 'pending', failures: [] });
    const rows = testRows([stored, second], reply);
    expect(rows.map((row) => row.status)).toEqual(['failed', 'passed']);
    expect(rows[0]?.failures).toEqual(['Expected the run to fail but it succeeded.']);
    expect(rows[0]?.checks).toEqual([
      'The run succeeded',
      'Sends setLights to Lamp, 2 times',
      'A check that this app version cannot read',
    ]);
  });

  it('summarises a run of all tests', () => {
    expect(resultsSummary(0, null)).toBe('No tests yet');
    expect(resultsSummary(2, null)).toBe('2 tests');
    expect(resultsSummary(2, reply)).toBe('1 passed, 1 failed');
    expect(resultsSummary(1, { passed: 1, failed: 0, results: [] })).toBe('All 1 passed');
  });

  it('builds a test the hub accepts', () => {
    const body = testBody(' Evening ', draft(), [
      { id: 'a', kind: 'status', equals: 'failed' },
      { id: 'b', kind: 'command', effect: 'setLights', target: '' },
      { id: 'c', kind: 'visited', node: 'n1', visited: false },
    ]);
    const parsed = AUTOMATION_TEST_INPUT.parse(body);
    expect(parsed.name).toBe('Evening');
    expect(parsed.expectations.map(expectationText)).toEqual([
      'The run failed',
      'Sends setLights',
      'n1 does not run',
    ]);
  });
});
