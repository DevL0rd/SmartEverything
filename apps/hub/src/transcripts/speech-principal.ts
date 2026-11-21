import { z } from 'zod';
import { ApiError, PLUGIN_REQUESTERS } from '@smarteverything/domain';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import { currentExecutionAuthority, executionRole } from '../assistant/turn-authority';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
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

export function speechPrincipal(caller: Caller): SpeechPrincipal {
  if (caller.kind !== 'client')
    throw new ApiError(
      'forbidden',
      'A paired initiating app is required for a saved speech trigger.',
    );
  const { client, kind: _kind, local: _local, ...origin } = caller;
  const authorities = [currentExecutionAuthority(), caller.authority].filter(
    (authority): authority is NonNullable<typeof authority> => authority !== undefined,
  );
  const owner =
    client.role === 'owner' &&
    roleOfCaller(caller) === 'owner' &&
    authorities.every((authority) => executionRole(authority) === 'owner');
  return SPEECH_PRINCIPAL.parse({
    ...origin,
    clientId: client.id,
    profileId: profileIdOf(caller),
    role: owner ? 'owner' : 'member',
    clientRole: client.role,
    authorities,
    plugins: [],
  });
}

export function toolCallerOf(
  principal: SpeechPrincipal,
  caller: Extract<Caller, { kind: 'client' }>,
): ToolCaller {
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
