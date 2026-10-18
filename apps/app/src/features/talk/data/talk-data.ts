import type {
  TalkChannelRow,
  TalkFloor,
  TalkMemberRow,
  TalkMessageRow,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { useRow, useRows } from '../../../store/selectors';

const selectClientId = (state: StoreState): string | null => state.session?.client.id ?? null;

function useClientId(): string | null {
  return useStoreSelector(selectClientId);
}

export function useTalkChannels(): readonly TalkChannelRow[] {
  return useRows('talk_channels');
}

export function useTalkChannel(channelId: string | null): TalkChannelRow | null {
  return useRow('talk_channels', channelId);
}

export function useChannelMembers(channelId: string): readonly TalkMemberRow[] {
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.talk_members).filter((member) => member.channel_id === channelId),
    shallowEqual,
    [channelId],
  );
}

export function useOwnMembership(channelId: string): TalkMemberRow | null {
  const clientId = useClientId();
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.talk_members).find(
        (member) =>
          member.channel_id === channelId &&
          member.member_kind === 'client' &&
          member.member_id === clientId,
      ) ?? null,
    Object.is,
    [channelId, clientId],
  );
}

export function useMyChannels(): readonly TalkChannelRow[] {
  const clientId = useClientId();
  return useStoreSelector(
    (state) => {
      const mine = new Set(
        rowsOf(state.tables.talk_members)
          .filter((member) => member.member_kind === 'client' && member.member_id === clientId)
          .map((member) => member.channel_id),
      );
      return rowsOf(state.tables.talk_channels).filter((channel) => mine.has(channel.id));
    },
    shallowEqual,
    [clientId],
  );
}

export function useFloor(channelId: string): TalkFloor | null {
  return useStoreSelector(
    (state) => state.talkPresence.floors.find((floor) => floor.channelId === channelId) ?? null,
    Object.is,
    [channelId],
  );
}

const selectOnline = (state: StoreState): readonly string[] => state.talkPresence.online;

export function useOnlineClients(): ReadonlySet<string> {
  const online = useStoreSelector(selectOnline);
  return useMemo(() => new Set(online), [online]);
}

export function useChannelMessages(channelId: string): readonly TalkMessageRow[] {
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.talk_messages).filter(
        (message) => message.channel_id === channelId && message.duration_ms !== null,
      ),
    shallowEqual,
    [channelId],
  );
}

export function useLastMessage(channelId: string): TalkMessageRow | null {
  return useChannelMessages(channelId)[0] ?? null;
}
