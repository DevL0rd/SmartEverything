import type { TalkChannelRow, TalkMessageRow } from '@smarteverything/domain';
import type { TalkRepository } from '../store/repositories/talk';

export function recentTalkMessages(
  repository: TalkRepository,
  channels: readonly TalkChannelRow[],
  perChannel: number,
): TalkMessageRow[] {
  return perChannel === 0
    ? []
    : channels.flatMap((channel) =>
        repository.messages({ channelId: channel.id, limit: perChannel }),
      );
}
