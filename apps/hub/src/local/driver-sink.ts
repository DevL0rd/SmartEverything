import type { AdapterSink } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Core } from '../hub-assembly';

export function localDriverSink(
  core: Pick<Core, 'state' | 'events' | 'inventory'>,
  log: Logger,
): AdapterSink {
  return {
    state: (update): void => {
      core.state.push('local', update);
    },
    event: (event): void => {
      core.events.fromProvider('local', event);
    },
    devices: (devices): void => {
      core.inventory.apply('local', devices).catch((cause: unknown) => {
        log.error('driver.devices_not_applied', cause, { count: devices.length });
      });
    },
    failure: (failure): void => {
      log.error('driver.failed', failure.cause, {
        externalId: failure.externalId,
        operation: failure.operation,
      });
    },
  };
}
