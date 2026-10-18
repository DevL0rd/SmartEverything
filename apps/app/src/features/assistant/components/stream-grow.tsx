import { useCallback, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { GROW_MS, growHeight } from '../model/stream-grow';

export function StreamGrow({
  smooth,
  children,
}: {
  readonly smooth: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const [measured, setMeasured] = useState<number | null>(null);
  if (!smooth && measured !== null) setMeasured(null);
  const onLayout = useCallback((event: LayoutChangeEvent): void => {
    setMeasured(event.nativeEvent.layout.height);
  }, []);
  const height = growHeight(smooth, measured);
  return (
    <Animated.View
      style={
        height === null
          ? undefined
          : {
              height,
              transitionProperty: 'height',
              transitionDuration: GROW_MS,
              transitionTimingFunction: 'ease-out',
            }
      }
    >
      <View
        className={height === null ? '' : 'absolute inset-x-0 top-0'}
        {...(smooth ? { onLayout } : {})}
      >
        {children}
      </View>
    </Animated.View>
  );
}
