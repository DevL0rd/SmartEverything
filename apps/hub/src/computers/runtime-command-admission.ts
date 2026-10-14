import {
  ApiError,
  COMPUTER_RUNTIME_REQUEST,
  type ComputerRuntimeTarget,
  type ComputerRuntimeRequest,
  type ComputerRuntimeReply,
  type CodexCommandConfiguration,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import type { AttachedRuntime, RuntimeJob } from './runtime-directory-types';
import { dispatchPreparedCommand, commandReply } from './runtime-command-dispatch';
export type NativeCommandStart = readonly [
  input: AiNativeCommandWrite,
  authorize: () => void,
  configuration?: CodexCommandConfiguration,
];
export type NativeCommandAdmission = Promise<AiNativeCommandReceipt>;
export interface CommandDirectory {
  readonly jobs: Map<string, RuntimeJob>;
  readonly available: (
    target: ComputerRuntimeTarget,
    request: ComputerRuntimeRequest,
  ) => AttachedRuntime;
  readonly send: (
    target: ComputerRuntimeTarget,
    source: AttachedRuntime,
    request: ComputerRuntimeRequest,
  ) => Promise<ComputerRuntimeReply>;
}
export async function startRuntimeCommand(
  ports: CommandDirectory,
  input: AiNativeCommandWrite,
  authorize: () => void,
  configuration?: CodexCommandConfiguration,
): Promise<AiNativeCommandReceipt> {
  const { target, source, request, key } = commandAdmission(ports, input, configuration);
  ports.jobs.set(key, {
    target,
    chatId: input.scope.chat_id,
    profileId: input.scope.profile_id,
    source,
    seq: 0,
    processGeneration: input.scope.process_generation,
  });
  const reply = await ports.send(target, source, request);
  const prepared = commandReply(reply, input, 'provider_command');
  const receipt =
    (target.runtime === 'claude' || configuration !== undefined) && prepared.status === 'pending'
      ? await dispatchPreparedCommand({ ports, input, target, source, authorize })
      : prepared;
  if (receipt.status === 'rejected') ports.jobs.delete(key);
  return receipt;
}

function assertCommandSource(
  previous: RuntimeJob | undefined,
  source: AttachedRuntime,
  input: AiNativeCommandWrite,
): void {
  if (
    source.connectionGeneration !== input.scope.connection_generation ||
    previous?.source !== source ||
    previous.chatId !== input.scope.chat_id ||
    previous.profileId !== input.scope.profile_id ||
    previous.processGeneration !== input.scope.process_generation
  )
    throw new ApiError(
      'conflict',
      'The native command belongs to a stale attachment or provider job.',
    );
}

export function assertRuntimeCommandAvailable(
  ports: CommandDirectory,
  input: AiNativeCommandWrite,
): void {
  commandAdmission(ports, input);
}
function commandAdmission(
  ports: CommandDirectory,
  input: AiNativeCommandWrite,
  configuration?: CodexCommandConfiguration,
): {
  readonly target: ComputerRuntimeTarget;
  readonly source: AttachedRuntime;
  readonly request: ComputerRuntimeRequest;
  readonly key: string;
} {
  const target = { device_id: input.scope.device_id, runtime: input.scope.runtime };
  const request = COMPUTER_RUNTIME_REQUEST.parse({
    runtime: target.runtime,
    request: {
      operation: 'provider_command',
      ...input,
      ...(configuration === undefined ? {} : { configuration }),
    },
  });
  const source = ports.available(target, request);
  const previous = ports.jobs.get(
    JSON.stringify([target.device_id, target.runtime, input.scope.job_id]),
  );
  assertCommandSource(previous, source, input);
  const key = JSON.stringify([target.device_id, target.runtime, input.command_job_id]);
  if (ports.jobs.has(key))
    throw new ApiError('conflict', 'This command job was already submitted.');
  return { target, source, request, key };
}
