import {
  API_ENDPOINTS,
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

export function callerFor(context: ToolContext, as: ActingAs = {}): Caller {
  const client = clientFor(context, as.clientId);
  const local = context.caller?.localOnly === true;
  const chatId = context.actor?.chatId ?? null;
  const plugin = context.caller?.via === 'plugin' ? { pluginId: context.caller.id } : {};
  const base = { kind: 'client', client, via: 'assistant', local, ...plugin } as const;
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
  const caller = callerFor(context, as);
  if (
    caller.kind === 'client' &&
    caller.client.role !== 'owner' &&
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
