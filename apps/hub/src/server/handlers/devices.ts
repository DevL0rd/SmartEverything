import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { clientOf } from '../auth';
import { checkedCommands, sourcedBy } from '../commands';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type DeviceRoutes = Record<
  | 'listRooms'
  | 'createRoom'
  | 'updateRoom'
  | 'removeRoom'
  | 'listDevices'
  | 'updateDevice'
  | 'listState'
  | 'readHistory'
  | 'readHistoryBuckets'
  | 'listCommands'
  | 'readCommand'
  | 'sendCommand'
  | 'sendCommands'
  | 'listEvents'
  | 'acknowledgeEvent',
  Bound
>;

export function deviceRoutes(context: ServerContext): DeviceRoutes {
  const { store, hub } = context;
  return {
    listRooms: bound(E.listRooms, () => store.rooms.list()),
    createRoom: bound(E.createRoom, ({ body }) => store.rooms.create(body.name, body.position)),
    updateRoom: bound(E.updateRoom, ({ params, body }) => store.rooms.update(params.roomId, body)),
    removeRoom: bound(E.removeRoom, ({ params }) => {
      store.rooms.remove(params.roomId, (roomId) => {
        store.devices.unplace(roomId);
      });
      return DONE_REPLY;
    }),
    listDevices: bound(E.listDevices, () => store.devices.list()),
    updateDevice: bound(E.updateDevice, ({ params, body }) => {
      if (body.room_id !== undefined && body.room_id !== null) {
        store.rooms.byId(body.room_id);
      }
      return store.devices.update(params.deviceId, body);
    }),
    listState: bound(E.listState, () => store.state.list()),
    readHistory: bound(E.readHistory, ({ query }) => store.state.history(query)),
    readHistoryBuckets: bound(E.readHistoryBuckets, ({ query }) => store.state.buckets(query)),
    listCommands: bound(E.listCommands, ({ query }) => store.commands.recent(query.limit)),
    readCommand: bound(E.readCommand, ({ params }) => store.commands.byId(params.commandId)),
    sendCommand: bound(E.sendCommand, ({ body, caller }) => {
      const [row] = hub.submit(checkedCommands(store, sourcedBy(caller, [body]), clientOf(caller)));
      if (row === undefined) {
        throw new Error('Submitting one command returned no row.');
      }
      return row;
    }),
    sendCommands: bound(E.sendCommands, ({ body, caller }) =>
      hub.submit(checkedCommands(store, sourcedBy(caller, body.commands), clientOf(caller))),
    ),
    listEvents: bound(E.listEvents, ({ query }) => store.events.list(query)),
    acknowledgeEvent: bound(E.acknowledgeEvent, ({ params }) =>
      store.events.acknowledge(params.eventId),
    ),
  };
}
