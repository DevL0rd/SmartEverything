import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useVisibleLive } from '../../design/use-visible-live';

export function LiveCell({
  children,
}: {
  readonly children: (live: boolean) => ReactNode;
}): ReactNode {
  const frame = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(frame);
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      collapsable={false}
      className="flex-1"
      pointerEvents="box-none"
    >
      {children(live)}
    </View>
  );
}
