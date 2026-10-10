import { CLOUD_PATHS, COMMAND_ACCEPTED, DEVICE_STATUSES, commandBody } from '@smarteverything/tuya';
import type { TuyaProjectSecrets } from './account';
import { statusesInBatches, type TuyaBackend } from './backend';
import { TuyaCloud } from './cloud-client';
import { listDevices, loadInventory } from './cloud-inventory';
import { messageConsumerFor } from './cloud-messages';
import type { TuyaDependencies } from './dependencies';

export function developerBackend(
  secrets: TuyaProjectSecrets,
  dependencies: TuyaDependencies,
): TuyaBackend {
  const cloud = new TuyaCloud(secrets, dependencies);
  return {
    method: 'developer_project',
    project: cloud,
    loadInventory: (log) => loadInventory(cloud, secrets.appUserId, log),
    devicesById: (deviceIds) => listDevices(cloud, secrets.appUserId, deviceIds),
    statuses: (deviceIds) =>
      statusesInBatches(deviceIds, (batch) =>
        cloud.call(
          'reading device statuses',
          { method: 'GET', path: CLOUD_PATHS.statuses, query: { device_ids: batch.join(',') } },
          DEVICE_STATUSES,
        ),
      ),
    sendCommands: async (deviceId, writes): Promise<void> => {
      await cloud.call(
        `sending commands to ${deviceId}`,
        { method: 'POST', path: CLOUD_PATHS.commands(deviceId), body: commandBody(writes) },
        COMMAND_ACCEPTED,
      );
    },
    messages: (log, received) => messageConsumerFor(secrets, dependencies, log, received),
  };
}
