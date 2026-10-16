import { useStoreSelector } from '../../../store/store-context';
import { deviceValuesOf, rowsOf, type DeviceValues, type StoreState } from '../../../store/state';

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

const offlineMoments = new WeakMap<StoreState['tables']['events'], Map<string, string | null>>();

function offlineMomentsOf(events: StoreState['tables']['events']): Map<string, string | null> {
  const kept = offlineMoments.get(events);
  if (kept !== undefined) {
    return kept;
  }
  const created = new Map<string, string | null>();
  offlineMoments.set(events, created);
  return created;
}

function offlineMomentOf(events: StoreState['tables']['events'], deviceId: string): string | null {
  const byDevice = offlineMomentsOf(events);
  const known = byDevice.get(deviceId);
  if (known !== undefined) {
    return known;
  }
  const moment = latest(
    rowsOf(events)
      .filter((event) => event.device_id === deviceId && event.kind === 'device_offline')
      .map((event) => event.occurred_at),
  );
  byDevice.set(deviceId, moment);
  return moment;
}

interface SeenProjection {
  readonly deviceId: string;
  readonly value: LastSeen | null;
}

const seenProjections = new WeakMap<
  StoreState['tables']['events'],
  WeakMap<DeviceValues, SeenProjection>
>();

function lastSeenOf(
  events: StoreState['tables']['events'],
  values: DeviceValues,
  deviceId: string,
): LastSeen | null {
  const offline = offlineMomentOf(events, deviceId);
  if (offline !== null) {
    return { at: offline, wentOffline: true };
  }
  const heard = latest(Object.values(values).map((value) => value.observedAt));
  return heard === null ? null : { at: heard, wentOffline: false };
}

function lastSeenIn(state: StoreState, deviceId: string): LastSeen | null {
  const values = deviceValuesOf(state, deviceId);
  const events = state.tables.events;
  const projections = seenProjections.get(events) ?? new WeakMap<DeviceValues, SeenProjection>();
  seenProjections.set(events, projections);
  const known = projections.get(values);
  if (known?.deviceId === deviceId) {
    return known.value;
  }
  const value = lastSeenOf(events, values, deviceId);
  projections.set(values, { deviceId, value });
  return value;
}

function sameSeen(left: LastSeen | null, right: LastSeen | null): boolean {
  return left?.at === right?.at && left?.wentOffline === right?.wentOffline;
}

export function useLastSeen(deviceId: string): LastSeen | null {
  return useStoreSelector((state) => lastSeenIn(state, deviceId), sameSeen);
}
