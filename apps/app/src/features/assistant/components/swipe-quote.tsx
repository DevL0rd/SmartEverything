import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '../../../components/icon';
import { DURATION, useMotion } from '../../../design/motion';
import { selectionTick } from '../../../platform/haptics';

const ARM_PX = 56;

function useArmed(translation: SharedValue<number>, reduced: boolean): SharedValue<number> {
  const armed = useSharedValue(0);
  useAnimatedReaction(
    () => translation.get() >= ARM_PX,
    (isArmed, wasArmed) => {
      if (isArmed === wasArmed) {
        return;
      }
      const target = isArmed ? 1 : 0;
      armed.set(reduced ? target : withTiming(target, { duration: DURATION.fast }));
      if (isArmed) {
        scheduleOnRN(selectionTick);
      }
    },
    [reduced],
  );
  return armed;
}

function Ghost({ translation }: { readonly translation: SharedValue<number> }): ReactNode {
  const { reduced } = useMotion();
  const armed = useArmed(translation, reduced);
  const grow = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(translation.get(), [0, ARM_PX], [0.6, 1], Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(translation.get(), [0, ARM_PX / 2], [0, 1], Extrapolation.CLAMP),
  }));
  const fill = useAnimatedStyle(() => ({ opacity: armed.get() }));
  return (
    <View className="w-18 items-start justify-start pl-2 pt-1">
      <Animated.View
        style={grow}
        className="size-10 items-center justify-center overflow-hidden rounded-full bg-surface-3"
      >
        <Animated.View style={fill} className="absolute inset-0 bg-primary" />
        <Icon name="reply" size={20} tone="variant" />
      </Animated.View>
    </View>
  );
}

export function SwipeToQuote({
  onQuote,
  enabled = true,
  children,
}: {
  readonly onQuote: () => void;
  readonly enabled?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      leftThreshold={ARM_PX}
      overshootLeft={false}
      overshootRight={false}
      friction={1.4}
      renderLeftActions={(_progress, translation) => <Ghost translation={translation} />}
      onSwipeableOpen={(direction) => {
        if (direction === SwipeDirection.RIGHT) {
          onQuote();
        }
        ref.current?.close();
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
