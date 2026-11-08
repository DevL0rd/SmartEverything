import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { initialsOf } from '../../../format/text';
import { useChannelMembers, useFloor, useOnlineClients } from '../data/talk-data';

import { AVATAR_GAP, AVATAR_SIZE, membersShown } from './layout';

const AVATAR = { width: AVATAR_SIZE, height: AVATAR_SIZE };

export function MemberStrip({
  channelId,
  width,
}: {
  readonly channelId: string;
  readonly width: number;
}): ReactNode {
  const members = useChannelMembers(channelId);
  const floor = useFloor(channelId);
  const online = useOnlineClients();
  const shown = membersShown(members.length, width, useIdiom());
  const extra = members.length - shown;
  if (members.length === 0) return null;
  return (
    <View className="flex-row items-center" style={{ gap: AVATAR_GAP }}>
      {members.slice(0, shown).map((member) => {
        const talking = floor?.speaker.id === member.member_id;
        const live = talking || online.has(member.member_id);
        return (
          <View
            key={`${member.member_kind}/${member.member_id}`}
            aria-label={member.label}
            style={AVATAR}
            className={
              talking
                ? 'shrink-0 items-center justify-center rounded-full bg-primary'
                : 'shrink-0 items-center justify-center rounded-full bg-surface-2'
            }
          >
            <Text variant="caption" tone={talking ? 'onPrimary' : live ? 'default' : 'faint'}>
              {initialsOf(member.label)}
            </Text>
          </View>
        );
      })}
      {extra > 0 ? (
        <Text variant="caption" tone="variant" accessibilityLabel={`${String(extra)} more members`}>
          +{String(extra)}
        </Text>
      ) : null}
    </View>
  );
}
