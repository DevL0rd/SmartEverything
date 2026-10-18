import { API_ENDPOINTS as E, DEFAULT_RESPONSE_STYLE } from '@smarteverything/domain';
import { chatOwnerOf, clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import { wireMessages } from '../../assistant/wire-message';

function local(caller: Caller): boolean {
  return caller.kind === 'client' && caller.via === 'assistant' && caller.local === true;
}

const chatRoutes = ({ store, assistant }: ServerContext) =>
  ({
    readAssistant: bound(E.readAssistant, () => assistant.status()),
    listAssistantMessages: bound(E.listAssistantMessages, ({ query, caller }) =>
      wireMessages(
        assistant.messages(
          assistant.chats.chatOf(chatOwnerOf(store, caller)).id,
          query.before,
          query.limit,
        ),
      ),
    ),
    sendAssistantMessage: bound(E.sendAssistantMessage, ({ body, caller }) =>
      assistant.submissions.send(
        caller,
        { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) },
        body,
        assistant.chats.chatOf(chatOwnerOf(store, caller)).id,
      ),
    ),
    removeAssistantMessage: bound(E.removeAssistantMessage, async ({ params, caller }) => {
      await assistant.remove(chatOwnerOf(store, caller), [params.messageId]);
      return DONE_REPLY;
    }),
    clearAssistantMessages: bound(E.clearAssistantMessages, async ({ caller }) => {
      const owner = chatOwnerOf(store, caller);
      await assistant.remove(
        owner,
        store.assistantChat.messageIdsOf(assistant.chats.chatOf(owner).id),
      );
      return DONE_REPLY;
    }),
  }) as const;

const fileRoutes = ({ store, assistant, links }: ServerContext) =>
  ({
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
      const owner = chatOwnerOf(store, caller);
      return body.ids.map((id) => {
        assistant.chats.attachment(owner, id);
        return { id, ...links.assistantAttachment(id) };
      });
    }),
  }) as const;

const settingsRoutes = ({ assistant, store }: ServerContext) =>
  ({
    readAssistantResponseStyle: bound(
      E.readAssistantResponseStyle,
      () => assistant.settings().response_style ?? DEFAULT_RESPONSE_STYLE,
    ),
    updateAssistantSettings: bound(E.updateAssistantSettings, ({ body }) => assistant.update(body)),
    postAssistant: bound(E.postAssistant, ({ body, caller }) => {
      const owner = chatOwnerOf(store, caller);
      return assistant.post(body, local(caller) && owner.role === 'owner', owner);
    }),
  }) as const;

export const assistantChatRoutes = (context: ServerContext) =>
  ({
    ...chatRoutes(context),
    ...fileRoutes(context),
    ...settingsRoutes(context),
  }) as const;
