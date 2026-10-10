import type { TalkChannelRow } from '@smarteverything/domain';
import { localPref, setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { useMyChannels } from './talk-data';

export function talkChannelOf(
  channels: readonly Pick<TalkChannelRow, 'id'>[],
  chosen: string,
): string | null {
  return channels.find((channel) => channel.id === chosen)?.id ?? channels[0]?.id ?? null;
}

export function useTalkChannelId(): string | null {
  return talkChannelOf(useMyChannels(), useLocalPref('talkChannel'));
}

export function chooseTalkChannel(channelId: string): void {
  setLocalPref('talkChannel', channelId);
}

export function nextTalkChannel(channels: readonly Pick<TalkChannelRow, 'id'>[]): string | null {
  const current = talkChannelOf(channels, localPref('talkChannel'));
  const index = channels.findIndex((channel) => channel.id === current);
  const next = channels[(index + 1) % Math.max(1, channels.length)]?.id ?? null;
  if (next !== null) {
    chooseTalkChannel(next);
  }
  return next;
}
