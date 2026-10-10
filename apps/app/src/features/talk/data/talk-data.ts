import type {
  TalkChannelRow,
  TalkFloor,
  TalkMemberRow,
  TalkMessageRow,
} from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { useRow, useRows, useSession } from '../../../store/selectors';

export function useTalkChannels(): readonly TalkChannelRow[] {
  return useRows('talk_channels');
}

export function useTalkChannel(channelId: string | null): TalkChannelRow | null {
  return useRow('talk_channels', channelId);
}

export function useChannelMembers(channelId: string): readonly TalkMemberRow[] {
  return useRows('talk_members').filter((member) => member.channel_id === channelId);
}

export function useOwnMembership(channelId: string): TalkMemberRow | null {
  const clientId = useSession().client.id;
  return (
    useChannelMembers(channelId).find(
      (member) => member.member_kind === 'client' && member.member_id === clientId,
    ) ?? null
  );
}

export function useMyChannels(): readonly TalkChannelRow[] {
  const clientId = useSession().client.id;
  const mine = new Set(
    useRows('talk_members')
      .filter((member) => member.member_kind === 'client' && member.member_id === clientId)
      .map((member) => member.channel_id),
  );
  return useTalkChannels().filter((channel) => mine.has(channel.id));
}

export function useFloors(): readonly TalkFloor[] {
  return useStoreSelector((state) => state.talkPresence.floors);
}

export function useFloor(channelId: string): TalkFloor | null {
  return useFloors().find((floor) => floor.channelId === channelId) ?? null;
}

export function useOnlineClients(): ReadonlySet<string> {
  return new Set(useStoreSelector((state) => state.talkPresence.online));
}

export function useChannelMessages(channelId: string): readonly TalkMessageRow[] {
  return useRows('talk_messages').filter(
    (message) => message.channel_id === channelId && message.duration_ms !== null,
  );
}

export function useLastMessage(channelId: string): TalkMessageRow | null {
  return useChannelMessages(channelId)[0] ?? null;
}
