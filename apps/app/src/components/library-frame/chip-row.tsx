import type { ReactNode } from 'react';
import { View } from 'react-native';
import { HScroller } from '../h-scroller';

export function ChipRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="-mx-gutter">
      <HScroller label={label} fade fadeSurface="bg">
        <View className="flex-row items-center gap-2 px-gutter">{children}</View>
      </HScroller>
    </View>
  );
}
