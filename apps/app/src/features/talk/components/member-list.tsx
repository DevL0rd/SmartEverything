import type { ReactNode } from 'react';
import type { TalkMemberRow } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { useSession } from '../../../store/selectors';
import { useChannelMembers, useFloor, useOnlineClients } from '../data/talk-data';
import { talkEngine } from '../engine/engine';
import { useTalkEngine } from '../engine/engine-state';

function ListenButton({ member }: { readonly member: TalkMemberRow }): ReactNode {
  const engine = useTalkEngine();
  const mine = engine.transmit.cameraId === member.member_id;
  const usable = engine.link === 'ready' && (engine.transmit.status === 'idle' || mine);
  return (
    <Interactive
      role="button"
      label={mine ? `Stop listening to ${member.label}` : `Listen to ${member.label}`}
      hint="Plays what the camera hears to everyone on the channel"
      disabled={!usable}
      selected={mine}
      onPress={() => {
        if (mine) {
          talkEngine.release();
        } else {
          talkEngine.listen(member.channel_id, member.member_id);
        }
      }}
      className={
        mine
          ? 'min-h-touch-min flex-row items-center gap-2 rounded-full bg-primary px-4'
          : 'min-h-touch-min flex-row items-center gap-2 rounded-full bg-surface-3 px-4'
      }
      onTone={mine ? 'primary' : 'surface'}
    >
      <Icon name="audioLines" size={16} tone={mine ? 'onPrimary' : 'default'} />
      <Text variant="label" tone={mine ? 'onPrimary' : 'default'}>
        {mine ? 'Stop' : 'Listen'}
      </Text>
    </Interactive>
  );
}

function statusOf(member: TalkMemberRow, talking: boolean, online: boolean, self: boolean): string {
  if (talking) {
    return 'Talking';
  }
  if (member.member_kind === 'camera') {
    return member.listening ? 'Plays the channel' : 'Speaker off';
  }
  return joinParts([
    self ? 'This device' : null,
    online ? 'Online' : 'Offline',
    member.listening ? null : 'Muted',
  ]);
}

export function MemberList({ channelId }: { readonly channelId: string }): ReactNode {
  const members = useChannelMembers(channelId);
  const floor = useFloor(channelId);
  const online = useOnlineClients();
  const self = useSession().client.id;
  return (
    <List title="Members" inset>
      {members.map((member) => {
        const talking = floor?.speaker.id === member.member_id;
        const isOnline = online.has(member.member_id);
        return (
          <ListRow
            key={`${member.member_kind}/${member.member_id}`}
            title={member.label}
            subtitle={joinParts([
              member.detail,
              statusOf(member, talking, isOnline, member.member_id === self),
            ])}
            subtitleTone={talking ? 'primary' : 'variant'}
            icon={member.member_kind === 'camera' ? 'camera' : 'user'}
            iconTone={talking || isOnline ? 'primary' : 'faint'}
            trailing={member.member_kind === 'camera' ? <ListenButton member={member} /> : null}
          />
        );
      })}
    </List>
  );
}
