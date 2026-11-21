import { API_ENDPOINTS as E, DEFAULT_RESPONSE_STYLE } from '@smarteverything/domain';
import { chatOwnerOf, clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import { postHelperArtifacts } from '../../assistant/delegation/helper-artifact-post';
import { wireMessages } from '../../assistant/wire-message';

function local(caller: Caller): boolean {
  return caller.kind === 'client' && caller.via === 'assistant' && caller.local === true;
}

const chatRoutes = ({ store, assistant }: ServerContext) =>
  ({
    readAssistant: bound(E.readAssistant, () => assistant.status()),
    listAssistantMessages: bound(E.listAssistantMessages, async ({ query, caller }) =>
      wireMessages(
        await assistant.messages(
          (await assistant.chats.chatOf(chatOwnerOf(caller))).id,
          query.before,
          query.limit,
        ),
      ),
    ),
    sendAssistantMessage: bound(E.sendAssistantMessage, async ({ body, caller }) =>
      assistant.submissions.send(
        caller,
        { clientId: clientOf(caller).id, profileId: profileIdOf(caller) },
        body,
        (await assistant.chats.chatOf(chatOwnerOf(caller))).id,
      ),
    ),
    removeAssistantMessage: bound(E.removeAssistantMessage, async ({ params, caller }) => {
      await assistant.remove(chatOwnerOf(caller), [params.messageId]);
      return DONE_REPLY;
    }),
    clearAssistantMessages: bound(E.clearAssistantMessages, async ({ caller }) => {
      const owner = chatOwnerOf(caller);
      await assistant.remove(
        owner,
        await store.host.call(
          'assistantChat',
          'messageIdsOf',
          (await assistant.chats.chatOf(owner)).id,
        ),
      );
      return DONE_REPLY;
    }),
  }) as const;

const fileRoutes = ({ assistant, links }: ServerContext) =>
  ({
    startAssistantUpload: bound(E.startAssistantUpload, ({ body, caller }) =>
      assistant.files.start({ ...body, profileId: profileIdOf(caller) }),
    ),
    sendAssistantUploadChunk: bound(
      E.sendAssistantUploadChunk,
      async ({ params, body, caller }) => ({
        received: await assistant.files.chunk(
          profileIdOf(caller),
          params.uploadId,
          body.index,
          body.data,
        ),
      }),
    ),
    finishAssistantUpload: bound(E.finishAssistantUpload, async ({ params, caller }) => {
      const file = await assistant.files.finish(profileIdOf(caller), params.uploadId);
      return {
        id: file.id,
        name: file.name,
        mime: file.mime,
        bytes: file.bytes,
        width: file.width,
        height: file.height,
        levels: file.levels,
      };
    }),
    assistantAttachmentLinks: bound(E.assistantAttachmentLinks, async ({ body, caller }) => {
      const owner = chatOwnerOf(caller);
      return await Promise.all(
        body.ids.map(async (id) => {
          await assistant.chats.attachment(owner, id);
          return { id, ...links.assistantAttachment(id) };
        }),
      );
    }),
  }) as const;

const settingsRoutes = ({ assistant, store }: ServerContext) =>
  ({
    readAssistantResponseStyle: bound(
      E.readAssistantResponseStyle,
      () => assistant.settings().response_style ?? DEFAULT_RESPONSE_STYLE,
    ),
    updateAssistantSettings: bound(E.updateAssistantSettings, ({ body }) => assistant.update(body)),
    postAssistantHelperArtifacts: bound(E.postAssistantHelperArtifacts, ({ body, caller }) =>
      postHelperArtifacts({ store, files: assistant.files }, caller, body),
    ),
    postAssistant: bound(E.postAssistant, ({ body, caller }) => {
      const owner = chatOwnerOf(caller);
      return assistant.post(body, local(caller) && owner.role === 'owner', owner);
    }),
  }) as const;

export const assistantChatRoutes = (context: ServerContext) =>
  ({
    ...chatRoutes(context),
    ...fileRoutes(context),
    ...settingsRoutes(context),
  }) as const;
