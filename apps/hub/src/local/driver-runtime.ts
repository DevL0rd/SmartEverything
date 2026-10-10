import type { Core, HubParts } from '../hub-assembly';
import { MetricHistory } from '../metrics/history';
import { Viewers } from '../metrics/viewers';
import type { DeviceDriverRegistry } from './device-driver';
import { DriverHost } from './driver-host';
import { localDriverSink } from './driver-sink';

export interface RunningDrivers {
  readonly registry: DeviceDriverRegistry;
  readonly metrics: MetricHistory;
  readonly viewers: Viewers;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly stop: () => Promise<void>;
}

export function startDrivers(
  parts: Pick<HubParts, 'store' | 'logFor' | 'clock'>,
  core: Pick<Core, 'drivers' | 'state' | 'events' | 'inventory'>,
): RunningDrivers {
  const log = parts.logFor('drivers');
  const host = new DriverHost({
    registry: core.drivers,
    sink: localDriverSink(core, log),
    forget: (externalIds): Promise<void> => core.inventory.remove('local', externalIds),
    log,
  });
  host.start();
  return {
    registry: core.drivers,
    metrics: new MetricHistory({
      store: parts.store.deviceMetrics,
      log: parts.logFor('metrics'),
      now: parts.clock.now,
    }),
    viewers: new Viewers(),
    deviceIdOf: (externalId) => core.inventory.deviceOf('local', externalId)?.id,
    stop: () => host.stop(),
  };
}
