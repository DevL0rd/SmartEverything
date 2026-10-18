import { API_ENDPOINTS, AUTOMATION_V2 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setBrightness, setPower, type Conditions } from './support/programs';
import { runsOf, startAndFinish, startRun, statusOf } from './support/runs';
import { useRig } from './support/use-rig';

const rig = useRig();

describe('C25 manual run', () => {
  const lampIsOn = (): Conditions => ({
    mode: 'all',
    items: [
      {
        type: 'state',
        deviceId: rig().ids.lamp,
        capability: 'power',
        comparison: { operator: 'eq', value: true },
      },
    ],
  });

  it('runs the actions without checking the triggers or the conditions', async () => {
    await rig().state('lamp-1', 'power', false);
    const row = await createAutomation(rig(), 'Manual', {
      conditions: lampIsOn(),
      actions: [setBrightness(rig().ids.lampTwo, 44)],
    });
    await startAndFinish(rig(), row.id);
    expect(rig().sent()).toStrictEqual([['lamp-2', 'brightness', 44]]);
  });

  it('waits for the actions to finish before answering', async () => {
    const row = await createAutomation(rig(), 'Waits', {
      actions: [setPower(rig().ids.lamp, true), setPower(rig().ids.lampTwo, true)],
    });
    const run = await startAndFinish(rig(), row.id);
    expect(run.status).toBe('succeeded');
    expect(rig().commands()).toHaveLength(2);
    expect(await runsOf(rig(), row.id)).toHaveLength(1);
  });

  it('answers with the failure when an action fails', async () => {
    const row = await createAutomation(rig(), 'Fails', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    rig().fake.adapter.failure = new Error('lamp unreachable');
    try {
      const run = await startAndFinish(rig(), row.id);
      expect(run.status).toBe('failed');
      expect(run.error).toContain('lamp unreachable');
    } finally {
      rig().fake.adapter.failure = null;
    }
  });

  it('starts a run and answers at once without waiting for its steps', async () => {
    const row = await createAutomation(rig(), 'Starts', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const run = await startRun(rig(), row.id);
    expect(['queued', 'running']).toContain(run.status);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'running');
    expect(rig().sent()).toStrictEqual([]);
  });

  it('refuses to run an automation that does not exist', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.runAutomation, {
      params: { automationId: '0d000000-0000-4000-8000-000000000001' },
    });
    expect(refusal.status).toBe(404);
  });
});

describe('C26 run history', () => {
  it('records each step with its status and the commands it sent', async () => {
    const row = await createAutomation(rig(), 'History', {
      actions: [setPower(rig().ids.lamp, true), setBrightness(rig().ids.lampTwo, 12)],
    });
    const run = await startAndFinish(rig(), row.id);
    const saved = AUTOMATION_V2.parse(row.definition).steps;
    const commands = await rig().request(API_ENDPOINTS.listCommands, { query: { limit: '2' } });
    expect(run.trace.map((step) => [step.nodeId, step.status, step.error])).toStrictEqual(
      saved.map((step) => [step.id, 'succeeded', null]),
    );
    const linked = run.trace.flatMap((step) => step.commandIds);
    expect([...linked].sort()).toStrictEqual(commands.map((command) => command.id).sort());
  });

  it('records the saved revision, the owner and the start and finish times', async () => {
    const row = await createAutomation(rig(), 'Facts', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const run = await startAndFinish(rig(), row.id);
    expect(run).toMatchObject({
      automation_id: row.id,
      revision: row.revision,
      owner_profile_id: rig().profileId,
      status: 'succeeded',
      error: null,
      current_node: null,
    });
    expect(run.started_at).not.toBeNull();
    expect(run.finished_at).not.toBeNull();
  });

  it('records the failing step and its error on the run', async () => {
    const row = await createAutomation(rig(), 'Breaks', {
      actions: [setPower(rig().ids.lamp, true), setPower(rig().ids.lampTwo, true)],
    });
    rig().fake.adapter.failure = new Error('lamp unreachable');
    try {
      const run = await startAndFinish(rig(), row.id);
      expect(run.status).toBe('failed');
      expect(run.trace.map((step) => step.status)).toStrictEqual(['failed']);
      expect(run.trace[0]?.error).toContain('lamp unreachable');
      expect(run.error).toContain('lamp unreachable');
    } finally {
      rig().fake.adapter.failure = null;
    }
  });

  it('shows the step in progress and the live status while a run waits', async () => {
    const row = await createAutomation(rig(), 'Live', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'running');
    const live = await rig().request(API_ENDPOINTS.readAutomationRun, {
      params: { runId: run.id },
    });
    expect(live.current_node).toBe(AUTOMATION_V2.parse(row.definition).steps[0]?.id);
    expect(live.trace).toStrictEqual([]);
  });

  it('keeps the bookkeeping of the automation: run count, last run and last error', async () => {
    const row = await createAutomation(rig(), 'Counts', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    await startAndFinish(rig(), row.id);
    rig().fake.adapter.failure = new Error('lamp unreachable');
    try {
      await startAndFinish(rig(), row.id);
    } finally {
      rig().fake.adapter.failure = null;
    }
    const [after] = await rig().request(API_ENDPOINTS.listAutomations);
    expect(after).toMatchObject({ run_count: 2 });
    expect(after?.last_error).toContain('lamp unreachable');
    expect(after?.last_run_at).not.toBeNull();
  });

  it('stops a run on request and stays idempotent for a finished run', async () => {
    const row = await createAutomation(rig(), 'Stop', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'running');
    const stopping = await rig().request(API_ENDPOINTS.stopAutomationRun, {
      params: { runId: run.id },
    });
    expect(['cancelling', 'cancelled']).toContain(stopping.status);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'cancelled');
    const again = await rig().request(API_ENDPOINTS.stopAutomationRun, {
      params: { runId: run.id },
    });
    expect(again.status).toBe('cancelled');
  });

  it('records a run for every trigger firing, not only manual ones', async () => {
    const row = await createAutomation(rig(), 'Triggered', {
      triggers: [{ type: 'event', deviceId: null, kind: 'doorbell' }],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().event('lamp-1', 'doorbell');
    await rig().until(async () => (await runsOf(rig(), row.id)).length === 1);
    expect((await runsOf(rig(), row.id))[0]?.status).toBe('succeeded');
  });
});
