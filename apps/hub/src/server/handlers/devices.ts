import { API_ENDPOINTS as E, ApiError, type DeviceRow } from '@smarteverything/domain';
import type { z } from 'zod';
import { visibleDevices, visibleState } from '../../computers/computer-access';
import { phoneViewerOfCaller } from '../../phones/phone-detail';
import { visibleEvents, visibleRows } from '../../phones/phone-visibility';
import { checkedCommands, sourcedBy, commandPrincipal } from '../commands';
import type { ServerContext } from '../context';
import { deviceScopeOf, reachableRows } from '../person-scope';
import { DONE_REPLY, bound } from '../router';
import type { Store } from '../../store/store';

type DeviceChange = z.output<typeof E.updateDevice.body>;

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

const stateRoutes = (store: Store) =>
  ({
    listState: bound(E.listState, ({ caller }) => visibleState(store, caller)),
    readHistory: bound(E.readHistory, ({ query, caller }) =>
      visibleRows(
        store,
        phoneViewerOfCaller(store, caller),
        reachableRows(
          store,
          deviceScopeOf(store, caller),
          store.state.history(query),
          (row) => row.device_id,
        ),
      ),
    ),
    readHistoryBuckets: bound(E.readHistoryBuckets, ({ query, caller }) =>
      visibleRows(
        store,
        phoneViewerOfCaller(store, caller),
        reachableRows(
          store,
          deviceScopeOf(store, caller),
          store.state.buckets(query),
          (row) => row.device_id,
        ),
      ),
    ),
  }) as const;

const commandRoutes = ({ store, hub }: Pick<ServerContext, 'store' | 'hub'>) =>
  ({
    listCommands: bound(E.listCommands, ({ query, caller }) =>
      reachableRows(
        store,
        deviceScopeOf(store, caller),
        query.deviceId === undefined
          ? store.commands.recent(query.limit)
          : store.commands.ofDevice(query.deviceId, { limit: query.limit }),
        (row) => row.device_id,
      ),
    ),
    readCommand: bound(E.readCommand, ({ params }) => store.commands.byId(params.commandId)),
    sendCommand: bound(E.sendCommand, ({ body, caller }) => {
      const [row] = hub.submit(
        checkedCommands(store, sourcedBy(caller, [body]), commandPrincipal(store, caller)),
      );
      if (row === undefined) {
        throw new Error('Submitting one command returned no row.');
      }
      return row;
    }),
    sendCommands: bound(E.sendCommands, ({ body, caller }) =>
      hub.submit(
        checkedCommands(store, sourcedBy(caller, body.commands), commandPrincipal(store, caller)),
      ),
    ),
  }) as const;

export const deviceRoutes = ({ store, hub }: ServerContext) =>
  ({
    listRooms: bound(E.listRooms, () => store.rooms.list()),
    createRoom: bound(E.createRoom, ({ body }) => store.rooms.create(body.name, body.position)),
    updateRoom: bound(E.updateRoom, ({ params, body }) => store.rooms.update(params.roomId, body)),
    removeRoom: bound(E.removeRoom, ({ params }) => {
      store.rooms.remove(params.roomId, (roomId) => {
        store.devices.unplace(roomId);
      });
      return DONE_REPLY;
    }),
    listDevices: bound(E.listDevices, ({ caller }) => visibleDevices(store, caller)),
    updateDevice: bound(E.updateDevice, ({ params, body }) =>
      changeDevice(store, params.deviceId, body),
    ),
    ...stateRoutes(store),
    ...commandRoutes({ store, hub }),
    listEvents: bound(E.listEvents, ({ query, caller }) =>
      visibleEvents(
        store,
        phoneViewerOfCaller(store, caller),
        reachableRows(
          store,
          deviceScopeOf(store, caller),
          store.events.list(query),
          (row) => row.device_id,
        ),
      ),
    ),
    acknowledgeEvent: bound(E.acknowledgeEvent, ({ params }) =>
      store.events.acknowledge(params.eventId),
    ),
  }) as const;
