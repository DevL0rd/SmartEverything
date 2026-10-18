import { readNativeHistory } from '@smarteverything/harness/process';
import type { Store } from '../../../store/store';
import type { HarnessDelivery } from '../../../store/repositories/harness-deliveries';
import { ApiError } from '@smarteverything/domain';
export function nativeDeliveryHistory(
  store: Store,
  delivery: HarnessDelivery,
  profile: string,
  chat: string,
): {
  readonly metadata: NonNullable<ReturnType<Store['dshSessions']['stat']>>;
  readonly events: ReturnType<typeof readNativeHistory>;
} {
  const metadata = store.dshSessions.stat(delivery.session_id, profile);
  if (metadata?.chat_id !== chat)
    throw new ApiError('forbidden', 'Retained delivery/native conversation binding differs.');
  const records = store.dshSessions.readAll(delivery.session_id, profile);
  return { metadata, events: readNativeHistory(metadata.header, records) };
}
