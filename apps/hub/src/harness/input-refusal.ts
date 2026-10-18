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
  const receipt = store.harnessCoordination.operation(event.delivery_id);
  if (
    receipt?.state !== 'completed' ||
    receipt.result === null ||
    !CLAIM.safeParse(JSON.parse(receipt.request)).success
  )
    return undefined;
  const result = API_ERROR.parse(JSON.parse(receipt.result));
  return new ApiError(result.error.code, result.error.message);
}
export function retainInputRefusal(
  store: Store,
  event: AiHarnessEvent,
  refusal: ApiError,
  settle: () => void,
): void {
  const id = z.uuid().parse(event.delivery_id);
  store.durableWrite(() => {
    store.harnessCoordination.begin(id, event.session_id, claimIdentity(event));
    store.harnessCoordination.finish(id, refusal.body());
    settle();
  });
}
