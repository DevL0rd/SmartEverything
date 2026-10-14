import { HARNESS_RUNTIME_RECEIPT } from '@smarteverything/domain';
import type { HarnessRuntimeReceipt } from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';

export async function runtimeReceipt(
  persistence: HarnessControlPersistence,
  operationId: string,
  sessionId: string,
  state: Pick<HarnessRuntimeReceipt, 'epoch' | 'state'>,
): Promise<HarnessRuntimeReceipt> {
  return HARNESS_RUNTIME_RECEIPT.parse({
    operation_id: operationId,
    session_id: sessionId,
    ...state,
    durable_seq: (await persistence.metadata(sessionId)).durable_seq,
  });
}
