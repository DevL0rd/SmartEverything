import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ChatOwner } from '../../assistant/chat-directory';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type AiChatRoutes = Record<
  | 'listAiChats'
  | 'createAiChat'
  | 'updateAiChat'
  | 'removeAiChat'
  | 'listAiChatMessages'
  | 'sendAiChatMessage'
  | 'interruptAiChat'
  | 'readEngineModels',
  Bound
>;

function ownerOf(context: ServerContext, caller: Caller): ChatOwner {
  return { profileId: profileIdOf(context.store, caller), role: clientOf(caller).role };
}

function chatRoutes(
  context: ServerContext,
): Pick<AiChatRoutes, 'listAiChats' | 'createAiChat' | 'updateAiChat' | 'removeAiChat'> {
  const { store, assistant } = context;
  return {
    listAiChats: bound(E.listAiChats, ({ query, caller }) =>
      store.aiChats.chats({ profileId: profileIdOf(store, caller), archived: query.archived }),
    ),
    createAiChat: bound(E.createAiChat, ({ body, caller }) =>
      assistant.createChat(ownerOf(context, caller), body),
    ),
    updateAiChat: bound(E.updateAiChat, ({ params, body, caller }) =>
      assistant.updateChat(ownerOf(context, caller), params.chatId, body),
    ),
    removeAiChat: bound(E.removeAiChat, async ({ params, caller }) => {
      await assistant.chats.remove(ownerOf(context, caller), params.chatId);
      return DONE_REPLY;
    }),
  };
}

function messageRoutes(
  context: ServerContext,
): Pick<
  AiChatRoutes,
  'listAiChatMessages' | 'sendAiChatMessage' | 'interruptAiChat' | 'readEngineModels'
> {
  const { store, assistant } = context;
  return {
    listAiChatMessages: bound(E.listAiChatMessages, ({ params, query, caller }) => {
      assistant.chats.own(ownerOf(context, caller), params.chatId);
      return assistant.messages(params.chatId, query.before, query.limit);
    }),
    sendAiChatMessage: bound(E.sendAiChatMessage, ({ params, body, caller }) =>
      assistant.send(
        { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) },
        body,
        params.chatId,
      ),
    ),
    interruptAiChat: bound(E.interruptAiChat, async ({ params, caller }) => {
      await assistant.interrupt(ownerOf(context, caller), params.chatId);
      return DONE_REPLY;
    }),
    readEngineModels: bound(E.readEngineModels, ({ params }) =>
      assistant.engineModels(params.kind),
    ),
  };
}

export function aiChatRoutes(context: ServerContext): AiChatRoutes {
  return { ...chatRoutes(context), ...messageRoutes(context) };
}
