import {
  API_ENDPOINTS,
  endpointAccessArea,
  turnRoleOf,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import { inLockedFolder } from '../../../drive/access';
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

function noOwner(): ToolError {
  return new ToolError('This server has no owner yet; open the desktop app once to create one');
}

export async function ownerOf(context: ActingContext): Promise<ClientRow> {
  const owner = await context.store.host.read('mcpActingClient', null);
  if (owner === null) throw noOwner();
  return owner;
}

async function clientFor(context: ActingContext, clientId: string | undefined): Promise<ClientRow> {
  const client = await context.store.host.read(
    'mcpActingClient',
    clientId ?? context.actor?.clientId ?? null,
  );
  if (client === null) throw noOwner();
  return client;
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

function runsOnThisHub(context: ActingContext): boolean {
  return context.caller === null ? context.actor !== null : context.caller.localOnly;
}

function clientCaller(context: ActingContext, client: ClientRow): ActingCaller {
  const chatId = context.actor?.chatId ?? null;
  return {
    kind: 'client',
    client: actingClient(context, client),
    via: 'assistant',
    local: runsOnThisHub(context),
    ...(chatId === null ? {} : { chatId }),
    ...pluginOrigin(context),
    ...assistantOrigin(context),
  };
}

async function principalOf(context: ActingContext): Promise<ActingCaller> {
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
  return clientCaller(context, await clientFor(context, undefined));
}

async function admit(context: ActingContext, as: ActingAs): Promise<ActingCaller> {
  const principal = await principalOf(context);
  if (roleOfCaller(principal) === 'owner') return principal;
  const own = context.actor?.profileId ?? profileIdOf(principal);
  const ownClient = principal.kind === 'client' ? principal.client.id : undefined;
  if ((as.personId ?? own) !== own || (as.clientId ?? ownClient) !== ownClient)
    throw new ToolError('Only an owner may act for another person or app.', 'forbidden');
  return principal;
}

export async function profileFor(context: ActingContext, as: ActingAs): Promise<string> {
  await admit(context, as);
  const personId = as.personId ?? context.actor?.profileId;
  return context.store.host.read(
    'mcpActingProfile',
    personId !== undefined
      ? { kind: 'person', personId }
      : { kind: 'client', clientId: as.clientId ?? context.actor?.clientId ?? null },
  );
}

export async function callerFor(context: ActingContext, as: ActingAs = {}): Promise<Caller> {
  const principal = await admit(context, as);
  if (principal.kind === 'service') return principal;
  const acting = clientCaller(context, await clientFor(context, as.clientId));
  return as.personId === undefined && as.clientId !== undefined && context.actor === null
    ? acting
    : { ...acting, profileId: await profileFor(context, as) };
}

function ownerCaller(caller: Caller): boolean {
  return (
    roleOfCaller(caller) === 'owner' && (caller.kind !== 'client' || caller.client.role === 'owner')
  );
}

export async function operate(
  context: OperatingContext,
  name: EndpointName,
  input: OperationInput,
  as: ActingAs = {},
): Promise<unknown> {
  const caller = await callerFor(context, as);
  if (!ownerCaller(caller) && API_ENDPOINTS[name].access === 'owner') {
    throw new ToolError(`Only an owner may use ${name}`, 'forbidden');
  }
  admitArea(context, name);
  await refuseLocked(context, caller, input);
  return context.operations.run(name, caller, input);
}

async function refuseLocked(
  context: OperatingContext,
  caller: Caller,
  input: OperationInput,
): Promise<void> {
  const itemId = input.params?.['itemId'];
  if (itemId === undefined) return;
  const item = await context.store.host.call('driveItems', 'find', itemId, profileIdOf(caller));
  if (item !== undefined && inLockedFolder(item)) {
    throw new ToolError('There is no such file or folder for this caller.', 'not_found');
  }
}

function admitArea(context: OperatingContext, name: EndpointName): void {
  const area = endpointAccessArea(API_ENDPOINTS[name]);
  if (area !== null && reachableAreas(context)?.includes(area) === false) {
    throw areaRefusal(context, name, area);
  }
}
