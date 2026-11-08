import type { ReactNode } from 'react';
import { View } from 'react-native';
import { HScroller } from '../../../components/h-scroller';

export function ChipRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <HScroller label={label} fade fadeSurface="bg">
      <View className="flex-row items-center gap-2">{children}</View>
    </HScroller>
  );
}
