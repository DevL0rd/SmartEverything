import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { AskSender } from '../../assistant/coordination/asks';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import { clientOf, roleOfCaller, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

function senderOf(context: ServerContext, caller: Caller): AskSender {
  if (caller.kind === 'service')
    return {
      owner: { profileId: profileIdOf(context.store, caller), role: 'member' },
      clientId: null,
      chatId: caller.chatId,
      plugin: pluginOriginOf(caller),
    };
  const client = clientOf(caller);
  return {
    owner: { profileId: profileIdOf(context.store, caller), role: roleOfCaller(caller) },
    clientId: client.id,
    chatId: caller.kind === 'client' ? (caller.chatId ?? null) : null,
    plugin: caller.kind === 'client' ? pluginOriginOf(caller) : null,
  };
}

export function aiCoordinationRoutes(
  context: ServerContext,
): Record<'askAiChat' | 'runAiSubagent', Bound> {
  const { coordination } = context.assistant;
  return {
    askAiChat: bound(E.askAiChat, ({ params, body, caller }) =>
      coordination.ask(senderOf(context, caller), params.chatId, body),
    ),
    runAiSubagent: bound(E.runAiSubagent, ({ params, body, caller }) =>
      coordination.subagent(senderOf(context, caller), params.chatId, body),
    ),
  };
}
