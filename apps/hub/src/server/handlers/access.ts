import { ApiError, API_ENDPOINTS as E } from '@smarteverything/domain';
import { clientOf } from '../auth';
import { assertMemberPerson } from '../person-access';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import { personAccessRoutes } from './person-access';

const discoveryRoutes = (context: ServerContext) =>
  ({
    hubIdentity: bound(E.hubIdentity, () => connectionsOf(context).publicIdentity()),
    hubConnection: bound(E.hubConnection, () => connectionsOf(context).metadata()),
    status: bound(E.status, () => context.publicStatus()),
    session: bound(E.session, ({ caller }) => ({
      client: clientOf(caller),
      hub: context.status(),
    })),
    startPairing: bound(E.startPairing, ({ body, caller }) =>
      context.access.startPairing(body.role, clientOf(caller).id, body.profileId),
    ),
    proveHub: bound(E.proveHub, ({ body, remote }) => context.access.prove({ ...body, remote })),
    claimPairing: bound(E.claimPairing, ({ body, remote }) =>
      context.access.claim({ ...body, remote }),
    ),
  }) as const;

const clientRoutes = (context: ServerContext) =>
  ({
    listClients: bound(E.listClients, () => context.store.clients.list()),
    updateClient: bound(E.updateClient, ({ params, body, caller }) => {
      const { profile_id: profileId, ...change } = body;
      const before = context.store.clients.byId(params.clientId);
      if (profileId !== undefined || change.role !== undefined) {
        const target = profileId ?? context.store.profiles.activeOf(params.clientId).id;
        assertMemberPerson(context.store, before, change.role ?? before.role, target);
      }
      if (profileId !== undefined) {
        const profile = context.store.profiles.byId(profileId);
        context.store.clients.useProfile(params.clientId, profile.id);
        context.live.profileChanged(params.clientId, profile.id);
      }
      const client =
        change.name === undefined && change.role === undefined
          ? context.store.clients.byId(params.clientId)
          : context.store.clients.update(params.clientId, change);
      if (change.role !== undefined) {
        context.live.closeClient(client.id);
        context.store.accessAudit.record({
          profile_id: client.profile_id,
          client_id: clientOf(caller).id,
          kind: 'role_changed',
          detail: `${client.name} changed from ${before.role} to ${client.role}`,
        });
      }
      return client;
    }),
    removeClient: bound(E.removeClient, ({ params }) => {
      context.store.clients.remove(params.clientId);
      context.live.closeClient(params.clientId);
      return DONE_REPLY;
    }),
    rotateOwnerToken: bound(E.rotateOwnerToken, async () => ({
      token: await context.access.rotateOwner(),
    })),
  }) as const;

export const accessRoutes = (context: ServerContext) =>
  ({
    ...discoveryRoutes(context),
    ...clientRoutes(context),
    ...personAccessRoutes(context),
  }) as const;

function connectionsOf(context: ServerContext): NonNullable<ServerContext['connections']> {
  if (context.connections === undefined) {
    throw new ApiError('conflict', 'This hub has no configured connection identity.');
  }
  return context.connections;
}
