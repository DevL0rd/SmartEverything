import { isClimateDevice } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { rowsOf, type Device, type DeviceValues, type StoreState } from '../../../store/state';
import { deviceModelOf, type DeviceModel } from '../../devices';

export interface ClimateSource {
  readonly model: DeviceModel;
  readonly values: DeviceValues;
}

const models = new WeakMap<Device, DeviceModel>();

function climateModelOf(device: Device): DeviceModel {
  const known = models.get(device);
  if (known !== undefined) {
    return known;
  }
  const model = deviceModelOf(device);
  models.set(device, model);
  return model;
}

const NO_VALUES: DeviceValues = {};

function inRoom(device: Device, room: string | null): boolean {
  return room === null || device.room_id === room;
}

function sourcesIn(state: StoreState, room: string | null): readonly ClimateSource[] {
  return rowsOf(state.tables.devices)
    .filter((device) => !device.hidden && isClimateDevice(device) && inRoom(device, room))
    .map((device) => ({
      model: climateModelOf(device),
      values: state.deviceValues[device.id] ?? NO_VALUES,
    }));
}

function sameSources(left: readonly ClimateSource[], right: readonly ClimateSource[]): boolean {
  return (
    left.length === right.length &&
    left.every((source, index) => {
      const other = right[index];
      return other?.model === source.model && other.values === source.values;
    })
  );
}

export function useClimateSources(room: string | null): readonly ClimateSource[] {
  return useStoreSelector((state) => sourcesIn(state, room), sameSources);
}
