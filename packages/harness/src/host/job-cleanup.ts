import type { Context } from '@deepseek-ai/cordis';
import { JobId } from '@deepseek-ai/dsh-jobs';
import type { JobView } from '@deepseek-ai/dsh-jobs';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { HarnessRuntimeError } from './errors';

export const JOB_CLEANUP_WINDOW_MS = 30_000;
interface JobsPort {
  readonly jobs: Pick<Context['jobs'], 'list' | 'kill' | 'wait'>;
}
type Owner = Pick<Agent, 'id'>;
export type HarnessCleanup =
  | { readonly state: 'idle' | 'running' | 'completed' }
  | { readonly state: 'unknown'; readonly jobs: readonly string[]; readonly reason: string };

export function ownedRunningJobs(ctx: JobsPort, agent: Owner): readonly JobView[] {
  return ctx.jobs.list(agent.id).filter((job) => job.owner === agent.id && live(job));
}

function live(job: JobView): boolean {
  return job.status === 'running' || job.status === 'stopping';
}

async function settleWhileActive(ctx: JobsPort, agent: Owner, job: JobView): Promise<JobView> {
  let view = job;
  let written = -1;
  while (live(view) && view.output.total !== written) {
    written = view.output.total;
    view = await ctx.jobs.wait(JobId(job.id), JOB_CLEANUP_WINDOW_MS, agent.id);
  }
  return view;
}

export async function cancelOwnedJobs(ctx: JobsPort, agent: Owner, reason: string): Promise<void> {
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
  const results = await Promise.allSettled(jobs.map((job) => settleWhileActive(ctx, agent, job)));
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
    if (result.status === 'rejected' || live(result.value)) incomplete.push(job.id);
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
