import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower } from '../../automations/support/programs';
import { startRun, statusOf } from '../../automations/support/runs';
import { useRig } from '../../automations/support/use-rig';
import { legacyAutomation } from '../../support/legacy-automation';

const rig = useRig();

const WAKES_AT = '2026-10-08T10:01:00.000Z';

async function waitingRun(
  actions: Parameters<typeof createAutomation>[2]['actions'],
): Promise<{ readonly automationId: string; readonly runId: string }> {
  const row = await createAutomation(rig(), 'Bedtime', { actions });
  const run = await startRun(rig(), row.id);
  await rig().until(() => rig().clock.pending().includes(WAKES_AT));
  return { automationId: row.id, runId: run.id };
}

describe('a run keeps the definition it started with', () => {
  it('finishes the original steps and scene after the automation and the scene are edited', async () => {
    const scene = await rig().request(API_ENDPOINTS.createScene, {
      body: { name: 'Evening', actions: [setPower(rig().ids.lamp, true)] },
    });
    const { automationId, runId } = await waitingRun([
      { type: 'delay', seconds: 60 },
      { type: 'scene', sceneId: scene.id },
      setPower(rig().ids.fan, true),
    ]);
    await rig().request(API_ENDPOINTS.updateScene, {
      params: { sceneId: scene.id },
      body: { actions: [setPower(rig().ids.lampTwo, true)] },
    });
    await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId },
      body: {
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 10_080 }],
          conditions: { mode: 'all', items: [] },
          actions: [setPower(rig().ids.lampTwo, false)],
        }),
      },
    });
    await rig().settle();
    expect(await statusOf(rig(), runId)).toBe('running');
    rig().clock.advanceTo(WAKES_AT);
    await rig().until(async () => (await statusOf(rig(), runId)) === 'succeeded');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['fan-1', 'power', true],
    ]);
  });

  it('is still stopped when its automation is disabled', async () => {
    const { automationId, runId } = await waitingRun([
      { type: 'delay', seconds: 60 },
      setPower(rig().ids.lamp, true),
    ]);
    await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId },
      body: { enabled: false },
    });
    await rig().until(async () => (await statusOf(rig(), runId)) === 'cancelled');
    rig().clock.advanceTo(WAKES_AT);
    await rig().settle();
    expect(rig().sent()).toStrictEqual([]);
  });
});

describe('a manual run does not depend on the phone staying on one profile', () => {
  it('finishes after the starting app switches to another person', async () => {
    const other = await rig().request(API_ENDPOINTS.createProfile, { body: { name: 'Guest' } });
    const { runId } = await waitingRun([
      { type: 'delay', seconds: 60 },
      setPower(rig().ids.lamp, true),
    ]);
    await rig().request(API_ENDPOINTS.selectProfile, { body: { profileId: other.id } });
    try {
      await rig().settle();
      expect(await statusOf(rig(), runId)).toBe('running');
      rig().clock.advanceTo(WAKES_AT);
      await rig().until(async () => (await statusOf(rig(), runId)) === 'succeeded');
    } finally {
      await rig().request(API_ENDPOINTS.selectProfile, { body: { profileId: rig().profileId } });
      await rig().request(API_ENDPOINTS.deleteProfile, { params: { profileId: other.id } });
    }
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });
});
