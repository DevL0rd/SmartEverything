import { z } from 'zod';
import { ApiError, PLUGIN_REQUESTERS } from '@smarteverything/domain';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import {
  currentExecutionAuthorities,
  executionRole,
  validateExecutionAuthority,
} from '../assistant/execution-authority';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { ToolCaller } from '../ai-tools/hub-tool';

export const SPEECH_PRINCIPAL = z.strictObject({
  clientId: z.uuid(),
  profileId: z.uuid(),
  role: z.enum(['owner', 'member']),
  clientRole: z.enum(['owner', 'member']),
  via: z.enum(['assistant']).optional(),
  mcpOrigin: z.enum(['personal', 'oauth', 'computer']).optional(),
  pluginId: z.string().optional(),
  pluginRequester: z.enum(PLUGIN_REQUESTERS).optional(),
  chatId: z.uuid().optional(),
  authority: CONVERSATION_AUTHORITY.optional(),
  authorities: z.array(CONVERSATION_AUTHORITY),
  plugins: z.array(z.string()),
});
export type SpeechPrincipal = z.infer<typeof SPEECH_PRINCIPAL>;

export function speechPrincipal(store: Store, caller: Caller): SpeechPrincipal {
  if (caller.kind !== 'client')
    throw new ApiError(
      'forbidden',
      'A paired initiating app is required for a saved speech trigger.',
    );
  const { client, kind: _kind, local: _local, ...origin } = caller;
  const authorities = [
    ...currentExecutionAuthorities(),
    ...(caller.authority === undefined ? [] : [caller.authority]),
  ];
  const owner =
    client.role === 'owner' &&
    roleOfCaller(caller) === 'owner' &&
    authorities.every((authority) => executionRole(store, authority) === 'owner');
  const principal = SPEECH_PRINCIPAL.parse({
    ...origin,
    clientId: client.id,
    profileId: profileIdOf(store, caller),
    role: owner ? 'owner' : 'member',
    clientRole: client.role,
    authorities,
    plugins: [],
  });
  speechCaller(store, principal);
  return principal;
}

export function speechCaller(
  store: Store,
  principal: SpeechPrincipal,
): Extract<Caller, { kind: 'client' }> {
  const client = store.clients.byId(principal.clientId);
  store.profiles.byId(principal.profileId);
  const caller = principalCaller(client, principal);
  if (
    client.role !== principal.clientRole ||
    (principal.role === 'owner' &&
      (roleOfCaller(caller) !== 'owner' ||
        principal.authorities.some((authority) => executionRole(store, authority) !== 'owner')))
  )
    throw new ApiError('forbidden', 'The speech trigger initiating role changed.');
  for (const authority of principal.authorities) validateExecutionAuthority(store, authority);
  if (caller.authority !== undefined) validateExecutionAuthority(store, caller.authority);
  if (caller.pluginId !== undefined && !store.plugins.byId(caller.pluginId).enabled)
    throw new ApiError('forbidden', 'The initiating plugin is disabled.');
  return caller;
}

export function speechToolCaller(store: Store, principal: SpeechPrincipal): ToolCaller {
  const caller = speechCaller(store, principal);
  return {
    profileId: principal.profileId,
    role: principal.role,
    chatId: principal.chatId ?? null,
    clientId: principal.clientId,
    via: principal.via === 'assistant' ? 'chat' : 'app',
    ...(caller.authority === undefined ? {} : { authority: caller.authority }),
    ...(caller.pluginId === undefined ? {} : { pluginId: caller.pluginId }),
    ...(caller.pluginRequester === undefined ? {} : { pluginRequester: caller.pluginRequester }),
  };
}

function principalCaller(
  client: Extract<Caller, { kind: 'client' }>['client'],
  principal: SpeechPrincipal,
): Extract<Caller, { kind: 'client' }> {
  return {
    kind: 'client',
    client,
    profileId: principal.profileId,
    ...(principal.via === undefined ? {} : { via: principal.via }),
    ...(principal.mcpOrigin === undefined ? {} : { mcpOrigin: principal.mcpOrigin }),
    ...(principal.pluginId === undefined ? {} : { pluginId: principal.pluginId }),
    ...(principal.pluginRequester === undefined
      ? {}
      : { pluginRequester: principal.pluginRequester }),
    ...(principal.chatId === undefined ? {} : { chatId: principal.chatId }),
    ...(principal.authority === undefined ? {} : { authority: principal.authority }),
  };
}
