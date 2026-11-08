import { useEffect, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedRef,
} from 'react-native-reanimated';
import { EASING } from '../../../design/motion';
import { FADE_IN_MS } from '../visual/model-visual';

interface FaceProps {
  readonly frame: RefObject<View | null>;
  readonly positioned: AnimatedRef<View>;
  readonly onLayout: (() => void) | undefined;
  readonly drawn: boolean;
  readonly px: number;
  readonly still: ReactNode;
}

export function NativeModelFace({
  frame,
  positioned,
  onLayout,
  drawn,
  px,
  still,
}: FaceProps): ReactNode {
  const level = useSharedValue(1);
  useEffect(() => {
    level.set(withTiming(drawn ? 0 : 1, { duration: FADE_IN_MS, easing: EASING.fade }));
  }, [drawn, level]);
  const stillStyle = useAnimatedStyle(() => ({ opacity: level.get() }));
  const size = { width: px, height: px };
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={size}
    >
      <Animated.View
        ref={positioned}
        collapsable={false}
        className="absolute inset-0"
        style={stillStyle}
      >
        {still}
      </Animated.View>
    </View>
  );
}
