import { API_ENDPOINTS as E, ApiError, type AiChatRow } from '@smarteverything/domain';
import type { ChatOwner } from '../../assistant/chat-directory';
import { admitInactiveRemoval } from '../../assistant/coordination/inactive-removal';
import { clientOf, roleOfCaller, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type ChatContext = Pick<ServerContext, 'store' | 'assistant' | 'harness'>;

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
  | 'compactAiChat'
  | 'interruptAiChat',
  Bound
>;

function ownerOf(context: ChatContext, caller: Caller): ChatOwner {
  return {
    profileId: profileIdOf(context.store, caller),
    role: roleOfCaller(caller),
  };
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
    removeAiChat: removalRoute(context),
  };
}

function removalRoute(context: ChatContext): Bound {
  const { store, assistant } = context;
  return bound(E.removeAiChat, async ({ params, query, caller }) => {
    const owner = ownerOf(context, caller);
    await assistant.removeChat(
      owner,
      params.chatId,
      (scope) => {
        admitRemoval(context, caller, owner, scope);
        if (query.expected_inactive_run_id !== undefined)
          admitInactiveRemoval(
            {
              store,
              harness: context.harness,
              owner,
              chatId: params.chatId,
              runId: query.expected_inactive_run_id,
              status: (chat) => assistant.engineStatus(chat),
            },
            scope,
          );
      },
      query.expected_inactive_run_id !== undefined,
    );
    return DONE_REPLY;
  });
}

function messageRoutes(
  context: ChatContext,
): Pick<
  AiChatRoutes,
  | 'listAiChatMessages'
  | 'sendAiChatMessage'
  | 'retryAiChatMessage'
  | 'editAiChatMessage'
  | 'compactAiChat'
  | 'interruptAiChat'
> {
  const { store, assistant } = context;
  return {
    listAiChatMessages: bound(E.listAiChatMessages, ({ params, query, caller }) => {
      assistant.chats.own(ownerOf(context, caller), params.chatId);
      return assistant.messages(params.chatId, query.before, query.limit);
    }),
    sendAiChatMessage: bound(E.sendAiChatMessage, ({ params, body, caller }) =>
      assistant.submissions.send(
        caller,
        { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) },
        body,
        params.chatId,
      ),
    ),
    retryAiChatMessage: bound(E.retryAiChatMessage, ({ params, body, caller }) => {
      return assistant.retry(ownerOf(context, caller), params, body.from, {
        clientId: caller.kind === 'service' ? null : clientOf(caller).id,
        caller,
      });
    }),
    editAiChatMessage: bound(E.editAiChatMessage, ({ params, body, caller }) => {
      return assistant.edit(ownerOf(context, caller), params, body, {
        clientId: caller.kind === 'service' ? null : clientOf(caller).id,
        caller,
      });
    }),
    compactAiChat: compactionRoute(context),
    interruptAiChat: bound(E.interruptAiChat, async ({ params, caller }) => {
      await assistant.interrupt(ownerOf(context, caller), params.chatId);
      return DONE_REPLY;
    }),
  };
}

export function aiChatRoutes(context: ChatContext): AiChatRoutes {
  return { ...chatRoutes(context), ...messageRoutes(context) };
}

function admitRemoval(
  context: ChatContext,
  caller: Caller,
  owner: ChatOwner,
  _scope: readonly AiChatRow[],
): void {
  const current =
    caller.kind === 'client'
      ? { ...caller, client: context.store.clients.byId(caller.client.id) }
      : caller;
  const active = ownerOf(context, current);
  if (active.profileId !== owner.profileId || active.role !== owner.role)
    throw new ApiError(
      'forbidden',
      'The initiating profile or role changed while deleting; history was retained.',
    );
}

function compactionRoute(context: ChatContext): Bound {
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
