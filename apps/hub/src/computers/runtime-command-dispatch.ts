import {
  ApiError,
  COMPUTER_RUNTIME_REQUEST,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type ComputerRuntimeReply,
  type ComputerRuntimeTarget,
} from '@smarteverything/domain';
import type { AttachedRuntime } from './runtime-directory-types';
import type { CommandDirectory } from './runtime-command-admission';
import { canonicalRuntimeInput } from './runtime-receipts';
interface Dispatch {
  readonly ports: CommandDirectory;
  readonly input: AiNativeCommandWrite;
  readonly target: ComputerRuntimeTarget;
  readonly source: AttachedRuntime;
  readonly authorize: () => void;
}
export async function dispatchPreparedCommand(dispatch: Dispatch): Promise<AiNativeCommandReceipt> {
  const { ports, input, target, source, authorize } = dispatch;
  let reason: string | null = null;
  try {
    authorize();
  } catch (cause) {
    reason = cause instanceof Error ? cause.message : 'The initiating authority was revoked.';
  }
  if (reason !== null && reason.length > 2000)
    throw new ApiError(
      'forbidden',
      `Native dispatch refused because its complete denial exceeds the 2000-character transport limit: ${reason}`,
    );
  const request = COMPUTER_RUNTIME_REQUEST.parse({
    runtime: target.runtime,
    request: {
      operation: 'provider_command_dispatch',
      scope: input.scope,
      operation_id: input.operation_id,
      permit: reason === null,
      reason,
    },
  });
  if (
    ports.available(target, request) !== source ||
    source.connectionGeneration !== input.scope.connection_generation
  )
    throw new ApiError('conflict', 'The prepared command attachment changed before dispatch.');
  return commandReply(
    await ports.send(target, source, request),
    input,
    'provider_command_dispatch',
  );
}
export function commandReply(
  reply: ComputerRuntimeReply,
  input: AiNativeCommandWrite,
  operation: 'provider_command' | 'provider_command_dispatch',
): AiNativeCommandReceipt {
  if (
    (reply.reply.operation !== 'provider_command' &&
      reply.reply.operation !== 'provider_command_dispatch') ||
    reply.reply.operation !== operation ||
    reply.reply.value.operation_id !== input.operation_id ||
    reply.reply.value.command_job_id !== input.command_job_id ||
    reply.reply.value.definition_id !== input.definition_id ||
    canonicalRuntimeInput(reply.reply.value.scope) !== canonicalRuntimeInput(input.scope)
  )
    throw new ApiError(
      'upstream_failed',
      'The native command returned a different receipt identity.',
    );
  return reply.reply.value;
}
