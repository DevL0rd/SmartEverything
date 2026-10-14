import { HarnessRuntimeError } from './errors';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { ownedRunningJobs } from './job-cleanup';
import type { HarnessCleanup } from './job-cleanup';
import type { HarnessInteractions } from './interactions';

export interface HarnessWork {
  readonly turn: boolean;
  readonly interactions: number;
  readonly shells: readonly string[];
  readonly queuedMessages: number;
  readonly cleanup: HarnessCleanup;
}

export function sessionWork(
  ctx: Context,
  agent: Agent,
  interactions: HarnessInteractions,
  cleanup: HarnessCleanup,
): HarnessWork {
  return {
    turn: agent.status === 'running',
    interactions: interactions.count(agent.id),
    shells: ownedRunningJobs(ctx, agent).map((job) => job.id),
    cleanup,
    queuedMessages: agent.inbox.nextTurn.length + agent.inbox.nextStep.length,
  };
}

export function assertDrained(work: HarnessWork): void {
  if (
    work.cleanup.state === 'running' ||
    work.cleanup.state === 'unknown' ||
    work.turn ||
    work.interactions > 0 ||
    work.shells.length > 0 ||
    work.queuedMessages > 0
  )
    throw new HarnessRuntimeError(
      'operation_failed',
      'Session still has active turns, interactions, shells or queued messages.',
    );
}
