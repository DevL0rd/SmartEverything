import type { ReactNode } from 'react';
import type { TalkChannelRow, TalkMemberRow } from '@smarteverything/domain';
import { removeTalkMember, setTalkMember, type TalkMemberTarget } from '../../../api/talk';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useRows, useSession } from '../../../store/selectors';
import { useTalkChannels } from '../data/talk-data';

import { trackTalk } from '../data/talk-log';
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
        trackTalk(joining ? 'channel.join' : 'channel.leave', { channelId: channel.id }, () =>
          joining ? setTalkMember(target, true) : removeTalkMember(target),
        ).catch(
          notifyFailure(joining ? 'Couldn’t join the channel' : 'Couldn’t leave the channel'),
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
        trackTalk('channel.listening', { channelId: channel.id, listening }, () =>
          setTalkMember(target, listening),
        ).catch(notifyFailure('Sound not changed'));
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
