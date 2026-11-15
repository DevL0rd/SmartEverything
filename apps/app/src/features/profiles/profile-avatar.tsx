import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ProfileRow } from '@smarteverything/domain';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import { ACCENT_SWATCH } from '../../design/tokens';
import { initialsOf } from '../../format/text';

const SIZES = { s: 'size-6', m: 'size-8', nav: 'size-10', l: 'size-12' } as const;

const TEXT = { s: 'caption', m: 'label', nav: 'label', l: 'title-3' } as const;

export function ProfileAvatar({
  profile,
  size = 'm',
}: {
  readonly profile: Pick<ProfileRow, 'name' | 'colour'>;
  readonly size?: keyof typeof SIZES;
}): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        'items-center justify-center rounded-full',
        SIZES[size],
        ACCENT_SWATCH[profile.colour],
      )}
    >
      <Text variant={TEXT[size]} tone="onPrimary">
        {initialsOf(profile.name)}
      </Text>
    </View>
  );
}
