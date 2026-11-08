import {
  ApiError,
  nativeModelOptionReason,
  type ComputerRuntimeStatus,
  type Role,
} from '@smarteverything/domain';
import { effectiveProviderEngine } from './engines/computer/options';
import type { ComputerEngine } from './engine-kind';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { Store } from '../store/store';
export function validateComputerEngine(
  store: Store,
  directory: ComputerAiDirectory,
  engine: ComputerEngine,
  role: Role,
): void {
  if (role !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can use Claude or Codex on computers.');
  const target = { device_id: engine.device_id, runtime: engine.kind };
  if (store.devices.find(engine.device_id)?.kind !== 'computer')
    throw new ApiError('invalid_request', 'Select a computer registered on this hub.');
  const status = directory.runtimeStatus(target);
  const effective = effectiveProviderEngine(engine, status.settings);
  validateProjectPath(effective.settings.cwd);
  const model = store.computerRuntimes
    .models(target)
    .find((row) => row.id === engine.model || row.resolved_model === engine.model);
  if (model === undefined) return;
  const reason = nativeModelOptionReason(effective, model);
  if (reason !== null) throw new ApiError('invalid_request', reason);
}
const WINDOWS_ABSOLUTE = /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i;

function validateProjectPath(cwd: string | undefined): void {
  if (cwd === undefined) return;
  if ((!cwd.startsWith('/') && !WINDOWS_ABSOLUTE.test(cwd)) || cwd.includes('\0'))
    throw new ApiError('invalid_request', 'Select an absolute project folder on this computer.');
}

export function computerProviderReadiness(status: ComputerRuntimeStatus): string | null {
  if (!status.online) return 'The supplying computer is offline.';
  if (!status.settings.settings.provider.enabled)
    return 'The provider is disabled on this computer.';
  if (status.capabilities.provider_reason !== null) return status.capabilities.provider_reason;
  return status.capabilities.operations.includes('provider_start')
    ? null
    : 'The selected computer cannot start provider chats.';
}
