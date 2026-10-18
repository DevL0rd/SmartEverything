import type { Core, HubParts } from '../hub-assembly';
import type { ProcessWindow } from '@smarteverything/domain';
import { MetricHistory } from '../metrics/history';
import { sourcePolicyOf } from '../metrics/history-policy';
import { SourceHistory } from '../metrics/source-history';
import { Viewers } from '../metrics/viewers';
import type { DeviceDriverRegistry } from './device-driver';
import { DriverHost } from './driver-host';
import { localDriverSink } from './driver-sink';

export interface RunningDrivers {
  readonly registry: DeviceDriverRegistry;
  readonly metrics: MetricHistory;
  readonly viewers: Viewers<ProcessWindow>;
  readonly sources: SourceHistory;
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
    publishEvent: (event): Promise<string> => core.events.fromProviderCommitted('local', event),
    publishDevices: async (devices): Promise<void> => {
      await core.inventory.apply('local', devices);
    },
    forget: (externalIds): Promise<void> => core.inventory.remove('local', externalIds),
    log,
  });
  host.start();
  const sources = new SourceHistory({
    policyOf: sourcePolicyOf(parts.store),
    now: parts.clock.now,
  });
  const unfollow = parts.store.feed.subscribe((change) => {
    if (change.table === 'settings') sources.retune();
  });
  return {
    registry: core.drivers,
    metrics: new MetricHistory({
      store: parts.store.deviceMetrics,
      log: parts.logFor('metrics'),
      now: parts.clock.now,
    }),
    viewers: new Viewers<ProcessWindow>(),
    sources,
    deviceIdOf: (externalId) => core.inventory.deviceOf('local', externalId)?.id,
    stop: (): Promise<void> => {
      unfollow();
      return host.stop();
    },
  };
}
