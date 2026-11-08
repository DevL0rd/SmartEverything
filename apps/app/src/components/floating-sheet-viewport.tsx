import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { floatingSheetFrame } from './compact-panel';

export function FloatingSheetViewport({
  frame,
  children,
}: {
  readonly frame: ReturnType<typeof floatingSheetFrame>;
  readonly children: ReactNode;
}): ReactNode {
  const { left, width, bottom } = frame;
  const style = { left, width, bottom };
  return (
    <View
      pointerEvents="box-none"
      className="absolute top-0 overflow-hidden rounded-b-xl"
      style={style}
    >
      {children}
    </View>
  );
}
