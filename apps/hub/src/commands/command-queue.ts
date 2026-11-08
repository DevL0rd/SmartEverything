import { isHubCapability } from '@smarteverything/domain';
import { failureLine, type Logger } from '@smarteverything/logging';
import type { CommandOutcome, CommandRow, DeviceRecord } from '../database/port';
import type { AdapterDirectory } from './executor';
import type { DeviceDriver, DeviceDriverRegistry } from '../local/device-driver';
import type { Inventory } from '../state/inventory';

export interface Started {
  readonly log: Logger;
  readonly fields: Record<string, unknown>;
  readonly startedAt: number;
}

export type Begun = Started | { readonly finished: CommandOutcome | undefined };

export interface QueuedCommand {
  readonly row: CommandRow;
  readonly authorize: (() => void) | undefined;
  absorbed: readonly QueuedCommand[];
  replaced: boolean;
  successor: Promise<void> | undefined;
}

export function sameRequester(
  previous: QueuedCommand,
  row: CommandRow,
  authorize: (() => void) | undefined,
): boolean {
  return (
    previous.authorize === authorize &&
    previous.row.source === row.source &&
    previous.row.requested_by === row.requested_by
  );
}

export function absorbedOutcome(
  authorize: (() => void) | undefined,
  by: string,
  replacement: CommandOutcome | undefined,
): CommandOutcome {
  try {
    authorize?.();
  } catch (cause) {
    return { status: 'failed', error: failureLine(cause) };
  }
  if (replacement === undefined) {
    return { status: 'failed', error: 'A newer command replaced this one and did not run.' };
  }
  return replacement.status === 'succeeded'
    ? { status: 'succeeded', result: { superseded: true, by } }
    : replacement;
}

export function laneKey(deviceId: string | null, capability: string): string {
  return JSON.stringify([deviceId, capability]);
}

export type TogetherDriver = Required<Pick<DeviceDriver, 'executeTogether'>>;

interface TogetherOptions {
  readonly inventory: Pick<Inventory, 'deviceById'>;
  readonly drivers: Pick<DeviceDriverRegistry, 'forDevice'>;
  readonly adapters: AdapterDirectory;
}

function providerTogether(options: TogetherOptions, device: DeviceRecord): TogetherDriver | null {
  if (device.provider === 'local') {
    const driver = options.drivers.forDevice(device.externalId);
    return driver?.executeTogether === undefined
      ? null
      : { executeTogether: driver.executeTogether.bind(driver) };
  }
  if (device.kind === 'television') return null;
  const adapter = options.adapters.adapterFor(device.provider);
  return adapter?.executeTogether === undefined
    ? null
    : { executeTogether: adapter.executeTogether.bind(adapter) };
}

export function togetherDriver(
  options: TogetherOptions,
  rows: readonly CommandRow[],
): TogetherDriver | null {
  const first = rows[0];
  const device =
    first?.device_id === undefined || first.device_id === null
      ? undefined
      : options.inventory.deviceById(first.device_id);
  const sameDevice = rows.every(
    (row) => row.device_id === first?.device_id && !isHubCapability(row.capability),
  );
  if (rows.length < 2 || !sameDevice || device === undefined) return null;
  return providerTogether(options, device);
}
