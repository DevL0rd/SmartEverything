import { HarnessRuntimeError } from '../host/errors';
import type { HarnessControlPersistence } from './contracts';
import type {
  DshWriterClaim,
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';

export function nativeSessionPresent(runtime: HarnessRuntime, id: string): boolean {
  try {
    runtime.get(id);
    return true;
  } catch (cause) {
    if (cause instanceof HarnessRuntimeError && cause.code === 'operation_failed') return false;
    throw cause;
  }
}

export function lifecycleReceipt(
  kind: Exclude<HarnessRuntimeRequest['kind'], 'open' | 'prompt' | 'auxiliary'>,
): HarnessRuntimeReceipt['state'] {
  return kind === 'close' ? 'closed' : 'completed';
}

export async function retireSession(
  runtime: HarnessRuntime,
  persistence: HarnessControlPersistence,
  id: string,
): Promise<void> {
  persistence.lose(id);
  if (!nativeSessionPresent(runtime, id)) return;
  await runtime.whenOwnershipLossSettled(id);
  await runtime.close(id);
}

export async function cleanupFailedOpen(
  claim: DshWriterClaim,
  runtime: HarnessRuntime,
  persistence: HarnessControlPersistence,
): Promise<void> {
  if (nativeSessionPresent(runtime, claim.session_id)) await runtime.close(claim.session_id);
  persistence.lose(claim.session_id);
}
