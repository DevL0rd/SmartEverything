import type { ReactNode } from 'react';
import { View } from 'react-native';
import { HScroller, type RevealRange } from './h-scroller';

export function ChipRow({
  label,
  reveal = null,
  children,
}: {
  readonly label: string;
  readonly reveal?: RevealRange | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="-mx-gutter">
      <HScroller label={label} fade reveal={reveal}>
        <View className="flex-row items-center gap-2 px-gutter">{children}</View>
      </HScroller>
    </View>
  );
}
