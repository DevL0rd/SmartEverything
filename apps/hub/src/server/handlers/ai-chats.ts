import {
  API_ENDPOINTS as E,
  ApiError,
  type AiChatMeterSample,
  type AiChatRow,
} from '@smarteverything/domain';
import type { ChatOwner } from '../../assistant/chat-directory';
import { admitInactiveRemoval } from '../../assistant/agent-runs/inactive-removal';
import { removeProfileChats } from '../../assistant/remove-profile-chats';
import { chatOwnerOf, clientOf, confinedChatOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { requestSequence } from '../request-signal';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { readToolResult } from '../../assistant/tool-result';
import { wireMessages } from '../../assistant/wire-message';
import {
  modelSubscriptionScope,
  nativeSubscriptionScope,
} from '../../store/repositories/ai-weekly-subscription-history';

type ChatContext = Pick<ServerContext, 'store' | 'assistant'> & {
  readonly harness: { readonly routes: Pick<ServerContext['harness']['routes'], 'supplierRoute'> };
};

function ownerOf(context: ChatContext, caller: Caller): ChatOwner {
  return chatOwnerOf(context.store, caller);
}

function canStartStandalone(caller: Caller): boolean {
  return (
    caller.kind === 'client' &&
    caller.via === undefined &&
    caller.authority === undefined &&
    caller.pluginId === undefined
  );
}

function chatMeterHistory(
  context: ChatContext,
  chat: AiChatRow,
  owner: ChatOwner,
): AiChatMeterSample[] {
  const local = context.store.aiChats.meterHistory(chat.id);
  const engine = chat.engine;
  if (engine.kind !== 'dsh') {
    if (owner.role !== 'owner') return local;
    const scope = nativeSubscriptionScope(chat.profile_id, engine.kind, engine.device_id);
    return [...local, ...context.store.aiWeeklySubscriptionHistory.read(scope)];
  }
  const route = context.harness.routes.supplierRoute(chat.profile_id, engine.model_route_id);
  const scope = route === undefined ? undefined : modelSubscriptionScope(route);
  return scope === undefined
    ? local
    : [...local, ...context.store.aiWeeklySubscriptionHistory.read(scope)];
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
    readAiChatMeterHistory: bound(E.readAiChatMeterHistory, ({ params, caller }) => {
      const owner = ownerOf(context, caller);
      return chatMeterHistory(context, context.assistant.chats.own(owner, params.chatId), owner);
    }),
    branchAiChat: bound(E.branchAiChat, ({ params, body, caller }) =>
      context.assistant.branchChat(
        ownerOf(context, caller),
        params.chatId,
        body,
        canStartStandalone(caller),
      ),
    ),
    createAiChat: bound(E.createAiChat, ({ body, caller }) =>
      context.assistant.createChat(ownerOf(context, caller), body, canStartStandalone(caller)),
    ),
    updateAiChat: bound(E.updateAiChat, ({ params, body, caller }) =>
      context.assistant.updateChat(ownerOf(context, caller), params.chatId, body),
    ),
    openConversationChat: bound(E.openConversationChat, ({ caller }) =>
      context.assistant.chats.conversationChat(ownerOf(context, caller).profileId),
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
    const inactiveOnly = runId !== undefined || query.inactive_helper === 'true';
    await assistant.removeChat(
      owner,
      params.chatId,
      !inactiveOnly
        ? undefined
        : (scope): void => {
            admitInactiveRemoval(
              {
                store,
                owner,
                chatId: params.chatId,
                ...(runId === undefined ? {} : { runId }),
                status: (chat) => assistant.engineStatus(chat),
              },
              scope,
            );
          },
      inactiveOnly,
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
    setAiChatMessageReaction: bound(E.setAiChatMessageReaction, ({ params, body, caller }) => {
      const reactions = context.assistant.react(caller, params, body);
      requestSequence(context.store.feed.seq);
      return [...reactions];
    }),
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
