import type { RunLedger } from './run-ledger';
import type { RunDriver } from './driver/admission';
import type { Finishes } from './engine-v3-children';

export async function retireRuns(
  runs: Pick<RunLedger, 'active'>,
  driver: Pick<RunDriver, 'isLive' | 'cancel'>,
  finishes: Pick<Finishes, 'wait'>,
  automationId: string,
): Promise<void> {
  const running = (await runs.active(automationId))
    .map((record) => record.id)
    .filter((runId) => driver.isLive(runId));
  const ended = running.map((runId) => finishes.wait(runId));
  for (const runId of running) driver.cancel(runId, 'removed');
  await Promise.all(ended);
}
