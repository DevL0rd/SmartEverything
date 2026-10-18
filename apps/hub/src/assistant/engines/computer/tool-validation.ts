import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { ComputerRunnerDeps, Turn } from './ports';
import { eventAuthority, executionRole } from '../../turn-authority';
import type { ProviderState } from './provider-state';
export function providerToolValidation(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  turn: Turn,
  current: () => boolean,
): (write: boolean) => void {
  return (write): void => {
    const authority = eventAuthority(deps.store, turn.event);
    if (executionRole(authority) !== 'owner')
      throw new ApiError(
        'forbidden',
        'Native project work requires its current initiating owner authority.',
      );
    const binding = state.bound(turn.chat);
    validateManagedContext(binding);
    const engine = deps.store.aiChats.chat(turn.chat.id).engine;
    if (JSON.stringify(engine) !== JSON.stringify(turn.chat.engine))
      throw new ApiError('forbidden', 'The native tool execution binding changed.');
    if (write && nativeProjectReadOnly(deps, turn.chat))
      throw new ApiError(
        'forbidden',
        'The current native permission allows reading project files only.',
      );
    if (
      !current() ||
      binding.job_id !== turn.jobId ||
      binding.device_id !== turn.chat.engine.device_id
    )
      throw new ApiError(
        'forbidden',
        'The native tool call no longer belongs to the current turn.',
      );
  };
}
export function nativeProjectReadOnly(deps: ComputerRunnerDeps, chat: AiChatRow): boolean {
  if (chat.engine.kind !== 'claude' && chat.engine.kind !== 'codex')
    throw new ApiError('forbidden', 'Project permissions require the current native engine.');
  const settings = deps.directory.runtimeStatus({
    device_id: chat.engine.device_id,
    runtime: deps.runtime,
  }).settings;
  if (chat.engine.kind === 'claude' && settings.runtime === 'claude')
    return (
      (chat.engine.settings.permission_mode ??
        settings.settings.provider.options.permission_mode) === 'plan'
    );
  if (chat.engine.kind === 'codex' && settings.runtime === 'codex')
    return (
      (chat.engine.settings.sandbox_policy ?? settings.settings.provider.options.sandbox_policy)
        ?.type === 'readOnly'
    );
  throw new ApiError('forbidden', 'The native runtime permission binding changed.');
}

function validateManagedContext(binding: ReturnType<ProviderState['bound']>): void {
  if (binding.managed_project === undefined) return;
  if (JSON.stringify(binding.context?.managed_project) !== JSON.stringify(binding.managed_project))
    throw new ApiError(
      'forbidden',
      'The admitted native managed project has no matching execution context.',
    );
}
