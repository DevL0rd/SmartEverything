import { joinParts, plural } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useChannelMembers, useFloor, useLastMessage } from './talk-data';

export interface ChannelActivity {
  readonly line: string;
  readonly live: boolean;
}

export function useChannelActivity(channelId: string): ChannelActivity {
  const floor = useFloor(channelId);
  const last = useLastMessage(channelId);
  const members = useChannelMembers(channelId).length;
  const now = useMinute();
  if (floor !== null) {
    const verb = floor.kind === 'listen' ? 'is listening in' : 'is talking';
    return { line: `${floor.speaker.label} ${verb}`, live: true };
  }
  if (last !== null) {
    return { line: joinParts([last.speaker_label, relative(last.started_at, now)]), live: false };
  }
  return { line: plural(members, 'member'), live: false };
}
