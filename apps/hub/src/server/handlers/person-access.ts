import { ApiError, API_ENDPOINTS as E, type PersonAccessChange } from '@smarteverything/domain';
import { clientOf, profileIdOf, roleOfCaller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

const CHANGE_WORDS = [
  ['role', 'role'],
  ['template', 'kind of person'],
  ['scopes', 'what they can reach'],
  ['budget', 'AI budget'],
  ['conditions', 'home network and hours'],
  ['expires_at', 'end time'],
] as const satisfies readonly (readonly [keyof PersonAccessChange, string])[];

function changeText(change: PersonAccessChange): string {
  const words = CHANGE_WORDS.filter(([key]) => change[key] !== undefined).map(([, word]) => word);
  const list =
    words.length > 1
      ? `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`
      : words.join('');
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} changed`;
}

function auditedKinds(change: PersonAccessChange): readonly ('role_changed' | 'scopes_changed')[] {
  const role = change.role !== undefined || change.template !== undefined;
  const limits =
    change.scopes !== undefined ||
    change.budget !== undefined ||
    change.conditions !== undefined ||
    change.expires_at !== undefined;
  return [
    ...(role ? (['role_changed'] as const) : []),
    ...(limits ? (['scopes_changed'] as const) : []),
  ];
}

export const personAccessRoutes = (context: ServerContext) =>
  ({
    listPersonAccess: bound(E.listPersonAccess, () =>
      context.store.host.call('personAccess', 'list'),
    ),
    changePersonAccess: bound(E.changePersonAccess, async ({ params, body, caller }) => {
      const { store, live } = context;
      const onPerson = (await store.host.call('clients', 'list')).filter(
        (client) => client.profile_id === params.profileId,
      );
      if (body.role === 'owner' && onPerson.some((client) => client.role === 'member')) {
        throw new ApiError(
          'conflict',
          'Unpair or move the member devices of this person before making them an owner.',
        );
      }
      const after = await context.access.requests.changeByOwner(params.profileId, body);
      for (const kind of auditedKinds(body)) {
        const entry = { profile_id: params.profileId, client_id: clientOf(caller).id, kind };
        await store.host.call('accessAudit', 'record', { ...entry, detail: changeText(body) });
      }
      context.access.lifecycle.arm();
      context.talk.accessChanged();
      for (const client of onPerson) live.reconnectClient(client.id);
      return after;
    }),
    revokePerson: bound(E.revokePerson, async ({ params, caller }) => {
      await context.store.host.call('profiles', 'byId', params.profileId);
      await context.access.lifecycle.revoke(params.profileId, clientOf(caller).id);
      return DONE_REPLY;
    }),
    listAccessAudit: bound(E.listAccessAudit, ({ query }) =>
      context.store.host.call('accessAudit', 'list', query.limit, query.profileId),
    ),
    createAccessRequest: bound(E.createAccessRequest, ({ body, caller }) =>
      context.access.requests.create(profileIdOf(caller), body),
    ),
    listAccessRequests: bound(E.listAccessRequests, ({ query, caller }) =>
      context.access.requests.list(
        roleOfCaller(caller) === 'owner' ? null : profileIdOf(caller),
        query.status,
      ),
    ),
    decideAccessRequest: bound(E.decideAccessRequest, ({ params, body, caller }) =>
      context.access.requests.decide(params.requestId, clientOf(caller).id, body),
    ),
  }) as const;
