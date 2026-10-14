import {
  ApiError,
  type ComputerRuntimeTarget,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AttachedRuntime } from './runtime-directory-types';
import { unavailableRuntime } from './runtime-status';
export function attachmentGeneration(attached: AttachedRuntime | undefined): string {
  if (attached === undefined)
    throw new ApiError('conflict', 'The native runtime attachment is offline.');
  return attached.connectionGeneration;
}
export function runtimeDirectoryStatus(
  context: { readonly store: Store; readonly localDeviceId: string | null },
  target: ComputerRuntimeTarget,
  attached: AttachedRuntime | undefined,
): ComputerRuntimeStatus {
  return {
    ...target,
    local: attached?.local === true || context.localDeviceId === target.device_id,
    online: attached !== undefined,
    settings: context.store.computerRuntimes.settings(target),
    capabilities:
      attached?.capabilities ??
      context.store.computerRuntimes.capabilities(target) ??
      unavailableRuntime(target.runtime),
  };
}
