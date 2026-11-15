import type { ProfileRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ACCENT_SWATCH } from '../../../design/tokens';
import { initialsOf } from '../../../format/text';

const SIZES = { xs: 'size-5', s: 'size-7', m: 'size-8' } as const;

export type PersonBadgeSize = keyof typeof SIZES;

export function PersonBadge({
  profile,
  name,
  size = 's',
}: {
  readonly profile: Pick<ProfileRow, 'name' | 'colour'> | null;
  readonly name: string;
  readonly size?: PersonBadgeSize;
}): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        'items-center justify-center rounded-full',
        SIZES[size],
        profile === null ? 'bg-surface-3' : ACCENT_SWATCH[profile.colour],
      )}
    >
      {profile === null ? (
        <Icon name="atSign" size={size === 'xs' ? 12 : 14} tone="variant" />
      ) : (
        <Text variant="caption" tone="onPrimary">
          {size === 'xs' ? initialsOf(name).slice(0, 1) : initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
