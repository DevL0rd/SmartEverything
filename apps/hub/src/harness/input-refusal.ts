import { z } from 'zod';
import { API_ERROR, ApiError, DSH_SESSION_ID, type AiHarnessEvent } from '@smarteverything/domain';
import { durableStoreUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { HostStore } from '../store/host/host-store';

type ApiErrorBody = ReturnType<ApiError['body']>;
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
export function refusedNativeInput(store: HostStore, event: AiHarnessEvent): ApiError | undefined {
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
function retainedInputRefusal(store: HostStore, deliveryId: string): ApiError | undefined {
  const receipt = store.harnessSessions.operation(deliveryId);
  if (
    receipt?.state !== 'completed' ||
    receipt.result === null ||
    !CLAIM.safeParse(JSON.parse(receipt.request)).success
  )
    return undefined;
  return refusalOf(API_ERROR.parse(JSON.parse(receipt.result)));
}
function retainedRefusal(
  store: HostStore,
  input: { readonly event: AiHarnessEvent; readonly refusal: ApiErrorBody },
): void {
  const id = z.uuid().parse(input.event.delivery_id);
  store.harnessSessions.begin(id, input.event.session_id, claimIdentity(input.event));
  store.harnessSessions.finish(id, input.refusal);
}

export const INPUT_REFUSAL_RETAIN_UNIT = durableStoreUnit(retainedRefusal);

export function retainInputRefusal(
  store: Store,
  event: AiHarnessEvent,
  refusal: ApiError,
): Promise<void> {
  return store.host.write('harnessInputRefusalRetain', { event, refusal: refusal.body() });
}

export function refusalOf(body: ApiErrorBody | undefined): ApiError | undefined {
  if (body === undefined) return undefined;
  const result = API_ERROR.parse(body);
  return new ApiError(result.error.code, result.error.message, result.error.reason ?? null);
}
