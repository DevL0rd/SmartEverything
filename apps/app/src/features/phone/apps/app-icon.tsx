import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Text } from '../../../components/text';
import { usePhoneIcon } from '../data/phone-icons';

const ICON_SIZES = { s: 'size-6', m: 'size-8', l: 'size-10' } as const;

export type AppIconSize = keyof typeof ICON_SIZES;

export function initialOf(label: string): string {
  const first = Array.from(label.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}

export function AppIcon({
  label,
  iconHash,
  size = 'm',
}: {
  readonly label: string;
  readonly iconHash: string | null;
  readonly size?: AppIconSize;
}): ReactNode {
  const uri = usePhoneIcon(iconHash);
  const frame = `${ICON_SIZES[size]} items-center justify-center overflow-hidden rounded-md bg-surface-3`;
  return (
    <View aria-hidden className={frame}>
      {uri === null ? (
        <Text variant="callout" tone="variant">
          {initialOf(label)}
        </Text>
      ) : (
        <Image source={{ uri }} className="size-full" resizeMode="cover" />
      )}
    </View>
  );
}
