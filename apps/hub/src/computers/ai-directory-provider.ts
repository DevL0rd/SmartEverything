import {
  ApiError,
  PROVIDER_TURN_MAX_BYTES,
  type ProviderTurn,
  type ProviderEvent,
  type CodexCommandConfiguration,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import type { ComputerRuntimeDirectory } from './runtime-directory';
import type { ClaudeJob } from './ai-directory-types';
export async function startClaudeTurn(
  jobs: Map<string, ClaudeJob>,
  runtimes: ComputerRuntimeDirectory,
  turn: ProviderTurn,
): Promise<{ readonly job_id: string; readonly session_id: string | null }> {
  if (Buffer.byteLength(JSON.stringify(turn), 'utf8') > PROVIDER_TURN_MAX_BYTES)
    throw new ApiError(
      'invalid_request',
      'The provider turn exceeds the 32 MiB transport limit; reduce its attachments or history.',
    );
  if (jobs.has(turn.job_id))
    throw new ApiError('conflict', 'This provider job has already been submitted.');
  jobs.set(turn.job_id, {
    deviceId: turn.device_id,
    chatId: turn.chat_id,
    seq: 0,
    sessionId: turn.session_id,
  });
  const reply = await runtimes.startTurn({ runtime: 'claude', turn });
  if (reply.reply.operation !== 'provider_start' || reply.reply.value.job_id !== turn.job_id)
    throw new ApiError('upstream_failed', 'The computer returned a different provider job.');
  return reply.reply.value;
}
export async function startClaudeCommand(
  jobs: Map<string, ClaudeJob>,
  runtimes: ComputerRuntimeDirectory,
  operation: {
    readonly input: AiNativeCommandWrite;
    readonly authorize: () => void;
    readonly configuration?: CodexCommandConfiguration;
  },
): Promise<AiNativeCommandReceipt> {
  const { input, authorize } = operation;
  runtimes.assertCommandAvailable(input);
  if (input.scope.runtime === 'claude') {
    if (jobs.has(input.command_job_id))
      throw new ApiError('conflict', 'This provider job was already submitted.');
    jobs.set(input.command_job_id, {
      deviceId: input.scope.device_id,
      chatId: input.scope.chat_id,
      seq: 0,
      sessionId: input.scope.session_id,
    });
  }
  const receipt = await runtimes.startCommand(input, authorize, operation.configuration);
  if (receipt.status === 'rejected') jobs.delete(input.command_job_id);
  return receipt;
}
export function claudeProviderEvent(
  jobs: Map<string, ClaudeJob>,
  deviceId: string,
  event: ProviderEvent,
): boolean {
  const job = jobs.get(event.job_id);
  if (job?.deviceId !== deviceId || job.chatId !== event.chat_id || event.seq <= job.seq)
    return false;
  job.seq = event.seq;
  if (event.kind === 'accepted') {
    job.sessionId = event.session_id;
    retirePrevious(jobs, deviceId, event);
  }
  if (event.kind === 'failed') jobs.delete(event.job_id);
  return true;
}
function retirePrevious(
  jobs: Map<string, ClaudeJob>,
  deviceId: string,
  event: Extract<ProviderEvent, { kind: 'accepted' }>,
): void {
  for (const [jobId, previous] of jobs)
    if (
      jobId !== event.job_id &&
      previous.deviceId === deviceId &&
      previous.chatId === event.chat_id &&
      previous.sessionId === event.session_id
    )
      jobs.delete(jobId);
}
