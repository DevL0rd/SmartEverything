import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { initialsOf } from '../../../format/text';
import { useChannelMembers, useFloor, useOnlineClients } from '../data/talk-data';

const SHOWN = 5;

export function MemberStrip({ channelId }: { readonly channelId: string }): ReactNode {
  const members = useChannelMembers(channelId);
  const floor = useFloor(channelId);
  const online = useOnlineClients();
  const extra = members.length - SHOWN;
  return (
    <View className="flex-row items-center gap-1">
      {members.slice(0, SHOWN).map((member) => {
        const talking = floor?.speaker.id === member.member_id;
        const live = talking || online.has(member.member_id);
        return (
          <View
            key={`${member.member_kind}/${member.member_id}`}
            aria-label={member.label}
            className={
              talking
                ? 'size-8 items-center justify-center rounded-full bg-primary'
                : 'size-8 items-center justify-center rounded-full bg-surface-2'
            }
          >
            <Text variant="caption" tone={talking ? 'onPrimary' : live ? 'default' : 'faint'}>
              {initialsOf(member.label)}
            </Text>
          </View>
        );
      })}
      {extra > 0 ? (
        <Text variant="caption" tone="variant">
          +{String(extra)}
        </Text>
      ) : null}
    </View>
  );
}
