import { chunk } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { STATUS_BATCH_SIZE } from '@smarteverything/tuya';
import type { CloudDevice, CloudMessage, DataPointWrite, StatusItem } from '@smarteverything/tuya';
import type { LoadedDevice } from './smart-life-inventory';

export interface DeviceStatus {
  readonly id: string;
  readonly status: readonly StatusItem[];
}

export interface MessageStream {
  start(): void;
  stop(): void;
}

export interface TuyaBackend {
  loadInventory(log: Logger): Promise<readonly LoadedDevice[]>;
  devicesById(deviceIds: readonly string[]): Promise<readonly CloudDevice[]>;
  statuses(deviceIds: readonly string[]): Promise<readonly DeviceStatus[]>;
  sendCommands(deviceId: string, writes: readonly DataPointWrite[]): Promise<void>;
  messages(log: Logger, received: (message: CloudMessage) => void): MessageStream;
}

export async function statusesInBatches(
  deviceIds: readonly string[],
  read: (batch: readonly string[]) => Promise<readonly DeviceStatus[]>,
): Promise<readonly DeviceStatus[]> {
  const statuses: DeviceStatus[] = [];
  for (const batch of chunk(deviceIds, STATUS_BATCH_SIZE)) {
    statuses.push(...(await read(batch)));
  }
  return statuses;
}
