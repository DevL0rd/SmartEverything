import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { AskSender } from '../../assistant/coordination/asks';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import { chatOwnerOf, clientOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

function senderOf(context: ServerContext, caller: Caller): AskSender {
  if (caller.kind === 'service')
    return {
      owner: { ...chatOwnerOf(context.store, caller), role: 'member' },
      clientId: null,
      chatId: caller.chatId,
      plugin: pluginOriginOf(caller),
    };
  const client = clientOf(caller);
  return {
    owner: chatOwnerOf(context.store, caller),
    clientId: client.id,
    chatId: caller.kind === 'client' ? (caller.chatId ?? null) : null,
    plugin: caller.kind === 'client' ? pluginOriginOf(caller) : null,
  };
}

export const aiCoordinationRoutes = (context: ServerContext) =>
  ({
    askAiChat: bound(E.askAiChat, ({ params, body, caller }) =>
      context.assistant.coordination.ask(senderOf(context, caller), params.chatId, body),
    ),
    runAiSubagent: bound(E.runAiSubagent, ({ params, body, caller }) =>
      context.assistant.coordination.subagent(senderOf(context, caller), params.chatId, body),
    ),
  }) as const;
