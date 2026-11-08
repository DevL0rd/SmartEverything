import { z } from 'zod';
import { API_ERROR, ApiError, DSH_SESSION_ID, type AiHarnessEvent } from '@smarteverything/domain';
import type { Store } from '../store/store';
const CLAIM = z.strictObject({
  kind: z.literal('native-input-admission'),
  session_id: DSH_SESSION_ID,
  epoch: z.int().positive(),
  seq: z.int().nonnegative(),
  native_turn: z.int().positive(),
});
function claimIdentity(event: AiHarnessEvent): z.infer<typeof CLAIM> {
  return CLAIM.parse({
    kind: 'native-input-admission',
    session_id: event.session_id,
    epoch: event.epoch,
    seq: event.seq,
    native_turn: event.native_turn,
  });
}
export function refusedNativeInput(store: Store, event: AiHarnessEvent): ApiError | undefined {
  if (event.kind !== 'state' || event.delivery_id === undefined || event.native_turn === undefined)
    return undefined;
  const source = store.assistantEvents.find(event.delivery_id);
  const parentId = source?.helper_parent_message_id ?? null;
  if (parentId !== null) {
    const delivery = store.harnessDeliveries.find(event.delivery_id);
    if (delivery?.state !== 'admitted' || delivery.session_id !== event.session_id)
      return new ApiError(
        'command_refused',
        'This helper message lost its admitted execution host.',
      );
  }
  return retainedInputRefusal(store, event.delivery_id);
}
function retainedInputRefusal(store: Store, deliveryId: string): ApiError | undefined {
  const receipt = store.harnessSessions.operation(deliveryId);
  if (
    receipt?.state !== 'completed' ||
    receipt.result === null ||
    !CLAIM.safeParse(JSON.parse(receipt.request)).success
  )
    return undefined;
  const result = API_ERROR.parse(JSON.parse(receipt.result));
  return new ApiError(result.error.code, result.error.message, result.error.reason ?? null);
}
export function retainInputRefusal(
  store: Store,
  event: AiHarnessEvent,
  refusal: ApiError,
  settle: () => void,
): void {
  const id = z.uuid().parse(event.delivery_id);
  store.durableWrite(() => {
    store.harnessSessions.begin(id, event.session_id, claimIdentity(event));
    store.harnessSessions.finish(id, refusal.body());
    settle();
  });
}
