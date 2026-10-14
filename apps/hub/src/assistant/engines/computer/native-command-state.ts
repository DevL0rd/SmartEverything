import type {
  AiChatRow,
  AiChatRuntimeProvider,
  AiNativeCommandScope,
  AiNativeCommandWrite,
} from '@smarteverything/domain';
import { canonicalRuntimeInput } from '../../../computers/runtime-receipts';
import type { ComputerRunnerDeps } from './ports';
import type { ComputerEvent } from './provider-state';

export function acceptedCommandState(
  deps: ComputerRunnerDeps,
  current: AiChatRuntimeProvider,
  chat: AiChatRow,
  event: ComputerEvent,
): AiChatRuntimeProvider | null {
  if (event.kind !== 'accepted') return null;
  const receipt = deps.store.nativeCommandOperations.active(chat.id).find(
    (operation) =>
      canonicalRuntimeInput([
        operation.scope.chat_id,
        operation.command_job_id,
        operation.scope.session_id,
      ]) === canonicalRuntimeInput([event.chat_id, event.job_id, event.session_id]) &&
      ownedCommandBinding(current, operation.scope) &&
      current.job_id === operation.scope.job_id &&
      operation.scope.profile_id === chat.profile_id &&
      operation.scope.runtime === deps.runtime &&
      deps.directory.runtimeConnectionGeneration({
        device_id: operation.scope.device_id,
        runtime: operation.scope.runtime,
      }) === operation.scope.connection_generation &&
      nativeAcceptedScope(operation.scope, event),
  );
  if (receipt === undefined) return null;
  return { ...current, job_id: receipt.command_job_id, state: 'working', reason: null };
}
export function rejectedCommandState(
  current: AiChatRuntimeProvider,
  before: AiChatRuntimeProvider,
  input: AiNativeCommandWrite,
): AiChatRuntimeProvider | null {
  if (
    current.runtime !== 'codex' ||
    before.runtime !== 'codex' ||
    current.job_id !== input.command_job_id ||
    before.job_id !== input.scope.job_id ||
    !ownedCommandBinding(current, input.scope) ||
    !ownedCommandBinding(before, input.scope)
  )
    return null;
  return {
    ...current,
    job_id: before.job_id,
    state: before.state,
    reason: before.reason,
    prompts: before.prompts,
  };
}
function ownedCommandBinding(current: AiChatRuntimeProvider, scope: AiNativeCommandScope): boolean {
  if (current.context === null) return false;
  return (
    canonicalRuntimeInput([
      current.runtime,
      current.device_id,
      current.session_id,
      current.context.runtime,
      current.context.device_id,
      current.context.session_id,
      current.context.process_generation,
      current.context.cwd,
    ]) ===
    canonicalRuntimeInput([
      scope.runtime,
      scope.device_id,
      scope.session_id,
      scope.runtime,
      scope.device_id,
      scope.session_id,
      scope.process_generation,
      scope.cwd,
    ])
  );
}
function nativeAcceptedScope(
  scope: AiNativeCommandScope,
  event: Extract<ComputerEvent, { kind: 'accepted' }>,
): boolean {
  if ('process_generation' in event)
    return (
      scope.runtime === 'codex' &&
      event.process_generation === scope.process_generation &&
      event.thread_id === scope.session_id
    );
  return scope.runtime === 'claude';
}
