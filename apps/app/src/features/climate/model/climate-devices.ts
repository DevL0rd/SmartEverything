import { isClimateDevice, type TableRow } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import {
  deviceValuesOf,
  rowsOf,
  type Device,
  type DeviceValues,
  type StoreState,
} from '../../../store/state';
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

const devicesByRoom = memoOnInputs(
  (state) => [state.tables.devices],
  (state) => {
    const all = rowsOf(state.tables.devices).filter(
      (device) => !device.hidden && isClimateDevice(device),
    );
    const rooms = new Map<string, Device[]>();
    for (const device of all) {
      if (device.room_id === null) continue;
      const devices = rooms.get(device.room_id) ?? [];
      devices.push(device);
      rooms.set(device.room_id, devices);
    }
    return { all, rooms };
  },
);

function devicesIn(state: StoreState, room: string | null): readonly Device[] {
  const devices = devicesByRoom(state);
  return room === null ? devices.all : (devices.rooms.get(room) ?? []);
}

function modelsIn(state: StoreState, room: string | null): readonly DeviceModel[] {
  return devicesIn(state, room).map(climateModelOf);
}

const sourceCache = new WeakMap<DeviceValues, WeakMap<DeviceModel, ClimateSource>>();

function sourceOf(model: DeviceModel, values: DeviceValues): ClimateSource {
  const byModel = sourceCache.get(values) ?? new WeakMap<DeviceModel, ClimateSource>();
  sourceCache.set(values, byModel);
  const known = byModel.get(model);
  if (known !== undefined) return known;
  const source = { model, values };
  byModel.set(model, source);
  return source;
}

const lastSources = new Map<string | null, readonly ClimateSource[]>();

function stable(room: string | null, next: readonly ClimateSource[]): readonly ClimateSource[] {
  const last = lastSources.get(room);
  if (last !== undefined && shallowEqual(last, next)) return last;
  lastSources.set(room, next);
  return next;
}

export function sourcesIn(state: StoreState, room: string | null): readonly ClimateSource[] {
  return stable(
    room,
    devicesIn(state, room).map((device) =>
      sourceOf(climateModelOf(device), deviceValuesOf(state, device.id)),
    ),
  );
}

export function useClimateModels(room: string | null): readonly DeviceModel[] {
  return useStoreSelector((state) => modelsIn(state, room), shallowEqual);
}

export function useClimateSources(room: string | null): readonly ClimateSource[] {
  return useStoreSelector((state) => sourcesIn(state, room));
}

export function useClimateDerived<T>(
  derive: (sources: readonly ClimateSource[], rooms: readonly TableRow<'rooms'>[]) => T,
  equal: (left: T, right: T) => boolean,
): T {
  return useStoreSelector(
    (state) => derive(sourcesIn(state, null), rowsOf(state.tables.rooms)),
    equal,
    [derive],
  );
}
