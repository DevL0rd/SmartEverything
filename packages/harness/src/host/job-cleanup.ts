import type { Context } from '@deepseek-ai/cordis';
import { JobId } from '@deepseek-ai/dsh-jobs';
import type { JobView } from '@deepseek-ai/dsh-jobs';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { HarnessRuntimeError } from './errors';

export const JOB_CLEANUP_TIMEOUT_MS = 30_000;
export type HarnessCleanup =
  | { readonly state: 'idle' | 'running' | 'completed' }
  | { readonly state: 'unknown'; readonly jobs: readonly string[]; readonly reason: string };

export function ownedRunningJobs(ctx: Context, agent: Agent): readonly JobView[] {
  return ctx.jobs
    .list(agent.id)
    .filter(
      (job) => job.owner === agent.id && (job.status === 'running' || job.status === 'stopping'),
    );
}

export async function cancelOwnedJobs(ctx: Context, agent: Agent, reason: string): Promise<void> {
  const jobs = ownedRunningJobs(ctx, agent);
  const cancellations = jobs
    .map((job): unknown => {
      try {
        ctx.jobs.kill(job.id, agent.id, reason);
        return undefined;
      } catch (error) {
        return error;
      }
    })
    .filter((error) => error !== undefined);
  const results = await Promise.allSettled(
    jobs.map((job) => ctx.jobs.wait(JobId(job.id), JOB_CLEANUP_TIMEOUT_MS, agent.id)),
  );
  const incomplete: string[] = [];
  const failures: unknown[] = [...cancellations];
  for (const [index, result] of results.entries()) {
    const job = jobs[index];
    if (job === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Job cleanup result has no matching owned job.',
        agent.id,
      );
    if (result.status === 'rejected') failures.push(result.reason);
    if (
      result.status === 'rejected' ||
      result.value.status === 'running' ||
      result.value.status === 'stopping'
    )
      incomplete.push(job.id);
  }
  const remaining = ownedRunningJobs(ctx, agent).map((job) => job.id);
  if (cancellations.length > 0 || incomplete.length > 0 || remaining.length > 0)
    throw new HarnessRuntimeError(
      'source_outcome_unknown',
      `Owned job cleanup is incomplete: ${[...new Set([...incomplete, ...remaining])].join(', ')}.`,
      agent.id,
      {
        cause: new AggregateError(failures, 'Owned job cancellation or settlement failed.'),
      },
    );
}
