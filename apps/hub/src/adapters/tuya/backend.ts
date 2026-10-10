import type { TuyaLinkMethod } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { STATUS_BATCH_SIZE, batches } from '@smarteverything/tuya';
import type { CloudDevice, CloudMessage, DataPointWrite, StatusItem } from '@smarteverything/tuya';
import type { TuyaCloud } from './cloud-client';
import type { LoadedInventory } from './cloud-inventory';

export interface DeviceStatus {
  readonly id: string;
  readonly status: readonly StatusItem[];
}

export interface MessageStream {
  start(): void;
  stop(): void;
}

export interface TuyaBackend {
  readonly method: TuyaLinkMethod;
  readonly project: TuyaCloud | null;
  loadInventory(log: Logger): Promise<LoadedInventory>;
  devicesById(deviceIds: readonly string[]): Promise<readonly CloudDevice[]>;
  statuses(deviceIds: readonly string[]): Promise<readonly DeviceStatus[]>;
  sendCommands(deviceId: string, writes: readonly DataPointWrite[]): Promise<void>;
  messages(log: Logger, received: (message: CloudMessage) => void): MessageStream;
}

class DeveloperProjectRequiredError extends Error {
  override readonly name = 'DeveloperProjectRequiredError';

  constructor(readonly feature: string) {
    super(
      `${feature} needs Tuya linked through a developer project; the Smart Life user-code link does not offer it.`,
    );
  }
}

export async function statusesInBatches(
  deviceIds: readonly string[],
  read: (batch: readonly string[]) => Promise<readonly DeviceStatus[]>,
): Promise<readonly DeviceStatus[]> {
  const statuses: DeviceStatus[] = [];
  for (const batch of batches(deviceIds, STATUS_BATCH_SIZE)) {
    statuses.push(...(await read(batch)));
  }
  return statuses;
}

export function projectOf(backend: TuyaBackend, feature: string): TuyaCloud {
  if (backend.project === null) {
    throw new DeveloperProjectRequiredError(feature);
  }
  return backend.project;
}
