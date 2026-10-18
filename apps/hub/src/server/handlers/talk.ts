import {
  API_ENDPOINTS as E,
  ApiError,
  type TalkMemberKind,
  type TalkNewMember,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { memberLabel } from '../../talk/labels';
import { recentTalkMessages } from '../../talk/recent-messages';
import { clientOf, ownerOrSelf, type Caller } from '../auth';
import { assertChannelReach, channelHidden, scopesOfCaller } from '../person-scope';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

interface MemberParams {
  readonly channelId: string;
  readonly memberKind: TalkMemberKind;
  readonly memberId: string;
}

function addMember(store: Store, channelId: string, member: TalkNewMember): void {
  store.talk.setMember(
    { channelId, kind: member.member_kind, memberId: member.member_id },
    member.listening ?? member.member_kind === 'client',
    memberLabel(store, member.member_kind, member.member_id),
  );
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
    readTalk: bound(E.readTalk, ({ query, caller }) => {
      const scope = scopesOfCaller(store, caller)?.channels ?? null;
      const channels = store.talk.channels().filter((row) => !channelHidden(scope, row.id));
      return {
        channels,
        members: store.talk.members().filter((row) => !channelHidden(scope, row.channel_id)),
        messages: recentTalkMessages(store.talk, channels, query.messages),
        ...talk.presence(),
      };
    }),
    createTalkChannel: bound(E.createTalkChannel, ({ body }) =>
      store.write(() => {
        const { members, ...channel } = body;
        const row = store.talk.createChannel(channel);
        members.forEach((member) => {
          addMember(store, row.id, member);
        });
        return row;
      }),
    ),
    updateTalkChannel: bound(E.updateTalkChannel, ({ params, body }) =>
      store.talk.updateChannel(params.channelId, body),
    ),
    removeTalkChannel: bound(E.removeTalkChannel, async ({ params }) => {
      await talk.recorder.discard(store.talk.removeChannel(params.channelId));
      return DONE_REPLY;
    }),
  }) as const;

const memberRoutes = ({ store }: ServerContext) =>
  ({
    setTalkMember: bound(E.setTalkMember, ({ params, body, caller }) => {
      mayChange(caller, params);
      assertChannelReach(store, caller, params.channelId);
      return store.talk.setMember(
        keyOf(params),
        body.listening,
        memberLabel(store, params.memberKind, params.memberId),
      );
    }),
    removeTalkMember: bound(E.removeTalkMember, ({ params, caller }) => {
      mayChange(caller, params);
      assertChannelReach(store, caller, params.channelId);
      store.talk.removeMember(keyOf(params));
      return DONE_REPLY;
    }),
  }) as const;

const messageRoutes = ({ store, talk, links }: ServerContext) =>
  ({
    listTalkMessages: bound(E.listTalkMessages, ({ query, caller }) => {
      const scope = scopesOfCaller(store, caller)?.channels ?? null;
      return store.talk.messages(query).filter((row) => !channelHidden(scope, row.channel_id));
    }),
    talkMessageLinks: bound(E.talkMessageLinks, ({ body, caller }) =>
      body.ids.map((id) => {
        const message = store.talk.message(id);
        assertChannelReach(store, caller, message.channel_id);
        if (message.storage_path === null) {
          throw new ApiError('not_found', `The message ${id} has no saved audio.`);
        }
        return { id, ...links.talkMessage(id) };
      }),
    ),
    removeTalkMessage: bound(E.removeTalkMessage, async ({ params }) => {
      await talk.recorder.discard([store.talk.removeMessage(params.messageId)]);
      return DONE_REPLY;
    }),
  }) as const;

export const talkRoutes = (context: ServerContext) =>
  ({
    ...channelRoutes(context),
    ...memberRoutes(context),
    ...messageRoutes(context),
  }) as const;
