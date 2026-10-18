import { API_ENDPOINTS, AUTOMATION_V2, AUTOMATION_VALUE_ID } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  createAutomation,
  nodeId,
  setBrightness,
  setPower,
  type Conditions,
  type Step,
  type Steps,
} from './support/programs';
import { startAndFinish, startRun, statusOf } from './support/runs';
import { useRig } from './support/use-rig';
import { numberValue } from './support/values';

const rig = useRig();

async function runSteps(actions: Steps): Promise<Awaited<ReturnType<typeof startAndFinish>>> {
  const row = await createAutomation(rig(), 'Structured', { actions });
  return startAndFinish(rig(), row.id);
}

function lampIs(on: boolean): Conditions {
  return {
    mode: 'all',
    items: [
      {
        type: 'state',
        deviceId: rig().ids.lamp,
        capability: 'power',
        comparison: { operator: 'eq', value: on },
      },
    ],
  };
}

function choose(branches: readonly Conditions[], otherwise?: Steps): Step {
  return {
    type: 'choose',
    nodeId: nodeId(),
    branches: branches.map((conditions, index) => ({
      nodeId: nodeId(),
      conditions,
      actions: [setBrightness(rig().ids.lampTwo, 10 * (index + 1))],
    })),
    ...(otherwise === undefined ? {} : { otherwise }),
  };
}

describe('C20 if, else-if and otherwise', () => {
  it('runs only the first branch whose conditions hold', async () => {
    await rig().state('lamp-1', 'power', true);
    await runSteps([choose([lampIs(false), lampIs(true), lampIs(true)])]);
    expect(rig().sent()).toStrictEqual([['lamp-2', 'brightness', 20]]);
  });

  it('runs the otherwise block when no branch holds', async () => {
    await rig().state('lamp-1', 'power', true);
    await runSteps([choose([lampIs(false)], [setBrightness(rig().ids.lampTwo, 99)])]);
    expect(rig().sent()).toStrictEqual([['lamp-2', 'brightness', 99]]);
  });

  it('does nothing and still succeeds when no branch holds and there is no otherwise', async () => {
    await rig().state('lamp-1', 'power', true);
    const run = await runSteps([choose([lampIs(false)])]);
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([]);
  });

  it('decides with the state at the moment the step runs', async () => {
    const row = await createAutomation(rig(), 'Decides', {
      actions: [choose([lampIs(true)], [setBrightness(rig().ids.lampTwo, 99)])],
    });
    await rig().state('lamp-1', 'power', true);
    await startAndFinish(rig(), row.id);
    await rig().state('lamp-1', 'power', false);
    await startAndFinish(rig(), row.id);
    expect(rig().sent()).toStrictEqual([
      ['lamp-2', 'brightness', 10],
      ['lamp-2', 'brightness', 99],
    ]);
  });

  it('traces the choosing step and the steps of the chosen branch only', async () => {
    await rig().state('lamp-1', 'power', true);
    const row = await createAutomation(rig(), 'Traced', {
      actions: [choose([lampIs(false), lampIs(true)])],
    });
    const saved = AUTOMATION_V2.parse(row.definition).steps[0];
    const run = await startAndFinish(rig(), row.id);
    const chosen = saved?.do === 'if' ? saved.branches[1]?.then[0]?.id : undefined;
    expect(run.trace.map((entry) => [entry.nodeId, entry.status])).toStrictEqual([
      [chosen, 'succeeded'],
      [saved?.id, 'succeeded'],
    ]);
  });
});

function counterBelow(valueId: string, limit: number): Conditions {
  return {
    mode: 'all',
    items: [
      {
        type: 'value',
        valueId: AUTOMATION_VALUE_ID.parse(valueId),
        comparison: { operator: 'lt', value: limit },
      },
    ],
  };
}

function counterAtLeast(valueId: string, limit: number): Conditions {
  return {
    mode: 'all',
    items: [
      {
        type: 'value',
        valueId: AUTOMATION_VALUE_ID.parse(valueId),
        comparison: { operator: 'gte', value: limit },
      },
    ],
  };
}

function increment(valueId: string): Step {
  return {
    type: 'value_update',
    nodeId: nodeId(),
    valueId: AUTOMATION_VALUE_ID.parse(valueId),
    operation: { kind: 'number', operation: { type: 'add', value: 1 } },
  };
}

function repeat(
  repeatMode: Extract<Step, { type: 'repeat' }>['repeat'],
  body: Steps,
  maximumDurationMs = 60_000,
): Step {
  return {
    type: 'repeat',
    nodeId: nodeId(),
    repeat: repeatMode,
    actions: body,
    maximumDurationMs,
    intervalMs: 1000,
  };
}

async function advanceUntilDone(runId: string): Promise<void> {
  for (let tick = 1; tick <= 30; tick += 1) {
    if ((await statusOf(rig(), runId)) !== 'running') return;
    rig().clock.advanceTo(new Date(rig().clock.now().getTime() + 1000).toISOString());
    await rig().settle();
  }
}

const REPEAT_INTERVAL_MS = 1000;

async function expectIntervalBetweenIterations(): Promise<void> {
  await rig().until(() => rig().commands().length >= 1);
  const sent = rig().commands().length;
  const resumeAt = rig().clock.now().getTime() + REPEAT_INTERVAL_MS;
  await rig().until(() => rig().clock.pending().includes(new Date(resumeAt).toISOString()));
  rig().clock.advanceTo(new Date(resumeAt - 1).toISOString());
  await rig().settle();
  expect(rig().commands()).toHaveLength(sent);
  rig().clock.advanceTo(new Date(resumeAt).toISOString());
  await rig().until(() => rig().commands().length > sent);
}

describe('C21 repeat', () => {
  it('repeats the body a fixed number of times with the interval between iterations', async () => {
    const row = await createAutomation(rig(), 'Count', {
      actions: [repeat({ mode: 'count', count: 3 }, [setPower(rig().ids.lamp, true)])],
    });
    const run = await startRun(rig(), row.id);
    await expectIntervalBetweenIterations();
    await advanceUntilDone(run.id);
    expect(await statusOf(rig(), run.id)).toBe('succeeded');
    expect(rig().commands()).toHaveLength(3);
  });

  it('repeats while the conditions hold and checks them before each iteration', async () => {
    const counter = await numberValue(rig(), 'Counter', 0);
    const row = await createAutomation(rig(), 'While', {
      actions: [
        repeat({ mode: 'while', conditions: counterBelow(counter.id, 3) }, [
          increment(counter.id),
          setPower(rig().ids.lamp, true),
        ]),
      ],
    });
    const run = await startRun(rig(), row.id);
    await expectIntervalBetweenIterations();
    await advanceUntilDone(run.id);
    expect(await statusOf(rig(), run.id)).toBe('succeeded');
    expect(rig().commands()).toHaveLength(3);
    const values = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(values[0]?.content).toMatchObject({ value: 3 });
  });

  it('does not run the body of a while loop whose conditions are false at the start', async () => {
    const counter = await numberValue(rig(), 'Counter', 5);
    const run = await runSteps([
      repeat({ mode: 'while', conditions: counterBelow(counter.id, 3) }, [
        setPower(rig().ids.lamp, true),
      ]),
    ]);
    expect(run.status).toBe('succeeded');
    expect(rig().commands()).toHaveLength(0);
  });

  it('repeats until the conditions hold, checking them after each iteration', async () => {
    const counter = await numberValue(rig(), 'Counter', 0);
    const row = await createAutomation(rig(), 'Until', {
      actions: [
        repeat({ mode: 'until', conditions: counterAtLeast(counter.id, 3) }, [
          increment(counter.id),
          setPower(rig().ids.lamp, true),
        ]),
      ],
    });
    const run = await startRun(rig(), row.id);
    await expectIntervalBetweenIterations();
    await advanceUntilDone(run.id);
    expect(await statusOf(rig(), run.id)).toBe('succeeded');
    expect(rig().commands()).toHaveLength(3);
  });

  it('runs the body of an until loop once even when its conditions already hold', async () => {
    const counter = await numberValue(rig(), 'Counter', 10);
    const row = await createAutomation(rig(), 'Until once', {
      actions: [
        repeat({ mode: 'until', conditions: counterAtLeast(counter.id, 3) }, [
          setPower(rig().ids.lamp, true),
        ]),
      ],
    });
    const run = await startRun(rig(), row.id);
    await advanceUntilDone(run.id);
    expect(rig().commands()).toHaveLength(1);
  });

  it('ends the loop with a note when it reaches its time limit', async () => {
    const row = await createAutomation(rig(), 'Endless', {
      actions: [
        repeat(
          { mode: 'while', conditions: { mode: 'all', items: [] } },
          [setPower(rig().ids.lamp, true)],
          3000,
        ),
      ],
    });
    const run = await startRun(rig(), row.id);
    await advanceUntilDone(run.id);
    const finished = await rig().request(API_ENDPOINTS.readAutomationRun, {
      params: { runId: run.id },
    });
    expect(finished.status).toBe('succeeded');
    expect(finished.trace.at(-1)?.error).toContain('time limit');
  });

  it('stops repeating when the run is stopped', async () => {
    const row = await createAutomation(rig(), 'Stoppable', {
      actions: [repeat({ mode: 'count', count: 100 }, [setPower(rig().ids.lamp, true)])],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(() => rig().commands().length >= 1);
    await rig().request(API_ENDPOINTS.stopAutomationRun, { params: { runId: run.id } });
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'cancelled');
    const sent = rig().commands().length;
    rig().clock.advanceTo(new Date(rig().clock.now().getTime() + 10_000).toISOString());
    await rig().settle();
    expect(rig().commands()).toHaveLength(sent);
  });
});
