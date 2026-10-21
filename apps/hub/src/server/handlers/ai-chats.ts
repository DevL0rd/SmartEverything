import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { ChatOwner } from '../../assistant/chat-directory';
import { admitInactiveRemoval } from '../../assistant/coordination/inactive-removal';
import { removeProfileChats } from '../../assistant/remove-profile-chats';
import { chatOwnerOf, clientOf, confinedChatOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { readToolResult } from '../../assistant/tool-result';
import { wireMessages } from '../../assistant/wire-message';

type ChatContext = Pick<ServerContext, 'store' | 'assistant'>;

function ownerOf(context: ChatContext, caller: Caller): ChatOwner {
  return chatOwnerOf(context.store, caller);
}

const chatRoutes = (context: ChatContext) =>
  ({
    listAiChats: bound(E.listAiChats, ({ query, caller }) =>
      context.assistant.chats.visible(
        ownerOf(context, caller),
        context.store.aiChats.chats({ profileId: profileIdOf(context.store, caller), ...query }),
      ),
    ),
    searchAiChats: bound(E.searchAiChats, ({ query, caller }) =>
      context.assistant.searchChats(ownerOf(context, caller), query),
    ),
    branchAiChat: bound(E.branchAiChat, ({ params, body, caller }) =>
      context.assistant.branchChat(ownerOf(context, caller), params.chatId, body),
    ),
    createAiChat: bound(E.createAiChat, ({ body, caller }) =>
      context.assistant.createChat(ownerOf(context, caller), body),
    ),
    updateAiChat: bound(E.updateAiChat, ({ params, body, caller }) =>
      context.assistant.updateChat(ownerOf(context, caller), params.chatId, body),
    ),
    removeAiChat: removalRoute(context),
    clearAiChats: bound(E.clearAiChats, async ({ caller }) => {
      if (confinedChatOf(caller) !== undefined)
        throw new ApiError('forbidden', 'A request tied to one chat cannot clear the others.');
      await removeProfileChats(
        context.store,
        context.assistant,
        profileIdOf(context.store, caller),
      );
      return DONE_REPLY;
    }),
  }) as const;

function removalRoute(context: ChatContext): RouteOf<'removeAiChat'> {
  const { store, assistant } = context;
  return bound(E.removeAiChat, async ({ params, query, caller }) => {
    const owner = ownerOf(context, caller);
    const runId = query.expected_inactive_run_id;
    await assistant.removeChat(
      owner,
      params.chatId,
      runId === undefined
        ? undefined
        : (scope): void => {
            admitInactiveRemoval(
              {
                store,
                owner,
                chatId: params.chatId,
                runId,
                status: (chat) => assistant.engineStatus(chat),
              },
              scope,
            );
          },
      runId !== undefined,
    );
    return DONE_REPLY;
  });
}

const messageRoutes = (context: ChatContext) =>
  ({
    listAiChatMessages: bound(E.listAiChatMessages, ({ params, query, caller }) => {
      context.assistant.chats.own(ownerOf(context, caller), params.chatId);
      return wireMessages(context.assistant.messages(params.chatId, query.before, query.limit));
    }),
    readAiToolResult: bound(E.readAiToolResult, ({ params, query, caller }) => {
      context.assistant.chats.own(ownerOf(context, caller), params.chatId);
      return readToolResult(context.store, { ...params, ...query, cursor: query.cursor });
    }),
    sendAiChatMessage: bound(E.sendAiChatMessage, ({ params, body, caller }) =>
      context.assistant.submissions.send(
        caller,
        { clientId: clientOf(caller).id, profileId: profileIdOf(context.store, caller) },
        body,
        params.chatId,
      ),
    ),
    retryAiChatMessage: bound(E.retryAiChatMessage, ({ params, body, caller }) => {
      return context.assistant.retry(ownerOf(context, caller), params, body.from, {
        clientId: caller.kind === 'service' ? null : clientOf(caller).id,
        caller,
      });
    }),
    editAiChatMessage: bound(E.editAiChatMessage, ({ params, body, caller }) => {
      return context.assistant.edit(ownerOf(context, caller), params, body, {
        clientId: caller.kind === 'service' ? null : clientOf(caller).id,
        caller,
      });
    }),
    compactAiChat: compactionRoute(context),
    interruptAiChat: bound(E.interruptAiChat, async ({ params, caller }) => {
      await context.assistant.interrupt(ownerOf(context, caller), params.chatId);
      return DONE_REPLY;
    }),
  }) as const;

export const aiChatRoutes = (context: ChatContext) =>
  ({ ...chatRoutes(context), ...messageRoutes(context) }) as const;

function compactionRoute(context: ChatContext): RouteOf<'compactAiChat'> {
  return bound(E.compactAiChat, async ({ params, caller }) => {
    return {
      compacted: await context.assistant.compact(
        ownerOf(context, caller),
        params.chatId,
        clientOf(caller).id,
      ),
    };
  });
}
