import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower, type Steps } from './support/programs';
import { startAndFinish, startRun, statusOf } from './support/runs';
import { useRig } from './support/use-rig';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig();

async function runSteps(actions: Steps): Promise<Awaited<ReturnType<typeof startAndFinish>>> {
  const row = await createAutomation(rig(), 'Other', { actions });
  return startAndFinish(rig(), row.id);
}

describe('C14 run a scene', () => {
  it('sends every command of the scene with the scene as their source', async () => {
    const scene = await rig().request(API_ENDPOINTS.createScene, {
      body: {
        name: 'Evening',
        actions: [setPower(rig().ids.lamp, true), setPower(rig().ids.lampTwo, false)],
      },
    });
    const run = await runSteps([{ type: 'scene', sceneId: scene.id }]);
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['lamp-2', 'power', false],
    ]);
    const sources = (
      await rig().request(API_ENDPOINTS.listCommands, { query: { limit: '2' } })
    ).map((command) => command.source);
    expect(sources).toStrictEqual(['scene', 'scene']);
  });
});

describe('C15 wait', () => {
  it('holds the run for the given seconds before the next step', async () => {
    const row = await createAutomation(rig(), 'Wait', {
      actions: [{ type: 'delay', seconds: 60 }, setPower(rig().ids.lamp, true)],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(() => rig().clock.pending().includes('2026-10-08T10:01:00.000Z'));
    expect(await statusOf(rig(), run.id)).toBe('running');
    expect(rig().sent()).toStrictEqual([]);
    rig().clock.advanceTo('2026-10-08T10:01:00.000Z');
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });

  it('is cancellable: stopping the run ends the wait and skips the later steps', async () => {
    const row = await createAutomation(rig(), 'Cancel wait', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'running');
    await rig().request(API_ENDPOINTS.stopAutomationRun, { params: { runId: run.id } });
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'cancelled');
    rig().clock.advanceTo('2026-10-08T11:00:00.000Z');
    await rig().settle();
    expect(rig().sent()).toStrictEqual([]);
  });
});

describe('C16 notify', () => {
  it('records the message as an automation event in the Activity feed', async () => {
    const run = await runSteps([{ type: 'notify', message: 'Door left open' }]);
    expect(run.status).toBe('succeeded');
    const events = await rig().request(API_ENDPOINTS.listEvents, {
      query: { kinds: 'automation_run', limit: '10' },
    });
    expect(events.map((event) => event.details['message'])).toContain('Door left open');
  });
});

describe('C17 wake the AI', () => {
  it('records a wake for the person with the instruction and queues the AI turn', async () => {
    const row = await createAutomation(rig(), 'Wake', {
      actions: [
        {
          type: 'wake_ai',
          profileId: rig().profileId,
          chatId: null,
          instruction: 'Check the door',
        },
      ],
    });
    const run = await startRun(rig(), row.id);
    await rig().until(() => rig().clock.pending().includes('2026-10-08T10:00:01.000Z'));
    rig().clock.advanceTo('2026-10-08T10:00:01.000Z');
    await rig().until(async () => (await statusOf(rig(), run.id)) !== 'running');
    const [wake] = await rig().request(API_ENDPOINTS.listWakes, { query: { limit: '5' } });
    expect(wake).toMatchObject({
      automation_id: row.id,
      automation_name: 'Wake',
      profile_id: rig().profileId,
      instruction: 'Check the door',
      state: 'woke',
    });
    expect(await statusOf(rig(), run.id)).toBe('succeeded');
  });
});

describe('C18 call a tool as a person without an AI turn', () => {
  it('runs the hub tool with its arguments and the effect reaches the device', async () => {
    const run = await runSteps([
      {
        type: 'tool',
        profileId: rig().profileId,
        tool: 'control_devices',
        args: {
          changes: [{ target: { deviceIds: [rig().ids.lamp] }, capability: 'power', value: true }],
        },
      },
    ]);
    expect(run.status).toBe('succeeded');
    await rig().until(() => rig().commands().length === 1);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });

  it('refuses to save a tool step for a tool that does not exist', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Unknown tool',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [{ type: 'tool', profileId: rig().profileId, tool: 'no_such_tool', args: {} }],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('no_such_tool');
  });
});
