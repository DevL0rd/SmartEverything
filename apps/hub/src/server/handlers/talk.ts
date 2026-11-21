import { API_ENDPOINTS as E, ApiError, type TalkMemberKind } from '@smarteverything/domain';
import { clientOf, ownerOrSelf, type Caller } from '../auth';
import { assertChannelReach, callerScopes, presenceInScope } from '../person-scope';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

interface MemberParams {
  readonly channelId: string;
  readonly memberKind: TalkMemberKind;
  readonly memberId: string;
}

function mayChange(caller: Caller, params: MemberParams): void {
  const client = clientOf(caller);
  const self = params.memberKind === 'client' && params.memberId === client.id;
  ownerOrSelf(client.role, self);
}

function keyOf(params: MemberParams): {
  channelId: string;
  kind: TalkMemberKind;
  memberId: string;
} {
  return { channelId: params.channelId, kind: params.memberKind, memberId: params.memberId };
}

const channelRoutes = ({ store, talk }: ServerContext) =>
  ({
    readTalk: bound(E.readTalk, async ({ query, caller }) => {
      const scope = (await callerScopes(store, caller))?.channels ?? null;
      const view = await store.host.read('talkView', { scope, messages: query.messages });
      return { ...view, ...presenceInScope(scope, talk.presence()) };
    }),
    createTalkChannel: bound(E.createTalkChannel, ({ body }) =>
      store.host.write('talkChannelCreate', body),
    ),
    updateTalkChannel: bound(E.updateTalkChannel, ({ params, body }) =>
      store.host.call('talk', 'updateChannel', params.channelId, body),
    ),
    removeTalkChannel: bound(E.removeTalkChannel, async ({ params }) => {
      await talk.recorder.discard(await store.host.call('talk', 'removeChannel', params.channelId));
      return DONE_REPLY;
    }),
  }) as const;

const memberRoutes = ({ store }: ServerContext) =>
  ({
    setTalkMember: bound(E.setTalkMember, async ({ params, body, caller }) => {
      mayChange(caller, params);
      const scope = (await callerScopes(store, caller))?.channels ?? null;
      assertChannelReach(store, caller, scope, params.channelId);
      return store.host.write('talkMemberSet', { key: keyOf(params), listening: body.listening });
    }),
    removeTalkMember: bound(E.removeTalkMember, async ({ params, caller }) => {
      mayChange(caller, params);
      const scope = (await callerScopes(store, caller))?.channels ?? null;
      assertChannelReach(store, caller, scope, params.channelId);
      await store.host.call('talk', 'removeMember', keyOf(params));
      return DONE_REPLY;
    }),
  }) as const;

const messageRoutes = ({ store, talk, links }: ServerContext) =>
  ({
    listTalkMessages: bound(E.listTalkMessages, async ({ query, caller }) => {
      const scope = (await callerScopes(store, caller))?.channels ?? null;
      return store.host.read('talkMessages', { scope, query });
    }),
    talkMessageLinks: bound(E.talkMessageLinks, async ({ body, caller }) => {
      const scope = (await callerScopes(store, caller))?.channels ?? null;
      const messages = await Promise.all(
        body.ids.map((id) => store.host.call('talk', 'message', id)),
      );
      return messages.map((message) => {
        assertChannelReach(store, caller, scope, message.channel_id);
        if (message.storage_path === null) {
          throw new ApiError('not_found', `The message ${message.id} has no saved audio.`);
        }
        return { id: message.id, ...links.talkMessage(message.id) };
      });
    }),
    removeTalkMessage: bound(E.removeTalkMessage, async ({ params }) => {
      await talk.recorder.discard([
        await store.host.call('talk', 'removeMessage', params.messageId),
      ]);
      return DONE_REPLY;
    }),
  }) as const;

export const talkRoutes = (context: ServerContext) =>
  ({
    ...channelRoutes(context),
    ...memberRoutes(context),
    ...messageRoutes(context),
  }) as const;
