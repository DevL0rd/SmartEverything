import type {
  CapabilityKey,
  DeviceEvent,
  DeviceRow,
  JsonValue,
  Provider,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { CleanMap, CleanStore } from './clean-tracked';
import { VacuumCleanTracker } from './clean-tracker';
import type { MapCache } from './map-cache';

export interface CleanTrackerParts {
  readonly store: { readonly devices: Pick<Store['devices'], 'find'> };
  readonly cleans: CleanStore;
  readonly map: (deviceId: string) => CleanMap;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface CleanTrackerWriters {
  readonly state: {
    readonly valueOf: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
  };
  readonly events: { readonly fromProvider: (provider: Provider, event: DeviceEvent) => void };
}

export function cleanMapOf(
  cache: Pick<MapCache, 'latest'>,
  taskId: (deviceId: string) => number | null,
): (deviceId: string) => CleanMap {
  return (deviceId) => {
    const scene = cache.latest(deviceId, 'current');
    return {
      taskId: taskId(deviceId),
      index: scene?.index ?? null,
      rooms: new Map((scene?.rooms ?? []).map((room) => [room.id, room.name] as const)),
      trail: scene?.trail ?? [],
    };
  };
}

export function cleanTrackerOf(
  parts: CleanTrackerParts,
  writers: () => CleanTrackerWriters,
): VacuumCleanTracker {
  return new VacuumCleanTracker({
    device: (id): DeviceRow | undefined => parts.store.devices.find(id),
    value: (deviceId, key) => writers().state.valueOf(deviceId, key),
    record: (provider, event): void => {
      writers().events.fromProvider(provider, event);
    },
    cleans: parts.cleans,
    map: parts.map,
    now: parts.now,
    log: parts.log,
  });
}
