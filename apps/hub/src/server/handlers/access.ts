import { ApiError, API_ENDPOINTS as E } from '@smarteverything/domain';
import { clientOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type AccessRoutes = Record<
  | 'hubIdentity'
  | 'hubConnection'
  | 'status'
  | 'session'
  | 'startPairing'
  | 'claimPairing'
  | 'listClients'
  | 'updateClient'
  | 'removeClient'
  | 'rotateOwnerToken',
  Bound
>;

export function accessRoutes(context: ServerContext): AccessRoutes {
  const { store } = context;
  return {
    hubIdentity: bound(E.hubIdentity, () => connectionsOf(context).publicIdentity()),
    hubConnection: bound(E.hubConnection, () => connectionsOf(context).metadata()),
    status: bound(E.status, () => context.publicStatus()),
    session: bound(E.session, ({ caller }) => ({
      client: clientOf(caller),
      hub: context.status(),
    })),
    startPairing: bound(E.startPairing, ({ body, caller }) =>
      context.access.startPairing(body.role, clientOf(caller).id, body.connectionProtocolVersion),
    ),
    claimPairing: bound(E.claimPairing, ({ body, remote }) =>
      context.access.claim({ ...body, remote }),
    ),
    listClients: bound(E.listClients, () => store.clients.list()),
    updateClient: bound(E.updateClient, ({ params, body }) => {
      const { profile_id: profileId, ...change } = body;
      if (profileId !== undefined) {
        const profile = store.profiles.byId(profileId);
        store.clients.useProfile(params.clientId, profile.id);
        context.live.profileChanged(params.clientId, profile.id);
      }
      const client =
        change.name === undefined && change.role === undefined
          ? store.clients.byId(params.clientId)
          : store.clients.update(params.clientId, change);
      if (change.role !== undefined) {
        context.live.closeClient(client.id);
      }
      return client;
    }),
    removeClient: bound(E.removeClient, ({ params }) => {
      store.clients.remove(params.clientId);
      context.live.closeClient(params.clientId);
      return DONE_REPLY;
    }),
    rotateOwnerToken: bound(E.rotateOwnerToken, async () => ({
      token: await context.access.rotateOwner(),
    })),
  };
}

function connectionsOf(context: ServerContext): NonNullable<ServerContext['connections']> {
  if (context.connections === undefined) {
    throw new ApiError('conflict', 'This hub has no configured connection identity.');
  }
  return context.connections;
}
