import type { EventRow, SignalInput } from '@smarteverything/domain';
import { eventSignal } from '../../signals/sources/device';

export function signalOfEvent(event: EventRow, roomId: string | null): SignalInput {
  return eventSignal(
    {
      id: event.id,
      deviceId: event.device_id,
      kind: event.kind,
      occurredAt: event.occurred_at,
      details: event.details,
    },
    roomId,
  );
}
