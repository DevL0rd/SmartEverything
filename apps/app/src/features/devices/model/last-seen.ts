import { useStoreSelector } from '../../../store/store-context';
import { rowsOf, type StoreState } from '../../../store/state';

export interface LastSeen {
  readonly at: string;
  readonly wentOffline: boolean;
}

function latest(moments: readonly string[]): string | null {
  return moments.reduce<string | null>(
    (best, moment) => (best === null || moment > best ? moment : best),
    null,
  );
}

function lastSeenIn(state: StoreState, deviceId: string): LastSeen | null {
  const offline = latest(
    rowsOf(state.tables.events)
      .filter((event) => event.device_id === deviceId && event.kind === 'device_offline')
      .map((event) => event.occurred_at),
  );
  if (offline !== null) {
    return { at: offline, wentOffline: true };
  }
  const values = state.deviceValues[deviceId] ?? {};
  const heard = latest(Object.values(values).map((value) => value.observedAt));
  return heard === null ? null : { at: heard, wentOffline: false };
}

function sameSeen(left: LastSeen | null, right: LastSeen | null): boolean {
  return left?.at === right?.at && left?.wentOffline === right?.wentOffline;
}

export function useLastSeen(deviceId: string): LastSeen | null {
  return useStoreSelector((state) => lastSeenIn(state, deviceId), sameSeen);
}
