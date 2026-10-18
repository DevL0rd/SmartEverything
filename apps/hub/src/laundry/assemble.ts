import type {
  EventKind,
  DeviceRow,
  DeviceEvent,
  JsonValue,
  Provider,
  StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { CycleTracker } from './cycle-tracker';

const CYCLE_KINDS: readonly EventKind[] = ['activity', 'cycle_finished'];
const CYCLE_HISTORY_ROWS = 200;

export interface CycleTrackerParts {
  readonly store: Pick<Store, 'devices' | 'events'>;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface CycleTrackerWriters {
  readonly state: {
    readonly valueOf: (deviceId: string, key: string) => JsonValue | undefined;
    readonly push: (provider: Provider, update: StateUpdate) => void;
  };
  readonly events: { readonly fromProvider: (provider: Provider, event: DeviceEvent) => void };
}

export function cycleTrackerOf(
  parts: CycleTrackerParts,
  writers: () => CycleTrackerWriters,
): CycleTracker {
  return new CycleTracker({
    device: (id): DeviceRow | undefined => parts.store.devices.find(id),
    value: (deviceId, key) => writers().state.valueOf(deviceId, key),
    record: (provider, event): void => {
      writers().events.fromProvider(provider, event);
    },
    push: (provider, update): void => {
      writers().state.push(provider, update);
    },
    history: (deviceId) =>
      parts.store.events
        .list({ deviceIds: [deviceId], kinds: CYCLE_KINDS, limit: CYCLE_HISTORY_ROWS })
        .map((row) => ({ kind: row.kind, occurredAt: row.occurred_at, details: row.details })),
    now: parts.now,
    log: parts.log,
  });
}
