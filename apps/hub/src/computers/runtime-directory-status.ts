import {
  ApiError,
  type ComputerRuntimeTarget,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import type { ComputerAiState } from '../store/computer-ai-state';
import type { AttachedRuntime } from './runtime-directory-types';
import { unavailableRuntime } from './runtime-status';
import { runtimeAccessEnabled } from './runtime-access';
export function attachmentGeneration(attached: AttachedRuntime | undefined): string {
  if (attached === undefined)
    throw new ApiError('conflict', 'The native runtime attachment is offline.');
  return attached.connectionGeneration;
}
export function runtimeDirectoryStatus(
  context: { readonly state: ComputerAiState; readonly localDeviceId: string | null },
  target: ComputerRuntimeTarget,
  attached: AttachedRuntime | undefined,
): ComputerRuntimeStatus {
  return {
    ...target,
    local: attached?.local === true || context.localDeviceId === target.device_id,
    online: attached !== undefined,
    settings: context.state.runtimeSettings(target),
    capabilities:
      attached?.capabilities ??
      context.state.runtimeCapabilities(target) ??
      unavailableRuntime(target.runtime),
  };
}

export function runtimeModelUnavailableReason(status: ComputerRuntimeStatus): string | null {
  if (!status.online) return 'The supplying computer runtime is offline.';
  if (!runtimeAccessEnabled(status, 'models'))
    return 'The selected runtime model discovery is disabled.';
  if (status.capabilities.operations.includes('models')) return null;
  const reason = status.settings.settings.provider.enabled
    ? status.capabilities.provider_reason
    : status.capabilities.control_reason;
  return reason ?? 'The selected runtime does not implement model discovery.';
}
