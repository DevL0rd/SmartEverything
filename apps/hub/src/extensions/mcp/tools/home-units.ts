import {
  baseNameOf,
  type CommandRow,
  type DeviceRow,
  type DeviceScope,
  type IrApplianceKeyRow,
  type IrApplianceRow,
  type IrCodeRow,
  type IrRemoteRow,
  type RoomRow,
} from '@smarteverything/domain';
import { deviceIdReachable } from '../../../server/person-scope-units';
import { storeUnit } from '../../../store/host/unit';

export interface HomeDevices {
  readonly rooms: RoomRow[];
  readonly devices: DeviceRow[];
}

export const MCP_HOME_DEVICES_UNIT = storeUnit((store, _input: null): HomeDevices => ({
  rooms: store.rooms.list(),
  devices: store.devices.list(),
}));

export const MCP_DEVICE_WITH_ROOMS_UNIT = storeUnit(
  (
    store,
    reference: string,
  ): { readonly device: DeviceRow | undefined; readonly rooms: RoomRow[] } => ({
    device: store.devices.find(reference),
    rooms: store.rooms.list(),
  }),
);

export const MCP_HOME_COUNTS_UNIT = storeUnit((store, _input: null) => ({
  rooms: store.rooms.list().length,
  devices: store.devices.list().length,
  people: store.profiles.list().length,
}));

export const MCP_REPORTED_UNIT = storeUnit((store, commands: readonly CommandRow[]) => {
  const names = new Map(store.devices.list().map((device) => [device.id, baseNameOf(device)]));
  return commands.map((command) => ({
    id: command.id,
    device_id: command.device_id,
    device: command.device_id === null ? null : (names.get(command.device_id) ?? null),
    capability: command.capability,
    value: command.value,
    status: command.status,
    result: command.result,
    error: command.error,
    now:
      command.device_id === null
        ? null
        : (store.state.value(command.device_id, command.capability) ?? null),
  }));
});

export const MCP_SEARCH_ROWS_UNIT = storeUnit((store, scope: DeviceScope | null) => ({
  rooms: store.rooms.list(),
  values: store.automationValues.list(),
  remotes: store.infrared
    .remotes()
    .filter((remote) => deviceIdReachable(store, scope, remote.blaster_id)),
  people: store.profiles.list(),
}));

export interface RemoteRows {
  readonly codes: IrCodeRow[];
  readonly remotes: IrRemoteRow[];
  readonly appliances: { readonly row: IrApplianceRow; readonly keys: IrApplianceKeyRow[] }[];
}

export const MCP_REMOTE_ROWS_UNIT = storeUnit((store, _input: null): RemoteRows => ({
  codes: store.infrared.codes(),
  remotes: store.infrared.remotes(),
  appliances: store.irAppliances
    .list()
    .map((row) => ({ row, keys: store.irAppliances.keys(row.id) })),
}));
