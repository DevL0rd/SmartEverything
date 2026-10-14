import type { CodexProviderTurn, CodexProviderOptions } from '@smarteverything/domain';
import type { CodexJob } from './job';
import type { CodexSessions } from './sessions';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import { executionOptions } from './options';
import { requireSubscription } from './account';
import { readRateLimits, requireSubscriptionBilling } from './rate-limits';
import { THREAD_REPLY } from './protocol';
import { CodexRuntimeError } from './errors';
export async function checkCommandNative(
  job: CodexJob,
  turn: CodexProviderTurn,
  configured: CodexProviderOptions,
  sessions: CodexSessions,
): Promise<void> {
  const location = await executionOptions({ ...configured, ...turn.options }, job.cwd);
  if (
    location.cwd !== job.cwd ||
    canonicalRuntimeInput(location.roots) !== canonicalRuntimeInput(job.roots)
  )
    throw new CodexRuntimeError(
      'provider_command',
      'The configured native execution folder or roots changed.',
    );
  await sessions.checkTurn({ ...turn, session_id: job.threadId }, job.cwd, job.roots);
  await requireSubscription(job.client, job.cwd);
  const rates = await readRateLimits(job.client);
  requireSubscriptionBilling(rates);
  const thread = THREAD_REPLY.parse(
    await job.client.request('thread/read', { threadId: job.threadId, includeTurns: false }),
  ).thread;
  if (
    thread.id !== job.threadId ||
    thread.cwd !== job.cwd ||
    thread.modelProvider !== 'openai' ||
    thread.status.type !== 'idle' ||
    thread.canAcceptDirectInput !== true
  )
    throw new CodexRuntimeError(
      'provider_command',
      'The exact native thread is not idle and eligible for direct input.',
    );
}
export function requireCommandIdle(job: CodexJob): void {
  if (
    job.active ||
    job.prompts.list().some((prompt) => prompt.status === 'pending') ||
    job.agents
      .list()
      .some((run) => !['completed', 'stopped', 'interrupted', 'failed'].includes(run.state))
  )
    throw new CodexRuntimeError(
      'provider_command',
      'Wait for active native work, questions, children and controls.',
    );
}
