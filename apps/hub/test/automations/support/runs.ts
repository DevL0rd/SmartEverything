import { API_ENDPOINTS, type AutomationRunRow } from '@smarteverything/domain';
import type { Rig } from './rig';

const ACTIVE = new Set(['queued', 'running', 'cancelling']);

export async function runsOf(rig: Rig, automationId: string): Promise<AutomationRunRow[]> {
  return rig.request(API_ENDPOINTS.listAutomationRuns, { query: { automationId } });
}

export async function finishedRuns(
  rig: Rig,
  automationId: string,
  count = 1,
): Promise<AutomationRunRow[]> {
  await rig.until(async () => {
    const runs = await runsOf(rig, automationId);
    return runs.length >= count && runs.every((run) => !ACTIVE.has(run.status));
  });
  return runsOf(rig, automationId);
}

export async function startRun(rig: Rig, automationId: string): Promise<AutomationRunRow> {
  return rig.request(API_ENDPOINTS.runAutomation, { params: { automationId } });
}

export async function startAndFinish(rig: Rig, automationId: string): Promise<AutomationRunRow> {
  return rig.request(API_ENDPOINTS.runAutomation, {
    params: { automationId },
    body: { wait: true },
  });
}

export async function statusOf(rig: Rig, runId: string): Promise<AutomationRunRow['status']> {
  const run = await rig.request(API_ENDPOINTS.readAutomationRun, { params: { runId } });
  return run.status;
}
