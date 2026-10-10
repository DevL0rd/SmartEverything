import type { DeviceDriverRegistry } from '../local/device-driver';
import type { Store } from '../store/store';
import type { PluginMetrics, PluginViewers, Unsubscribe } from './builtin/contract';

export interface DriverServices {
  readonly registry: Pick<DeviceDriverRegistry, 'register'>;
  readonly viewers: {
    readonly watch: (target: string, listener: (watched: boolean) => void) => Unsubscribe;
    readonly watched: (target: string) => boolean;
  };
  readonly metrics: {
    readonly push: (deviceId: string, capability: string, value: number, at: Date) => void;
  };
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly target: (deviceId: string) => string;
}

function whenDeviceExists(
  store: Store,
  services: DriverServices,
  externalId: string,
  found: (deviceId: string) => Unsubscribe,
): Unsubscribe {
  const known = services.deviceIdOf(externalId);
  if (known !== undefined) {
    return found(known);
  }
  let attached: Unsubscribe | null = null;
  const stopWaiting = store.feed.subscribe((change) => {
    if (attached !== null || change.table !== 'devices' || change.record === null) {
      return;
    }
    if (change.record.provider === 'local' && change.record.external_id === externalId) {
      attached = found(change.record.id);
    }
  });
  return (): void => {
    stopWaiting();
    attached?.();
  };
}

export function viewersOf(
  store: Store,
  services: DriverServices,
  track: (stop: Unsubscribe) => Unsubscribe,
): PluginViewers {
  return {
    watchDevice: (externalId, onChange): Unsubscribe =>
      track(
        whenDeviceExists(store, services, externalId, (deviceId) => {
          const target = services.target(deviceId);
          onChange(services.viewers.watched(target));
          return services.viewers.watch(target, onChange);
        }),
      ),
  };
}

export function metricsOf(
  services: DriverServices,
  warn: (externalId: string) => void,
): PluginMetrics {
  return {
    push: (externalId, key, value, at): void => {
      const deviceId = services.deviceIdOf(externalId);
      if (deviceId === undefined) {
        warn(externalId);
        return;
      }
      services.metrics.push(deviceId, key, value, new Date(at));
    },
  };
}
