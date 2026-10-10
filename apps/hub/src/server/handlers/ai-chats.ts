import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ChatOwner } from '../../assistant/chat-directory';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type ChatContext = Pick<ServerContext, 'store' | 'assistant'>;

type AiChatRoutes = Record<
  | 'listAiChats'
  | 'searchAiChats'
  | 'createAiChat'
  | 'updateAiChat'
  | 'branchAiChat'
  | 'removeAiChat'
  | 'listAiChatMessages'
  | 'sendAiChatMessage'
  | 'retryAiChatMessage'
  | 'editAiChatMessage'
  | 'interruptAiChat',
  Bound
>;

function ownerOf(context: ChatContext, caller: Caller): ChatOwner {
  return { profileId: profileIdOf(context.store, caller), role: clientOf(caller).role };
}

function chatRoutes(
  context: ChatContext,
): Pick<
  AiChatRoutes,
  | 'listAiChats'
  | 'searchAiChats'
  | 'createAiChat'
  | 'updateAiChat'
  | 'branchAiChat'
  | 'removeAiChat'
> {
  const { store, assistant } = context;
  return {
    listAiChats: bound(E.listAiChats, ({ query, caller }) =>
      store.aiChats.chats({ profileId: profileIdOf(store, caller), ...query }),
    ),
    searchAiChats: bound(E.searchAiChats, ({ query, caller }) =>
      assistant.searchChats(ownerOf(context, caller), query),
    ),
    branchAiChat: bound(E.branchAiChat, ({ params, body, caller }) =>
      assistant.branchChat(ownerOf(context, caller), params.chatId, body),
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
  context: ChatContext,
): Pick<
  AiChatRoutes,
  | 'listAiChatMessages'
  | 'sendAiChatMessage'
  | 'retryAiChatMessage'
  | 'editAiChatMessage'
  | 'interruptAiChat'
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
    retryAiChatMessage: bound(E.retryAiChatMessage, ({ params, body, caller }) =>
      assistant.retry(ownerOf(context, caller), params, body.from),
    ),
    editAiChatMessage: bound(E.editAiChatMessage, ({ params, body, caller }) =>
      assistant.edit(ownerOf(context, caller), params, body),
    ),
    interruptAiChat: bound(E.interruptAiChat, async ({ params, caller }) => {
      await assistant.interrupt(ownerOf(context, caller), params.chatId);
      return DONE_REPLY;
    }),
  };
}

export function aiChatRoutes(context: ChatContext): AiChatRoutes {
  return { ...chatRoutes(context), ...messageRoutes(context) };
}
