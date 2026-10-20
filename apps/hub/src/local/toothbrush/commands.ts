import {
  CommandRefusedError,
  type DeviceCommand,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { DeviceDriver } from '../device-driver';
import type { BrushActionBroker } from './broker';
import { brushBrands } from './brands';
import { commandRoleOf } from './command-access';
import type { Fleet } from './fleet';

class BrushCommandFailedError extends Error {
  override readonly name = 'BrushCommandFailedError';
}

export interface CommandDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly broker: Pick<BrushActionBroker, 'run'>;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

export async function runBrushCommand(
  deps: CommandDeps,
  command: DeviceCommand,
): Promise<JsonValue> {
  const device = deps.store.devices.byExternal('local', command.externalId);
  if (device === undefined) {
    throw new CommandRefusedError(
      command.capability,
      'this toothbrush is no longer known to the hub',
    );
  }
  const state = deps.fleet.of(device);
  const steps = state.runtime.brand.command(command, {
    state,
    owner: () => commandRoleOf(deps.store, command.commandId) === 'owner',
  });
  const holder = deps.holderOf(device);
  const name = device.display_name ?? device.name;
  if (holder === null) {
    throw new BrushCommandFailedError(
      `${name} is not linked to a phone. Open SmartEverything on a phone near the toothbrush and wake the brush first.`,
    );
  }
  const startedAt = performance.now();
  const result = await deps.broker.run({ clientId: holder, deviceId: device.id, name }, steps);
  state.latencyMs = Math.round(performance.now() - startedAt);
  state.lastError = result.ok ? null : result.detail;
  if (!result.ok) {
    throw new BrushCommandFailedError(result.detail);
  }
  deps.log.info('toothbrush.command_done', { device: device.id, capability: command.capability });
  return result.detail;
}

export function brushDrivers(deps: CommandDeps, start: DeviceDriver['start']): DeviceDriver[] {
  return brushBrands().map((brand) => ({
    id: brand.driver,
    start,
    execute: (command) => runBrushCommand(deps, command),
  }));
}
