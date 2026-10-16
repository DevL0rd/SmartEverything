import type { Device } from '../../../store/state';
import { cardLayoutWeight, deviceModelOf, type CardWeight, type DeviceModel } from '../../devices';

const models = new WeakMap<Device, DeviceModel>();
function modelOf(device: Device): DeviceModel {
  const known = models.get(device);
  if (known !== undefined) {
    return known;
  }
  const model = deviceModelOf(device);
  models.set(device, model);
  return model;
}

export type Weights = ReadonlyMap<string, CardWeight>;

export function cardWeightsOf(devices: readonly Device[]): Weights {
  return new Map(devices.map((device) => [device.id, cardLayoutWeight(modelOf(device))]));
}
