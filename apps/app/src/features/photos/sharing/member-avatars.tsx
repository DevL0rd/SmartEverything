import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ProfileRow } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';

export function profilesOf(
  ids: readonly string[],
  profiles: readonly ProfileRow[],
): readonly ProfileRow[] {
  return ids.flatMap((id) => profiles.filter((profile) => profile.id === id));
}

export function MemberAvatars({
  ids,
  shown,
  size = 'm',
}: {
  readonly ids: readonly string[];
  readonly shown: number;
  readonly size?: 'm' | 'l';
}): ReactNode {
  const people = profilesOf(ids, useProfiles());
  const visible = people.slice(0, shown);
  const more = people.length - visible.length;
  return (
    <View accessible={false} className="flex-row items-center">
      {visible.map((profile, index) => (
        <View
          key={profile.id}
          className={
            index === 0
              ? 'rounded-full border-2 border-surface-1'
              : '-ml-2 rounded-full border-2 border-surface-1'
          }
        >
          <ProfileAvatar profile={profile} size={size} />
        </View>
      ))}
      {more > 0 ? (
        <View className="-ml-2 size-8 items-center justify-center rounded-full border-2 border-surface-1 bg-surface-3">
          <Text variant="caption" className="tabular-nums">
            {`+${count(more)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
