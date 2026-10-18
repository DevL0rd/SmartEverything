import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { START, openRig, type Rig } from './rig';

const BOOT_TIMEOUT_MS = 60_000;

async function removeAutomations(rig: Rig): Promise<void> {
  for (let pass = 0; pass < 10; pass += 1) {
    const rows = await rig.request(API_ENDPOINTS.listAutomations);
    if (rows.length === 0) return;
    for (const row of rows)
      await rig.refused(API_ENDPOINTS.removeAutomation, { params: { automationId: row.id } });
  }
  throw new Error('The automations could not be removed.');
}

async function clearHome(rig: Rig): Promise<void> {
  for (const run of await rig.request(API_ENDPOINTS.listAutomationRuns)) {
    if (['queued', 'running', 'cancelling'].includes(run.status)) {
      await rig.request(API_ENDPOINTS.stopAutomationRun, { params: { runId: run.id } });
    }
  }
  for (const schedule of await rig.request(API_ENDPOINTS.listSchedules)) {
    if (['scheduled', 'running', 'waiting'].includes(schedule.state)) {
      await rig.request(API_ENDPOINTS.cancelSchedule, { params: { scheduleId: schedule.id } });
    }
    await rig.request(API_ENDPOINTS.removeSchedule, { params: { scheduleId: schedule.id } });
  }
  await removeAutomations(rig);
  for (const row of await rig.request(API_ENDPOINTS.listAutomationValues)) {
    await rig.request(API_ENDPOINTS.removeAutomationValue, { params: { valueId: row.id } });
  }
  for (const row of await rig.request(API_ENDPOINTS.listScenes)) {
    await rig.request(API_ENDPOINTS.removeScene, { params: { sceneId: row.id } });
  }
  for (const row of await rig.request(API_ENDPOINTS.listDeviceGroups)) {
    await rig.request(API_ENDPOINTS.removeDeviceGroup, { params: { groupId: row.id } });
  }
}

export function useRig(options: { readonly fresh?: boolean } = {}): () => Rig {
  let rig: Rig | undefined;
  const open = async (): Promise<void> => {
    rig = await openRig();
  };
  const close = async (): Promise<void> => {
    await rig?.close();
    rig = undefined;
  };
  if (options.fresh === true) {
    beforeEach(open, BOOT_TIMEOUT_MS);
    afterEach(close, BOOT_TIMEOUT_MS);
  } else {
    beforeAll(open, BOOT_TIMEOUT_MS);
    afterEach(async () => {
      if (rig === undefined) return;
      await clearHome(rig);
      rig.clock.jumpTo(START);
      rig.fake.adapter.executed.splice(0);
      await rig.settle();
    });
    afterAll(close, BOOT_TIMEOUT_MS);
  }
  return () => {
    if (rig === undefined) throw new Error('The rig did not open.');
    return rig;
  };
}
