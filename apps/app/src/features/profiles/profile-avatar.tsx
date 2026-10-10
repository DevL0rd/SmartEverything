import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ProfileRow } from '@smarteverything/domain';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import { ACCENT_SWATCH } from '../../design/tokens';
import { initialsOf } from '../../format/text';

const SIZES = { m: 'size-8', nav: 'size-10', l: 'size-12' } as const;

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
      <Text variant={size === 'l' ? 'title-3' : 'label'} tone="onPrimary">
        {initialsOf(profile.name)}
      </Text>
    </View>
  );
}
