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
  const records = [];
  for (let offset = 0; offset < metadata.next_seq; offset += 10_000)
    records.push(
      ...store.dshSessions.read({ session_id: delivery.session_id, offset, limit: 10_000 }, profile)
        .events,
    );
  return { metadata, events: readNativeHistory(metadata.header, records) };
}
