import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { checkedCommands, sourcedBy, commandPrincipal } from '../commands';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import type { Store } from '../../store/store';

const stateRoutes = (store: Store) =>
  ({
    listState: bound(E.listState, ({ caller }) => store.host.read('visibleState', caller)),
    readHistory: bound(E.readHistory, ({ query, caller }) =>
      store.host.read('visibleHistory', { caller, query }),
    ),
    readHistoryBuckets: bound(E.readHistoryBuckets, ({ query, caller }) =>
      store.host.read('visibleHistoryBuckets', { caller, query }),
    ),
  }) as const;

const commandRoutes = ({ store, hub }: Pick<ServerContext, 'store' | 'hub'>) =>
  ({
    listCommands: bound(E.listCommands, ({ query, caller }) =>
      store.host.read('visibleCommands', { caller, query }),
    ),
    readCommand: bound(E.readCommand, ({ params }) =>
      store.host.call('commands', 'byId', params.commandId),
    ),
    sendCommand: bound(E.sendCommand, async ({ body, caller }) => {
      const [row] = await hub.submit(
        await checkedCommands(
          store,
          sourcedBy(caller, [body]),
          await commandPrincipal(store, caller),
        ),
      );
      if (row === undefined) {
        throw new Error('Submitting one command returned no row.');
      }
      return row;
    }),
    sendCommands: bound(E.sendCommands, async ({ body, caller }) =>
      hub.submit(
        await checkedCommands(
          store,
          sourcedBy(caller, body.commands),
          await commandPrincipal(store, caller),
        ),
      ),
    ),
  }) as const;

export const deviceRoutes = ({ store, hub }: ServerContext) =>
  ({
    listRooms: bound(E.listRooms, () => store.host.call('rooms', 'list')),
    createRoom: bound(E.createRoom, ({ body }) =>
      store.host.call('rooms', 'create', body.name, body.position),
    ),
    updateRoom: bound(E.updateRoom, ({ params, body }) =>
      store.host.call('rooms', 'update', params.roomId, body),
    ),
    removeRoom: bound(E.removeRoom, async ({ params }) => {
      await store.host.write('removeRoom', params.roomId);
      return DONE_REPLY;
    }),
    listDevices: bound(E.listDevices, ({ caller }) => store.host.read('visibleDevices', caller)),
    updateDevice: bound(E.updateDevice, ({ params, body }) =>
      store.host.write('changeDevice', { deviceId: params.deviceId, change: body }),
    ),
    ...stateRoutes(store),
    ...commandRoutes({ store, hub }),
    listEvents: bound(E.listEvents, ({ query, caller }) =>
      store.host.read('visibleEvents', { caller, query }),
    ),
    acknowledgeEvent: bound(E.acknowledgeEvent, ({ params }) =>
      store.host.call('events', 'acknowledge', params.eventId),
    ),
  }) as const;
