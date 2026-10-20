import { linkPlanParts, type ControlTarget } from '@smarteverything/ble';
import type { DeviceRow, TreadmillLinkPlan } from '@smarteverything/domain';
import { entryConfigOf, entrySettingsOf } from './config';
import type { DeviceState } from './fleet';

class MissingControlError extends Error {
  override readonly name = 'MissingControlError';

  constructor(deviceId: string) {
    super(`The link plan of treadmill ${deviceId} names no characteristic to write.`);
  }
}

export function planOf(
  device: Pick<DeviceRow, 'id'>,
  state: DeviceState,
  holder: boolean,
  now: Date,
): TreadmillLinkPlan {
  const config = entryConfigOf(state.entry);
  const settings = entrySettingsOf(state.entry);
  return {
    deviceId: device.id,
    address: state.entry.address,
    ...linkPlanParts(config.family, config.gatt, now),
    autoConnect: settings.stayConnected,
    presence: settings.presence,
    holder,
  };
}

export function controlOf(
  device: Pick<DeviceRow, 'id'>,
  state: DeviceState,
  now: Date,
): ControlTarget {
  const { control } = planOf(device, state, true, now);
  if (control === null) {
    throw new MissingControlError(device.id);
  }
  return control;
}
