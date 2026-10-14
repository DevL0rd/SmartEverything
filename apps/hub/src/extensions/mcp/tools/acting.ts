import {
  API_ENDPOINTS,
  MCP_UNAVAILABLE_OPERATIONS,
  mcpOperationArea,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import type { Caller } from '../../../server/auth';
import type { OperationInput } from '../../../server/operations';
import { ToolError, type ToolContext } from './registry';

export interface ActingAs {
  readonly profileId?: string | undefined;
  readonly clientId?: string | undefined;
}

export function ownerOf(context: ToolContext): ClientRow {
  const owner = context.store.clients.owner();
  if (owner === undefined) {
    throw new ToolError('This server has no owner yet; open the desktop app once to create one');
  }
  return owner;
}

function clientFor(context: ToolContext, clientId: string | undefined): ClientRow {
  const chosen = clientId ?? context.actor?.clientId ?? null;
  return chosen === null ? ownerOf(context) : context.store.clients.byId(chosen);
}

export function profileFor(context: ToolContext, as: ActingAs): string {
  const profileId = as.profileId ?? context.actor?.profileId;
  if (profileId !== undefined) {
    return context.store.profiles.byId(profileId).id;
  }
  return context.store.profiles.activeOf(clientFor(context, as.clientId).id).id;
}

function pluginOrigin(
  context: ToolContext,
): Pick<Extract<Caller, { kind: 'client' }>, 'pluginId' | 'pluginRequester'> {
  const pluginId = context.caller?.via === 'plugin' ? context.caller.id : context.actor?.pluginId;
  return {
    ...(pluginId === undefined ? {} : { pluginId }),
    ...(context.actor?.pluginRequester === undefined
      ? {}
      : { pluginRequester: context.actor.pluginRequester }),
  };
}

function serviceCaller(context: ToolContext, as: ActingAs): Caller | null {
  const authority = context.actor?.authority;
  if (authority?.kind === 'service') {
    if (
      as.clientId !== undefined ||
      (as.profileId !== undefined && as.profileId !== authority.profile_id)
    )
      throw new ToolError(
        'Service actions cannot impersonate a paired app or another profile.',
        'forbidden',
      );
    return {
      kind: 'service',
      authority,
      profileId: authority.profile_id,
      chatId: context.actor?.chatId ?? null,
      ...pluginOrigin(context),
    };
  }
  return null;
}
function admitActor(context: ToolContext, as: ActingAs): void {
  const authority = context.actor?.authority;
  if (
    authority !== undefined &&
    ((as.clientId !== undefined && as.clientId !== authority.client_id) ||
      (as.profileId !== undefined && as.profileId !== authority.profile_id))
  )
    throw new ToolError(
      'Initiating grants cannot impersonate another app or profile.',
      'forbidden',
    );
}
export function callerFor(context: ToolContext, as: ActingAs = {}): Caller {
  admitActor(context, as);
  const service = serviceCaller(context, as);
  if (service !== null) return service;
  const client = clientFor(context, as.clientId);
  const local = context.caller?.localOnly === true;
  const chatId = context.actor?.chatId ?? null;
  const base = {
    kind: 'client',
    client,
    via: 'assistant',
    local,
    ...pluginOrigin(context),
    ...assistantOrigin(context),
  } as const;
  const acting = chatId === null ? base : { ...base, chatId };
  return as.profileId === undefined && context.actor === null
    ? acting
    : { ...acting, profileId: profileFor(context, as) };
}

export function operate(
  context: ToolContext,
  name: EndpointName,
  input: OperationInput,
  as: ActingAs = {},
): Promise<unknown> {
  const unavailable = MCP_UNAVAILABLE_OPERATIONS[name];
  if (unavailable !== undefined)
    throw new ToolError(`${name} is unavailable to AI: ${unavailable}`, 'unsupported_operation');
  const caller = callerFor(context, as);
  if (
    (caller.kind === 'service' || (caller.kind === 'client' && caller.client.role !== 'owner')) &&
    API_ENDPOINTS[name].access === 'owner'
  ) {
    throw new ToolError(`Only an owner may use ${name}`, 'forbidden');
  }
  const areas = context.caller?.areas;
  if (areas !== undefined && !areas.includes(mcpOperationArea(API_ENDPOINTS[name]))) {
    throw new ToolError(
      `This plugin may not use ${name}; the owner chooses what it can reach`,
      'forbidden',
    );
  }
  return context.operations.run(name, caller, input);
}

function assistantOrigin(
  context: ToolContext,
): Pick<Extract<Caller, { kind: 'client' }>, 'authority' | 'mcpOrigin'> {
  return {
    ...(context.actor?.authority === undefined ? {} : { authority: context.actor.authority }),
    ...(context.caller === null || context.caller.via === 'plugin'
      ? {}
      : { mcpOrigin: context.caller.via }),
  };
}
