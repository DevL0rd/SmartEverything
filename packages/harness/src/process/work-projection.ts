import type { AiHarnessSession } from '@smarteverything/domain';
import type { HarnessWork } from '../host/work';
export function projectHarnessWork(id: string, work: HarnessWork): AiHarnessSession['work'] {
  const pending: AiHarnessSession['work'] = [];
  if (work.turn) pending.push({ kind: 'turn', id, reason: 'Native turn is running.' });
  if (work.interactions > 0)
    pending.push({
      kind: 'interaction',
      id,
      reason: 'Native questions or approvals remain pending.',
    });
  for (const shell of work.shells)
    pending.push({
      kind: 'shell',
      id: shell,
      reason: 'A native background process has not stopped.',
    });
  if (work.queuedMessages > 0)
    pending.push({ kind: 'delivery', id, reason: 'Native messages remain queued.' });
  if (work.cleanup.state === 'running' || work.cleanup.state === 'unknown')
    pending.push({
      kind: 'cleanup',
      id,
      reason:
        work.cleanup.state === 'unknown'
          ? work.cleanup.reason
          : 'Native cleanup has not completed.',
    });
  return pending;
}
