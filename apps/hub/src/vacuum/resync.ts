import { vacuumAction, type ActionAddress } from '@smarteverything/xiaomi';
import type { DeviceIo } from '../adapters/xiaomi/device-io';

export interface VacuumResync {
  readonly subscribed: (io: DeviceIo) => Promise<void>;
}

export function updatePropertiesAddress(): ActionAddress {
  const { siid, aiid } = vacuumAction('vacuumMap', 'update-properties-data');
  return { siid, aiid };
}

export const vacuumResync: VacuumResync = {
  subscribed: async (io) => {
    await io.action(updatePropertiesAddress(), []);
  },
};
