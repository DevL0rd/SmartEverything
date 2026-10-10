import {
  API_ENDPOINTS as E,
  ApiError,
  type TalkMemberKind,
  type TalkNewMember,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { memberLabel } from '../../talk/labels';
import { recentTalkMessages } from '../../talk/recent-messages';
import { clientOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type TalkRoutes = Record<
  | 'readTalk'
  | 'createTalkChannel'
  | 'updateTalkChannel'
  | 'removeTalkChannel'
  | 'setTalkMember'
  | 'removeTalkMember'
  | 'listTalkMessages'
  | 'talkMessageLinks'
  | 'removeTalkMessage',
  Bound
>;

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
  if (client.role !== 'owner' && !self) {
    throw new ApiError('forbidden', 'A paired device may change only its own channel membership.');
  }
}

function keyOf(params: MemberParams): {
  channelId: string;
  kind: TalkMemberKind;
  memberId: string;
} {
  return { channelId: params.channelId, kind: params.memberKind, memberId: params.memberId };
}

function channelRoutes(
  context: ServerContext,
): Pick<TalkRoutes, 'readTalk' | 'createTalkChannel' | 'updateTalkChannel' | 'removeTalkChannel'> {
  const { store, talk } = context;
  return {
    readTalk: bound(E.readTalk, ({ query }) => {
      const channels = store.talk.channels();
      return {
        channels,
        members: store.talk.members(),
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
  };
}

function memberRoutes(
  context: ServerContext,
): Pick<TalkRoutes, 'setTalkMember' | 'removeTalkMember'> {
  const { store } = context;
  return {
    setTalkMember: bound(E.setTalkMember, ({ params, body, caller }) => {
      mayChange(caller, params);
      return store.talk.setMember(
        keyOf(params),
        body.listening,
        memberLabel(store, params.memberKind, params.memberId),
      );
    }),
    removeTalkMember: bound(E.removeTalkMember, ({ params, caller }) => {
      mayChange(caller, params);
      store.talk.removeMember(keyOf(params));
      return DONE_REPLY;
    }),
  };
}

function messageRoutes(
  context: ServerContext,
): Pick<TalkRoutes, 'listTalkMessages' | 'talkMessageLinks' | 'removeTalkMessage'> {
  const { store, talk, links } = context;
  return {
    listTalkMessages: bound(E.listTalkMessages, ({ query }) => store.talk.messages(query)),
    talkMessageLinks: bound(E.talkMessageLinks, ({ body }) =>
      body.ids.map((id) => {
        const message = store.talk.message(id);
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
  };
}

export function talkRoutes(context: ServerContext): TalkRoutes {
  return { ...channelRoutes(context), ...memberRoutes(context), ...messageRoutes(context) };
}
