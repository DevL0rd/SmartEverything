import {
  API_ENDPOINTS,
  endpointAccessArea,
  turnRoleOf,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../../server/person-access';
import { profileIdOf, roleOfCaller, type Caller } from '../../../server/auth';
import type { OperationInput } from '../../../server/operations';
import { areaRefusal, reachableAreas } from './person-reach';
import { ToolError, type ToolContext } from './registry';

export type ActingContext = Pick<ToolContext, 'store' | 'actor' | 'caller'>;
export type OperatingContext = ActingContext & {
  readonly operations: Pick<ToolContext['operations'], 'run'>;
};

export interface ActingAs {
  readonly personId?: string | undefined;
  readonly clientId?: string | undefined;
}

export function ownerOf(context: ActingContext): ClientRow {
  const owner = context.store.clients.owner();
  if (owner === undefined) {
    throw new ToolError('This server has no owner yet; open the desktop app once to create one');
  }
  return owner;
}

function clientFor(context: ActingContext, clientId: string | undefined): ClientRow {
  const chosen = clientId ?? context.actor?.clientId ?? null;
  return chosen === null ? ownerOf(context) : effectiveClientById(context.store, chosen);
}

type ActingCaller = Extract<Caller, { kind: 'client' | 'service' }>;

function pluginOrigin(
  context: ActingContext,
): Pick<Extract<Caller, { kind: 'client' }>, 'pluginId' | 'pluginRequester'> {
  const pluginId = context.caller?.via === 'plugin' ? context.caller.id : context.actor?.pluginId;
  return {
    ...(pluginId === undefined ? {} : { pluginId }),
    ...(context.actor?.pluginRequester === undefined
      ? {}
      : { pluginRequester: context.actor.pluginRequester }),
  };
}

function assistantOrigin(
  context: ActingContext,
): Pick<Extract<Caller, { kind: 'client' }>, 'authority' | 'mcpOrigin'> {
  return {
    ...(context.actor?.authority === undefined ? {} : { authority: context.actor.authority }),
    ...(context.caller === null || context.caller.via === 'plugin'
      ? {}
      : { mcpOrigin: context.caller.via }),
  };
}

function actingClient(context: ActingContext, client: ClientRow): ClientRow {
  const member =
    context.actor?.role === 'member' ||
    (context.actor?.pluginRequester !== undefined &&
      turnRoleOf(context.actor.pluginRequester) === 'member');
  return member && client.role === 'owner' ? { ...client, role: 'member' } : client;
}

function clientCaller(context: ActingContext, client: ClientRow): ActingCaller {
  const chatId = context.actor?.chatId ?? null;
  return {
    kind: 'client',
    client: actingClient(context, client),
    via: 'assistant',
    local: context.caller?.localOnly === true,
    ...(chatId === null ? {} : { chatId }),
    ...pluginOrigin(context),
    ...assistantOrigin(context),
  };
}

function principalOf(context: ActingContext): ActingCaller {
  const authority = context.actor?.authority;
  if (authority?.kind === 'service' && authority.role !== 'owner') {
    return {
      kind: 'service',
      authority,
      profileId: authority.profile_id,
      chatId: context.actor?.chatId ?? null,
      ...pluginOrigin(context),
    };
  }
  return clientCaller(context, clientFor(context, undefined));
}

function admit(context: ActingContext, as: ActingAs): ActingCaller {
  const principal = principalOf(context);
  if (roleOfCaller(principal) === 'owner') return principal;
  const own = context.actor?.profileId ?? profileIdOf(context.store, principal);
  const ownClient = principal.kind === 'client' ? principal.client.id : undefined;
  if ((as.personId ?? own) !== own || (as.clientId ?? ownClient) !== ownClient)
    throw new ToolError('Only an owner may act for another person or app.', 'forbidden');
  return principal;
}

export function profileFor(context: ActingContext, as: ActingAs): string {
  admit(context, as);
  const personId = as.personId ?? context.actor?.profileId;
  if (personId !== undefined) {
    return context.store.profiles.byId(personId).id;
  }
  const clientId = as.clientId ?? context.actor?.clientId ?? null;
  return clientId === null
    ? context.store.personAccess.homeOwner()
    : context.store.profiles.activeOf(clientId).id;
}

export function callerFor(context: ActingContext, as: ActingAs = {}): Caller {
  const principal = admit(context, as);
  if (principal.kind === 'service') return principal;
  const acting = clientCaller(context, clientFor(context, as.clientId));
  return as.personId === undefined && as.clientId !== undefined && context.actor === null
    ? acting
    : { ...acting, profileId: profileFor(context, as) };
}

function ownerCaller(caller: Caller): boolean {
  return (
    roleOfCaller(caller) === 'owner' && (caller.kind !== 'client' || caller.client.role === 'owner')
  );
}

export function operate(
  context: OperatingContext,
  name: EndpointName,
  input: OperationInput,
  as: ActingAs = {},
): Promise<unknown> {
  const caller = callerFor(context, as);
  if (!ownerCaller(caller) && API_ENDPOINTS[name].access === 'owner') {
    throw new ToolError(`Only an owner may use ${name}`, 'forbidden');
  }
  admitArea(context, name);
  return context.operations.run(name, caller, input);
}

function admitArea(context: OperatingContext, name: EndpointName): void {
  const area = endpointAccessArea(API_ENDPOINTS[name]);
  if (area !== null && reachableAreas(context)?.includes(area) === false) {
    throw areaRefusal(context, name, area);
  }
}
