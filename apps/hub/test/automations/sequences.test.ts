import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { boundCommand } from './support/values';
import { createAutomation, setBrightness, setPower } from './support/programs';
import { startAndFinish, startRun, statusOf, runsOf } from './support/runs';
import { callSequence, createSequence, sequenceDefinition } from './support/sequences';
import { useRig } from './support/use-rig';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig();

const levelParameter = { binding: { source: 'parameter', kind: 'number', name: 'level' } } as const;

describe('C22 reusable named step lists with typed inputs', () => {
  it('runs the called steps to the end before the calling automation continues', async () => {
    const sequence = await createSequence(rig(), 'Wind down', {
      actions: [setPower(rig().ids.lamp, false), setPower(rig().ids.lampTwo, false)],
    });
    const row = await createAutomation(rig(), 'Night', {
      actions: [
        setBrightness(rig().ids.lamp, 5),
        callSequence(sequence.id),
        setBrightness(rig().ids.lampTwo, 7),
      ],
    });
    const run = await startAndFinish(rig(), row.id);
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 5],
      ['lamp-1', 'power', false],
      ['lamp-2', 'power', false],
      ['lamp-2', 'brightness', 7],
    ]);
  });

  it('passes typed inputs that the called steps read as parameters', async () => {
    const sequence = await createSequence(rig(), 'Dim to', {
      parameters: [{ name: 'level', kind: 'number' }],
      actions: [boundCommand(rig().ids.lamp, 'brightness', levelParameter)],
    });
    const row = await createAutomation(rig(), 'Dimmer', {
      actions: [
        callSequence(sequence.id, {
          level: { binding: { source: 'literal', kind: 'number', value: 33 } },
        }),
      ],
    });
    await startAndFinish(rig(), row.id);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 33]]);
  });

  it('starts a sequence directly with its inputs and records a sequence run', async () => {
    const sequence = await createSequence(rig(), 'Dim to', {
      parameters: [{ name: 'level', kind: 'number' }],
      actions: [boundCommand(rig().ids.lamp, 'brightness', levelParameter)],
    });
    const started = await rig().request(API_ENDPOINTS.runAutomation, {
      params: { automationId: sequence.id },
      body: { inputs: { level: 61 } },
    });
    expect(started.automation_id).toBe(sequence.id);
    await rig().until(() => rig().commands().length === 1);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 61]]);
  });

  it('refuses to save a call whose inputs do not match the declared parameters', async () => {
    const sequence = await createSequence(rig(), 'Dim to', {
      parameters: [{ name: 'level', kind: 'number' }],
      actions: [boundCommand(rig().ids.lamp, 'brightness', levelParameter)],
    });
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Wrong call',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [callSequence(sequence.id, {})],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('The inputs do not match');
  });

  it('refuses a sequence that would call itself through another sequence', async () => {
    const first = await createSequence(rig(), 'First', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const second = await createSequence(rig(), 'Second', { actions: [callSequence(first.id)] });
    const refusal = await rig().refused(API_ENDPOINTS.updateAutomation, {
      params: { automationId: first.id },
      body: {
        definition: sequenceDefinition({ actions: [callSequence(second.id)] }),
        expectedRevision: first.revision,
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('circle');
  });

  it('fails the calling run when a called step fails', async () => {
    const sequence = await createSequence(rig(), 'Fails', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const row = await createAutomation(rig(), 'Caller', {
      actions: [callSequence(sequence.id), setPower(rig().ids.lampTwo, true)],
    });
    rig().fake.adapter.failure = new Error('lamp unreachable');
    try {
      const run = await startAndFinish(rig(), row.id);
      expect(run.status).toBe('failed');
    } finally {
      rig().fake.adapter.failure = null;
    }
    expect(
      rig()
        .sent()
        .filter(([external]) => external === 'lamp-2'),
    ).toStrictEqual([]);
  });

  it('cancels the called sequence when the calling run is stopped', async () => {
    const sequence = await createSequence(rig(), 'Slow', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const row = await createAutomation(rig(), 'Caller', { actions: [callSequence(sequence.id)] });
    const parent = await startRun(rig(), row.id);
    await rig().until(async () =>
      (await runsOf(rig(), sequence.id)).some((run) => run.status === 'running'),
    );
    await rig().request(API_ENDPOINTS.stopAutomationRun, { params: { runId: parent.id } });
    await rig().until(async () => (await statusOf(rig(), parent.id)) === 'cancelled');
    const [child] = await runsOf(rig(), sequence.id);
    await rig().until(async () => (await statusOf(rig(), child?.id ?? '')) === 'cancelled');
    expect(child).toMatchObject({ automation_id: sequence.id, parent_run_id: parent.id });
    expect(rig().sent()).toStrictEqual([]);
  });
});
