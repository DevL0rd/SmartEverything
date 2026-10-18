import { API_ENDPOINTS, type AutomationRunRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, nodeId, setPower, type Program, type Step } from './support/programs';
import { runsOf, startAndFinish, startRun, statusOf } from './support/runs';
import { createSequence } from './support/sequences';
import { useRig } from './support/use-rig';

const rig = useRig();

function slow(policy: Program['runPolicy'], extra: Partial<Program> = {}): Program {
  return {
    actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    ...(policy === undefined ? {} : { runPolicy: policy }),
    ...extra,
  };
}

async function started(id: string, count: number): Promise<AutomationRunRow[]> {
  const runs: AutomationRunRow[] = [];
  for (let index = 0; index < count; index += 1) {
    runs.push(await startRun(rig(), id));
    await rig().settle();
  }
  return runs;
}

async function statuses(runs: readonly AutomationRunRow[]): Promise<string[]> {
  return Promise.all(runs.map((run) => statusOf(rig(), run.id)));
}

async function waitFor(
  runs: readonly AutomationRunRow[],
  expected: readonly string[],
): Promise<void> {
  await rig().until(async () => JSON.stringify(await statuses(runs)) === JSON.stringify(expected));
}

describe('C24 run policies', () => {
  it('single ignores an occurrence while a run is active and accepts one afterwards', async () => {
    const row = await createAutomation(rig(), 'Single', slow({ mode: 'single' }));
    const runs = await started(row.id, 2);
    await waitFor(runs, ['running', 'ignored']);
    const ignored = (await runsOf(rig(), row.id)).find((run) => run.status === 'ignored');
    expect(ignored?.error).toContain('Single mode ignored');
    rig().clock.advanceTo('2026-10-08T10:10:00.000Z');
    await waitFor(runs, ['succeeded', 'ignored']);
    const again = await startRun(rig(), row.id);
    await rig().until(async () => (await statusOf(rig(), again.id)) === 'running');
  });

  it('restart cancels the active run and starts the new one', async () => {
    const row = await createAutomation(rig(), 'Restart', slow({ mode: 'restart' }));
    const runs = await started(row.id, 2);
    await waitFor(runs, ['cancelled', 'running']);
    rig().clock.advanceTo('2026-10-08T10:20:00.000Z');
    await waitFor(runs, ['cancelled', 'succeeded']);
    expect(rig().commands()).toHaveLength(1);
  });

  it('queue runs one at a time in order and ignores occurrences beyond its limit', async () => {
    const row = await createAutomation(rig(), 'Queue', slow({ mode: 'queue', limit: 1 }));
    const runs = await started(row.id, 3);
    await waitFor(runs, ['running', 'queued', 'ignored']);
    rig().clock.advanceTo('2026-10-08T10:10:00.000Z');
    await rig().until(async () => (await statusOf(rig(), runs[1]?.id ?? '')) === 'running');
    expect(await statuses(runs)).toStrictEqual(['succeeded', 'running', 'ignored']);
  });

  it('parallel runs up to its limit at once and ignores the rest', async () => {
    const row = await createAutomation(rig(), 'Parallel', slow({ mode: 'parallel', limit: 2 }));
    const runs = await started(row.id, 3);
    await waitFor(runs, ['running', 'running', 'ignored']);
  });

  it('without a policy runs every occurrence at once', async () => {
    const row = await createAutomation(rig(), 'Unbounded', slow(undefined));
    const runs = await started(row.id, 3);
    await waitFor(runs, ['running', 'running', 'running']);
  });

  it('a control key lets a stop reach only the runs that carry that key', async () => {
    const keyed = await createAutomation(
      rig(),
      'Keyed',
      slow({ mode: 'parallel', limit: 3 }, { controlKey: 'night' }),
    );
    const plain = await createAutomation(rig(), 'Plain', slow({ mode: 'parallel', limit: 3 }));
    const [keyedRun] = await started(keyed.id, 1);
    const [plainRun] = await started(plain.id, 1);
    await rig().request(API_ENDPOINTS.stopAutomationRuns, {
      params: { automationId: keyed.id },
      body: { key: 'morning' },
    });
    await rig().settle();
    expect(await statusOf(rig(), keyedRun?.id ?? '')).toBe('running');
    await rig().request(API_ENDPOINTS.stopAutomationRuns, {
      params: { automationId: keyed.id },
      body: { key: 'night' },
    });
    await rig().until(async () => (await statusOf(rig(), keyedRun?.id ?? '')) === 'cancelled');
    expect(await statusOf(rig(), plainRun?.id ?? '')).toBe('running');
  });

  it('a stop step with the current target ends its own run and skips the remaining steps', async () => {
    const row = await createAutomation(rig(), 'Self stop', {
      actions: [
        setPower(rig().ids.lamp, true),
        { type: 'stop', nodeId: nodeId(), target: { type: 'current' } },
        setPower(rig().ids.lampTwo, true),
      ],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'cancelled');
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });

  it('a stop step can stop the runs of another automation by its control key', async () => {
    const target = await createAutomation(
      rig(),
      'Target',
      slow({ mode: 'parallel', limit: 2 }, { controlKey: 'zone' }),
    );
    const stopper = await createAutomation(rig(), 'Stopper', {
      actions: [
        {
          type: 'stop',
          nodeId: nodeId(),
          target: { type: 'automation', id: target.id, controlKey: 'zone' },
        },
      ],
    });
    const [running] = await started(target.id, 1);
    const stop = await startRun(rig(), stopper.id);
    await rig().until(async () => (await statusOf(rig(), running?.id ?? '')) === 'cancelled');
    await rig().until(async () => (await statusOf(rig(), stop.id)) === 'succeeded');
  });
});

describe('C24 stopping reusable steps by key', () => {
  async function runningSequence(): Promise<{ id: string; runId: string }> {
    const sequence = await createSequence(rig(), `Long ${nodeId()}`, {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
      controlKey: 'night',
    });
    const run = await startRun(rig(), sequence.id);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'running');
    return { id: sequence.id, runId: run.id };
  }

  async function stopWith(step: Step): Promise<void> {
    const stopper = await createAutomation(rig(), `Stopper ${nodeId()}`, { actions: [step] });
    const stop = await startAndFinish(rig(), stopper.id);
    expect(stop.status).toBe('succeeded');
  }

  it('a stop step targeting a sequence stops its runs only when the control key matches', async () => {
    const { id, runId } = await runningSequence();
    await stopWith({
      type: 'stop',
      nodeId: nodeId(),
      target: { type: 'sequence', id, controlKey: 'morning' },
    });
    expect(await statusOf(rig(), runId)).toBe('running');
    await stopWith({
      type: 'stop',
      nodeId: nodeId(),
      target: { type: 'sequence', id, controlKey: 'night' },
    });
    await rig().until(async () => (await statusOf(rig(), runId)) === 'cancelled');
    expect(rig().commands()).toHaveLength(0);
  });

  it('a stop step targeting a sequence without a key stops every run of it', async () => {
    const { id, runId } = await runningSequence();
    await stopWith({ type: 'stop', nodeId: nodeId(), target: { type: 'sequence', id } });
    await rig().until(async () => (await statusOf(rig(), runId)) === 'cancelled');
  });

  it('stops exactly one run by its id', async () => {
    const first = await runningSequence();
    const second = await runningSequence();
    await rig().request(API_ENDPOINTS.stopAutomationRun, { params: { runId: first.runId } });
    await rig().until(async () => (await statusOf(rig(), first.runId)) === 'cancelled');
    expect(await statusOf(rig(), second.runId)).toBe('running');
  });

  it('the stop endpoint stops a sequence only when the control key matches and stops all without one', async () => {
    const { id, runId } = await runningSequence();
    await rig().request(API_ENDPOINTS.stopAutomationRuns, {
      params: { automationId: id },
      body: { key: 'morning' },
    });
    await rig().settle();
    expect(await statusOf(rig(), runId)).toBe('running');
    await rig().request(API_ENDPOINTS.stopAutomationRuns, {
      params: { automationId: id },
      body: { key: 'night' },
    });
    await rig().until(async () => (await statusOf(rig(), runId)) === 'cancelled');
    const other = await startRun(rig(), id);
    await rig().until(async () => (await statusOf(rig(), other.id)) === 'running');
    await rig().request(API_ENDPOINTS.stopAutomationRuns, {
      params: { automationId: id },
      body: {},
    });
    await rig().until(async () => (await statusOf(rig(), other.id)) === 'cancelled');
  });
});
