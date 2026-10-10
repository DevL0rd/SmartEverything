import type { ReactNode } from 'react';
import type { TalkChannelRow, TalkMemberRow } from '@smarteverything/domain';
import { removeTalkMember, setTalkMember, type TalkMemberTarget } from '../../../api/talk';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { useRows, useSession } from '../../../store/selectors';
import { useTalkChannels } from '../data/talk-data';

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

function rowsFor(
  channel: TalkChannelRow,
  membership: TalkMemberRow | undefined,
  target: TalkMemberTarget,
): ReactNode[] {
  const join = (
    <SwitchRow
      key={channel.id}
      title={channel.name}
      icon={channel.icon}
      value={membership !== undefined}
      onChange={(joining) => {
        (joining ? setTalkMember(target, true) : removeTalkMember(target)).catch(
          failed(joining ? 'Couldn’t join the channel' : 'Couldn’t leave the channel'),
        );
      }}
    />
  );
  if (membership === undefined) {
    return [join];
  }
  return [
    join,
    <SwitchRow
      key={`${channel.id}/sound`}
      title="Play sound"
      icon="speaker"
      subtitle={`Hear ${channel.name} on this device`}
      value={membership.listening}
      onChange={(listening) => {
        setTalkMember(target, listening).catch(failed('Sound not changed'));
      }}
    />,
  ];
}

export function TalkMembershipRows(): ReactNode {
  const channels = useTalkChannels();
  const clientId = useSession().client.id;
  const mine = new Map(
    useRows('talk_members')
      .filter((member) => member.member_kind === 'client' && member.member_id === clientId)
      .map((member) => [member.channel_id, member]),
  );
  if (channels.length === 0) {
    return null;
  }
  return (
    <List title="Channels on this device" inset>
      {channels.flatMap((channel) =>
        rowsFor(channel, mine.get(channel.id), {
          channelId: channel.id,
          kind: 'client',
          memberId: clientId,
        }),
      )}
    </List>
  );
}
