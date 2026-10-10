import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { deviceValuesOf, type Device, type StoreState } from '../../../store/state';
import { cardWeight, deviceModelOf, type CardWeight, type DeviceModel } from '../../devices';

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

function weightsIn(state: StoreState, devices: readonly Device[]): readonly CardWeight[] {
  return devices.map((device) => cardWeight(modelOf(device), deviceValuesOf(state, device.id)));
}

export type Weights = ReadonlyMap<string, CardWeight>;

export function useCardWeights(devices: readonly Device[]): Weights {
  const weights = useStoreSelector((state) => weightsIn(state, devices), shallowEqual);
  return new Map(devices.map((device, index) => [device.id, weights[index] ?? 'none']));
}
