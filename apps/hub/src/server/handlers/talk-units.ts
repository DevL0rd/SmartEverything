import type { ChannelScope, TalkNewChannel } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { MemberKey, MessageQuery } from '../../store/repositories/talk';
import { memberLabel } from '../../talk/labels';
import { recentTalkMessages } from '../../talk/recent-messages';
import { channelHidden } from '../person-scope';

export const TALK_READ_UNITS = {
  talkView: storeUnit(
    (store, input: { readonly scope: ChannelScope | null; readonly messages: number }) => {
      const channels = store.talk.channels().filter((row) => !channelHidden(input.scope, row.id));
      return {
        channels,
        members: store.talk.members().filter((row) => !channelHidden(input.scope, row.channel_id)),
        messages: recentTalkMessages(store.talk, channels, input.messages),
      };
    },
  ),
  talkMessages: storeUnit(
    (store, input: { readonly scope: ChannelScope | null; readonly query: MessageQuery }) =>
      store.talk.messages(input.query).filter((row) => !channelHidden(input.scope, row.channel_id)),
  ),
} as const;

export const TALK_WRITE_UNITS = {
  talkChannelCreate: storeUnit((store, body: TalkNewChannel) => {
    const { members, ...channel } = body;
    const row = store.talk.createChannel(channel);
    for (const member of members) {
      store.talk.setMember(
        { channelId: row.id, kind: member.member_kind, memberId: member.member_id },
        member.listening ?? member.member_kind === 'client',
        memberLabel(store, member.member_kind, member.member_id),
      );
    }
    return row;
  }),
  talkMemberSet: storeUnit(
    (store, input: { readonly key: MemberKey; readonly listening: boolean }) =>
      store.talk.setMember(
        input.key,
        input.listening,
        memberLabel(store, input.key.kind, input.key.memberId),
      ),
  ),
} as const;
