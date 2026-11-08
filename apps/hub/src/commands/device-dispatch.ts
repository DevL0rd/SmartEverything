import {
  CAPABILITY_KEY,
  capabilityOf,
  isHubCapability,
  validateCommand,
  type DeviceCommand,
  type JsonValue,
} from '@smarteverything/domain';
import type { CommandRow, DeviceRecord } from '../database/port';
import { CommandTargetError, ProviderNotRunningError } from './command-errors';
import type { CommandExecutorOptions } from './executor';

type DispatchOptions = Pick<
  CommandExecutorOptions,
  'inventory' | 'drivers' | 'television' | 'adapters' | 'log'
>;

export function stateKindOf(
  options: Pick<CommandExecutorOptions, 'inventory'>,
  row: CommandRow,
): string | null {
  if (row.device_id === null || isHubCapability(row.capability)) return null;
  const device = options.inventory.deviceById(row.device_id);
  const capability = CAPABILITY_KEY.safeParse(row.capability);
  if (device === undefined || !capability.success) return null;
  const descriptor = capabilityOf(device, capability.data);
  return descriptor?.access === 'read_write' && descriptor.value.kind !== 'action'
    ? device.kind
    : null;
}

export function deviceCommandOf(
  options: Pick<CommandExecutorOptions, 'inventory'>,
  row: CommandRow,
): { readonly device: DeviceRecord; readonly command: DeviceCommand } {
  if (row.device_id === null) {
    throw new CommandTargetError(row.id, `the device capability ${row.capability} names no device`);
  }
  const device = options.inventory.deviceById(row.device_id);
  if (device === undefined) {
    throw new CommandTargetError(row.id, `device ${row.device_id} is not known to this hub`);
  }
  const capability = CAPABILITY_KEY.parse(row.capability);
  const value = validateCommand(device, { capability, value: row.value });
  return {
    device,
    command: { commandId: row.id, externalId: device.externalId, capability, value },
  };
}

export async function executeOnDevice(
  options: DispatchOptions,
  row: CommandRow,
): Promise<JsonValue> {
  const { device, command } = deviceCommandOf(options, row);
  const driver = device.provider === 'local' ? options.drivers.forDevice(device.externalId) : null;
  if (driver !== null) return driver.execute(command);
  if (options.television?.handles(device, command) === true) {
    return options.television.execute(device, command);
  }
  const adapter = options.adapters.adapterFor(device.provider);
  options.log.debug('command.dispatched', {
    correlationId: row.id,
    provider: device.provider,
    deviceId: device.id,
    externalId: device.externalId,
    capability: command.capability,
    running: adapter !== undefined,
  });
  if (adapter === undefined) throw new ProviderNotRunningError(device.provider);
  return adapter.execute(command);
}
