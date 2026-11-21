import type { API_ENDPOINTS as E } from '@smarteverything/domain';
import {
  ApiError,
  type DeviceGroupInput,
  type DeviceGroupRow,
  type DeviceRow,
} from '@smarteverything/domain';
import { prepareTargetCommands } from '../../device-groups/commands';
import type { z } from 'zod';
import { visibleDevices, visibleState } from '../../computers/computer-visibility';
import { phoneViewerOfCaller } from '../../phones/phone-detail';
import { visibleEvents, visibleRows } from '../../phones/phone-visibility';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import type { Caller } from '../auth';
import type { Refusal, Subject } from '../person-access';
import {
  deviceHidden,
  deviceIdReachable,
  deviceReachWhy,
  deviceScopeOf,
  reachableRows,
  subjectOf,
} from '../person-scope';

type DeviceChange = z.output<typeof E.updateDevice.body>;

export interface Asked<Q> {
  readonly caller: Caller;
  readonly query: Q;
}

function requireTelevision(store: Store, deviceId: string, what: string): void {
  if (store.devices.byId(deviceId).kind !== 'television') {
    throw new ApiError('invalid_request', `Only a television has ${what}.`);
  }
}

function changeDevice(store: Store, deviceId: string, change: DeviceChange): DeviceRow {
  const { input_names: inputNames, wake_address: wakeAddress, ...patch } = change;
  if (patch.room_id !== undefined && patch.room_id !== null) {
    store.rooms.byId(patch.room_id);
  }
  if (inputNames !== undefined) {
    requireTelevision(store, deviceId, 'inputs to name');
    store.televisionSettings.setInputNames(deviceId, inputNames);
  }
  if (wakeAddress !== undefined) {
    requireTelevision(store, deviceId, 'a Wake-on-LAN address');
    store.televisionSettings.setWakeAddress(deviceId, wakeAddress);
  }
  return Object.keys(patch).length === 0
    ? store.devices.byId(deviceId)
    : store.devices.update(deviceId, patch);
}

export type Refused<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'refused'; readonly subject: Subject; readonly why: Refusal };

export interface TargetAsk {
  readonly caller: Caller;
  readonly body: z.output<typeof E.sendTargetCommands.body>;
}

export interface GroupSave {
  readonly caller: Caller;
  readonly groupId: string | null;
  readonly input: DeviceGroupInput;
}

function saveGroup(store: Store, { caller, groupId, input }: GroupSave): Refused<DeviceGroupRow> {
  const scope = deviceScopeOf(store, caller);
  const devices = input.device_ids.map((id) => store.devices.byId(id));
  const hidden = devices.find((device) => deviceHidden(scope, device));
  if (hidden !== undefined) {
    return { kind: 'refused', subject: subjectOf(caller), why: deviceReachWhy(hidden.id) };
  }
  return {
    kind: 'done',
    value:
      groupId === null
        ? store.deviceGroups.create(input)
        : store.deviceGroups.update(groupId, input),
  };
}

export const DEVICE_READ_UNITS = {
  visibleDeviceGroups: storeUnit((store, caller: Caller) => {
    const scope = deviceScopeOf(store, caller);
    return store.deviceGroups
      .list()
      .filter((group) => group.device_ids.every((id) => deviceIdReachable(store, scope, id)));
  }),
  targetCommandPlan: storeUnit((store, { caller, body }: TargetAsk) =>
    prepareTargetCommands(store, body, deviceScopeOf(store, caller)),
  ),
  visibleDevices: storeUnit((store, caller: Caller) => visibleDevices(store, caller)),
  visibleState: storeUnit((store, caller: Caller) => visibleState(store, caller)),
  visibleHistory: storeUnit(
    (store, { caller, query }: Asked<z.output<typeof E.readHistory.query>>) =>
      visibleRows(
        store,
        phoneViewerOfCaller(caller),
        reachableRows(
          store,
          deviceScopeOf(store, caller),
          store.state.history(query),
          (row) => row.device_id,
        ),
      ),
  ),
  visibleHistoryBuckets: storeUnit(
    (store, { caller, query }: Asked<z.output<typeof E.readHistoryBuckets.query>>) =>
      visibleRows(
        store,
        phoneViewerOfCaller(caller),
        reachableRows(
          store,
          deviceScopeOf(store, caller),
          store.state.buckets(query),
          (row) => row.device_id,
        ),
      ),
  ),
  visibleCommands: storeUnit(
    (store, { caller, query }: Asked<z.output<typeof E.listCommands.query>>) =>
      reachableRows(
        store,
        deviceScopeOf(store, caller),
        query.deviceId === undefined
          ? store.commands.recent(query.limit)
          : store.commands.ofDevice(query.deviceId, { limit: query.limit }),
        (row) => row.device_id,
      ),
  ),
  visibleEvents: storeUnit((store, { caller, query }: Asked<z.output<typeof E.listEvents.query>>) =>
    visibleEvents(
      store,
      phoneViewerOfCaller(caller),
      reachableRows(
        store,
        deviceScopeOf(store, caller),
        store.events.list(query),
        (row) => row.device_id,
      ),
    ),
  ),
} as const;

export const DEVICE_WRITE_UNITS = {
  saveDeviceGroup: storeUnit((store, input: GroupSave) => saveGroup(store, input)),
  changeDevice: storeUnit(
    (store, { deviceId, change }: { readonly deviceId: string; readonly change: DeviceChange }) =>
      changeDevice(store, deviceId, change),
  ),
  removeRoom: storeUnit((store, roomId: string): void => {
    store.rooms.remove(roomId, (id) => {
      store.devices.unplace(id);
    });
  }),
} as const;
