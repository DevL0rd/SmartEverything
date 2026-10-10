import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type AssistantChatRoutes = Record<
  | 'readAssistant'
  | 'listAssistantMessages'
  | 'sendAssistantMessage'
  | 'removeAssistantMessage'
  | 'clearAssistantMessages'
  | 'startAssistantUpload'
  | 'sendAssistantUploadChunk'
  | 'finishAssistantUpload'
  | 'assistantAttachmentLinks'
  | 'updateAssistantSettings'
  | 'postAssistant',
  Bound
>;

function local(caller: Caller): boolean {
  return caller.kind === 'client' && caller.via === 'assistant' && caller.local === true;
}

function chatRoutes(
  context: ServerContext,
): Pick<
  AssistantChatRoutes,
  | 'readAssistant'
  | 'listAssistantMessages'
  | 'sendAssistantMessage'
  | 'removeAssistantMessage'
  | 'clearAssistantMessages'
> {
  const { store, assistant } = context;
  return {
    readAssistant: bound(E.readAssistant, () => assistant.status()),
    listAssistantMessages: bound(E.listAssistantMessages, ({ query, caller }) =>
      assistant.messages(
        assistant.chats.defaultChat(profileIdOf(store, caller)).id,
        query.before,
        query.limit,
      ),
    ),
    sendAssistantMessage: bound(E.sendAssistantMessage, ({ body, caller }) =>
      assistant.send(
        { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) },
        body,
      ),
    ),
    removeAssistantMessage: bound(E.removeAssistantMessage, async ({ params, caller }) => {
      await assistant.remove(profileIdOf(store, caller), [params.messageId]);
      return DONE_REPLY;
    }),
    clearAssistantMessages: bound(E.clearAssistantMessages, async ({ caller }) => {
      const profileId = profileIdOf(store, caller);
      const chatId = assistant.chats.defaultChat(profileId).id;
      await assistant.remove(profileId, store.assistantChat.messageIdsOf(chatId));
      return DONE_REPLY;
    }),
  };
}

function fileRoutes(
  context: ServerContext,
): Pick<
  AssistantChatRoutes,
  | 'startAssistantUpload'
  | 'sendAssistantUploadChunk'
  | 'finishAssistantUpload'
  | 'assistantAttachmentLinks'
> {
  const { store, assistant, links } = context;
  return {
    startAssistantUpload: bound(E.startAssistantUpload, ({ body, caller }) =>
      assistant.files.start({ ...body, profileId: profileIdOf(store, caller) }),
    ),
    sendAssistantUploadChunk: bound(
      E.sendAssistantUploadChunk,
      async ({ params, body, caller }) => ({
        received: await assistant.files.chunk(
          profileIdOf(store, caller),
          params.uploadId,
          body.index,
          body.data,
        ),
      }),
    ),
    finishAssistantUpload: bound(E.finishAssistantUpload, async ({ params, caller }) => {
      const file = await assistant.files.finish(profileIdOf(store, caller), params.uploadId);
      return {
        id: file.id,
        name: file.name,
        mime: file.mime,
        bytes: file.bytes,
        width: file.width,
        height: file.height,
      };
    }),
    assistantAttachmentLinks: bound(E.assistantAttachmentLinks, ({ body, caller }) => {
      const profileId = profileIdOf(store, caller);
      return body.ids.map((id) => {
        if (store.assistantChat.attachment(id).profile_id !== profileId) {
          throw new ApiError('forbidden', 'That attachment belongs to another person’s chat.');
        }
        return { id, ...links.assistantAttachment(id) };
      });
    }),
  };
}

function settingsRoutes(
  context: ServerContext,
): Pick<AssistantChatRoutes, 'updateAssistantSettings' | 'postAssistant'> {
  const { assistant } = context;
  return {
    updateAssistantSettings: bound(E.updateAssistantSettings, ({ body }) => assistant.update(body)),
    postAssistant: bound(E.postAssistant, ({ body, caller }) =>
      assistant.post(body, local(caller)),
    ),
  };
}

export function assistantChatRoutes(context: ServerContext): AssistantChatRoutes {
  return {
    ...chatRoutes(context),
    ...fileRoutes(context),
    ...settingsRoutes(context),
  };
}
