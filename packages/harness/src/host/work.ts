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
  const live = {
    turn: agent.status === 'running',
    interactions: interactions.count(agent.id),
    shells: ownedRunningJobs(ctx, agent).map((job) => job.id),
  };
  return {
    ...live,
    cleanup: liveCleanup(cleanup, live),
    queuedMessages: agent.inbox.nextTurn.length + agent.inbox.nextStep.length,
  };
}

export function liveCleanup(
  cleanup: HarnessCleanup,
  live: Pick<HarnessWork, 'turn' | 'interactions' | 'shells'>,
): HarnessCleanup {
  const idle = !live.turn && live.interactions === 0 && live.shells.length === 0;
  return cleanup.state === 'unknown' && idle ? { state: 'completed' } : cleanup;
}

export function assertDrained(work: HarnessWork): void {
  if (!workDrained(work))
    throw new HarnessRuntimeError(
      'operation_failed',
      'Session still has active turns, interactions, shells or queued messages.',
    );
}

export function workDrained(work: HarnessWork): boolean {
  return !(
    work.cleanup.state === 'running' ||
    work.turn ||
    work.interactions > 0 ||
    work.shells.length > 0 ||
    work.queuedMessages > 0
  );
}
