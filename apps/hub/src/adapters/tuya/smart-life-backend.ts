import {
  ANY_RESULT,
  SMART_LIFE_PATHS,
  commandsOf,
  type SmartLifeSession,
  type TuyaCloudError,
} from '@smarteverything/tuya';
import { statusesInBatches, type MessageStream, type TuyaBackend } from './backend';
import type { LoadedInventory } from './cloud-inventory';
import type { TuyaDependencies } from './dependencies';
import { SmartLifeCloud } from './smart-life-cloud';
import { LoadOnce } from './bounded';
import {
  deviceDetails,
  loadSmartLifeInventory,
  type DescribedDevice,
} from './smart-life-inventory';
import { SmartLifeMessages, type Subscriptions } from './smart-life-messages';

export interface SmartLifeBackendOptions {
  readonly session: SmartLifeSession;
  readonly dependencies: TuyaDependencies;
  readonly renewed: (session: SmartLifeSession) => Promise<void>;
  readonly lost?: (cause: TuyaCloudError) => Promise<void>;
}

export function smartLifeBackend(options: SmartLifeBackendOptions): TuyaBackend {
  const cloud = new SmartLifeCloud(options);
  const descriptions = new LoadOnce<DescribedDevice>();
  let subscriptions: Subscriptions = { owners: [], devices: new Map() };
  let stream: SmartLifeMessages | null = null;
  return {
    method: 'smart_life',
    project: null,
    loadInventory: async (log): Promise<LoadedInventory> => {
      const loaded = await loadSmartLifeInventory(cloud, log, descriptions);
      subscriptions = { owners: loaded.owners, devices: loaded.reportsDataPoints };
      stream?.follow();
      return loaded.inventory;
    },
    devicesById: (deviceIds) => deviceDetails(cloud, deviceIds),
    statuses: (deviceIds) =>
      statusesInBatches(deviceIds, async (batch) =>
        (await deviceDetails(cloud, batch)).map((device) => ({
          id: device.id,
          status: device.status,
        })),
      ),
    sendCommands: async (deviceId, writes): Promise<void> => {
      await cloud.call(
        `sending commands to ${deviceId}`,
        {
          method: 'POST',
          path: SMART_LIFE_PATHS.commands(deviceId),
          body: commandsOf(writes),
        },
        ANY_RESULT,
      );
    },
    messages: (log, received): MessageStream => {
      stream = new SmartLifeMessages({
        cloud,
        dependencies: options.dependencies,
        subscriptions: (): Subscriptions => subscriptions,
        log,
        received,
      });
      return stream;
    },
  };
}

export async function expireTerminal(options: SmartLifeBackendOptions): Promise<void> {
  const cloud = new SmartLifeCloud(options);
  const session = await cloud.fresh();
  await cloud.call(
    'signing the hub out of Smart Life',
    {
      method: 'POST',
      path: SMART_LIFE_PATHS.expireTerminal,
      body: { accessToken: session.accessToken, terminalId: session.terminalId },
    },
    ANY_RESULT,
  );
}
