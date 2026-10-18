import type { AdapterSink, Provider } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubDatabase } from '../database/port';
import type { EventRouter } from '../state/event-router';
import type { Inventory } from '../state/inventory';
import type { StateWriter } from '../state/state-writer';
import { failureLine } from '@smarteverything/logging';

export interface AdapterSinkPorts {
  readonly store: Pick<HubDatabase, 'updateProviderLink'>;
  readonly inventory: Pick<Inventory, 'setOnline'>;
  readonly state: Pick<StateWriter, 'push'>;
  readonly events: Pick<EventRouter, 'fromProvider'>;
  readonly log: Logger;
}

export function adapterSink(
  ports: AdapterSinkPorts,
  provider: Provider,
  publishDevices: (devices: Parameters<AdapterSink['devices']>[0]) => Promise<void>,
): AdapterSink {
  const { log } = ports;
  return {
    state: (update): void => {
      ports.state.push(provider, update);
    },
    event: (event): void => {
      ports.events.fromProvider(provider, event);
    },
    online: (externalId, online): void => {
      ports.inventory.setOnline(provider, externalId, online).catch((cause: unknown) => {
        log.error('provider.online_not_applied', cause, { provider, externalId, online });
      });
    },
    devices: (devices): void => {
      log.debug('provider.devices_published', { provider, count: devices.length });
      publishDevices(devices).catch((cause: unknown) => {
        log.error('provider.devices_not_applied', cause, { provider, count: devices.length });
      });
    },
    failure: (failure): void => {
      log.error('provider.failed', failure.cause, {
        provider,
        externalId: failure.externalId,
        operation: failure.operation,
      });
      void ports.store
        .updateProviderLink(provider, {
          lastError: `${failure.operation}: ${failureLine(failure.cause)}`,
        })
        .catch((cause: unknown) => {
          log.error('provider.error_not_recorded', cause, { provider });
        });
    },
  };
}
