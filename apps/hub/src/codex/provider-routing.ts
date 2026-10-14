import { z } from 'zod';
import type { CodexJob } from './job';
import { TURN, type RpcRecord } from './protocol';

export function codexNotificationJob(
  jobs: readonly CodexJob[],
  method: string,
  params: RpcRecord,
): CodexJob | undefined {
  const threadId = z.string().optional().parse(params['threadId']);
  const relevant = jobs.filter(
    (job) => threadId === job.threadId || (threadId !== undefined && job.agents.owns(threadId)),
  );
  const turnId = ['turn/started', 'turn/completed'].includes(method)
    ? TURN.parse(params['turn']).id
    : z.string().nullable().optional().parse(params['turnId']);
  return (
    relevant.findLast((job) => turnId !== undefined && job.turnId === turnId) ??
    relevant.findLast((job) => job.active) ??
    relevant.at(-1)
  );
}
