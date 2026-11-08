import { setTimeout as sleep } from 'node:timers/promises';
import type { Agent, AgentCancelCause } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { HarnessRuntimeError } from './errors';
import { cancelOwnedJobs, JOB_CLEANUP_WINDOW_MS } from './job-cleanup';
import type { HarnessWork } from './work';

export async function stopObservedWork(
  ctx: Context,
  agent: Agent,
  cause: AgentCancelCause,
  observedWork: () => HarnessWork | undefined,
): Promise<void> {
  const reason =
    cause.kind === 'disposed' ? 'Native helper lost ownership.' : 'User stopped the helper.';
  const deadline = new AbortController();
  agent.cancel(cause);
  const descendants =
    cause.kind === 'disposed' ? ctx.get('subagents')?.drainDescendants([agent]) : undefined;
  try {
    await Promise.race([
      Promise.all([agent.whenIdle(), cancelOwnedJobs(ctx, agent, reason), descendants]),
      sleep(JOB_CLEANUP_WINDOW_MS, undefined, { signal: deadline.signal }).then(() => {
        throw new HarnessRuntimeError(
          'source_outcome_unknown',
          'Native helper did not finish before the cleanup deadline.',
          agent.id,
        );
      }),
    ]);
    const work = observedWork();
    if (work !== undefined && (work.turn || work.interactions > 0 || work.shells.length > 0))
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Native helper work or background cleanup could not be proved complete.',
        agent.id,
      );
  } finally {
    deadline.abort();
  }
}
