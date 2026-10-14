import {
  ApiError,
  AI_NATIVE_COMMAND_PRIVATE_OPERATION,
  COMPUTER_RUNTIME_READ,
  type ComputerRuntimeRequest,
  type ComputerRuntimeRead,
  type ComputerRuntimeStatus,
  type ComputerRuntimeReply,
  type ComputerRuntimeTarget,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const RUNTIME_COMMAND_CAPABILITIES: ReadonlyMap<string, string> = new Map([
  ['provider_commands', 'provider_read'],
  ['provider_command_receipt', 'provider_read'],
  ['provider_command', 'provider_start'],
  ['provider_command_dispatch', 'provider_start'],
]);
export function assertNativeEffectsReconciled(
  store: Store,
  target: ComputerRuntimeTarget,
  request: ComputerRuntimeRequest,
): void {
  if (!('session_id' in request.request)) return;
  const sessionId = request.request.session_id;
  for (const receipt of store.nativeCommandOperations.unknownRuntime(target.runtime))
    if (receipt.scope.device_id === target.device_id && receipt.scope.session_id === sessionId)
      throw new ApiError(
        'conflict',
        'Native command effects for this session require verified reconciliation before mutation.',
      );
}
export function assertPublicRuntimeRequest(request: ComputerRuntimeRequest): void {
  if (AI_NATIVE_COMMAND_PRIVATE_OPERATION.safeParse(request.request.operation).success)
    throw new ApiError(
      'forbidden',
      'Native commands require their dedicated caller-bound durable admission route.',
    );
}
export function isRuntimeRead(request: ComputerRuntimeRequest): request is ComputerRuntimeRead {
  return COMPUTER_RUNTIME_READ.safeParse(request).success;
}
export function assertRuntimeAvailable(
  status: ComputerRuntimeStatus,
  request: ComputerRuntimeRequest,
): void {
  if (request.runtime !== status.runtime)
    throw new ApiError('invalid_request', 'Runtime request and target must agree.');
  if (!runtimeAccessEnabled(status, request.request.operation))
    throw new ApiError('forbidden', 'The selected runtime capability is disabled by the owner.');
  if (!status.online)
    throw new ApiError(
      'claude_not_ready',
      'The selected computer runtime is offline; no work was resubmitted.',
    );
  const required =
    RUNTIME_COMMAND_CAPABILITIES.get(request.request.operation) ?? request.request.operation;
  if (!status.capabilities.operations.some((operation) => operation === required))
    throw new ApiError(
      'claude_not_ready',
      `The selected runtime does not implement ${request.request.operation}.`,
    );
}
export function assertRuntimeReply(
  request: ComputerRuntimeRequest,
  reply: ComputerRuntimeReply,
): void {
  if (reply.runtime !== request.runtime || reply.reply.operation !== request.request.operation)
    throw new ApiError(
      'upstream_failed',
      'The selected computer returned a reply for a different runtime or operation.',
    );
}

export function runtimeAccessEnabled(status: ComputerRuntimeStatus, operation: string): boolean {
  const settings = status.settings.settings;
  if (operation === 'models') return settings.provider.enabled || settings.control.enabled;
  return operation.startsWith('provider_') ? settings.provider.enabled : settings.control.enabled;
}
