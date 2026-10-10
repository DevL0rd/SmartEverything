import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
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
import { cn } from '../design/cn';
import { DURATION, useMotion } from '../design/motion';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useMeasuredWidth } from './use-measured-width';

export type SwipeTone = 'primary' | 'neutral' | 'critical';

export interface SwipeAction {
  readonly label: string;
  readonly icon: IconName;
  readonly tone: SwipeTone;
  readonly onCommit: () => void;
}

export interface SwipeRowProps {
  readonly leading?: SwipeAction | undefined;
  readonly trailing?: SwipeAction | undefined;
  readonly surface?: 'bg' | 'surface-1';
  readonly children: ReactNode;
}

const WELL_SPACE = 104;
const ARM_SHARE = 0.35;
const REST_SCALE = 0.8;

const FILL: Readonly<Record<SwipeTone, string>> = {
  primary: 'bg-primary',
  neutral: 'bg-on-surface-variant',
  critical: 'bg-critical',
};

const SURFACE = { bg: 'bg-bg', 'surface-1': 'bg-surface-1' } as const;

export function swipeAccessibility(
  leading: SwipeAction | undefined,
  trailing: SwipeAction | undefined,
): {
  readonly accessibilityActions: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
} {
  const actions = [leading, trailing].filter((action) => action !== undefined);
  return {
    accessibilityActions: actions.map((action) => ({ name: action.label, label: action.label })),
    onAccessibilityAction: (event): void => {
      actions.find((action) => action.label === event.nativeEvent.actionName)?.onCommit();
    },
  };
}

function useArmed(
  translation: SharedValue<number>,
  armAt: number,
  reduced: boolean,
): SharedValue<number> {
  const armed = useSharedValue(0);
  useAnimatedReaction(
    () => Math.abs(translation.get()) >= armAt && armAt > 0,
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
    [armAt, reduced],
  );
  return armed;
}

function WellFace({
  action,
  armed,
}: {
  readonly action: SwipeAction;
  readonly armed: SharedValue<number>;
}): ReactNode {
  const lit = useAnimatedStyle(() => ({ opacity: armed.get() }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - armed.get() }));
  return (
    <View className="items-center gap-0.5">
      <View>
        <Animated.View style={dim}>
          <Icon name={action.icon} size={24} tone="variant" />
        </Animated.View>
        <Animated.View style={lit} className="absolute inset-0">
          <Icon name={action.icon} size={24} tone="onPrimary" />
        </Animated.View>
      </View>
      <View>
        <Animated.View style={dim}>
          <Text variant="caption" tone="variant">
            {action.label}
          </Text>
        </Animated.View>
        <Animated.View style={lit} className="absolute inset-0 items-center">
          <Text variant="caption" tone="onPrimary">
            {action.label}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

interface WellProps {
  readonly action: SwipeAction;
  readonly translation: SharedValue<number>;
  readonly armAt: number;
}

function Well({ action, translation, armAt }: WellProps): ReactNode {
  const { reduced } = useMotion();
  const armed = useArmed(translation, armAt, reduced);
  const filled = useAnimatedStyle(() => ({ opacity: armed.get() }));
  const grow = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          Math.abs(translation.get()),
          [0, WELL_SPACE],
          [REST_SCALE, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  return (
    <View className="w-26 justify-center px-2 py-1">
      <View className="flex-1 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
        <Animated.View style={filled} className={cn('absolute inset-0', FILL[action.tone])} />
        <Animated.View style={grow}>
          <WellFace action={action} armed={armed} />
        </Animated.View>
      </View>
    </View>
  );
}

export function SwipeRow({
  leading,
  trailing,
  surface = 'bg',
  children,
}: SwipeRowProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const ref = useRef<SwipeableMethods>(null);
  const { width, onLayout } = useMeasuredWidth();
  if (pointer || (leading === undefined && trailing === undefined)) {
    return <View className={SURFACE[surface]}>{children}</View>;
  }
  const armAt = width * ARM_SHARE;
  const threshold = armAt === 0 ? {} : { leftThreshold: armAt, rightThreshold: armAt };
  return (
    <View onLayout={onLayout}>
      <ReanimatedSwipeable
        ref={ref}
        {...threshold}
        overshootLeft
        overshootRight
        renderLeftActions={(_progress, translation) =>
          leading === undefined ? null : (
            <Well action={leading} translation={translation} armAt={armAt} />
          )
        }
        renderRightActions={(_progress, translation) =>
          trailing === undefined ? null : (
            <Well action={trailing} translation={translation} armAt={armAt} />
          )
        }
        onSwipeableOpen={(direction) => {
          const action = direction === SwipeDirection.RIGHT ? leading : trailing;
          action?.onCommit();
          ref.current?.close();
        }}
      >
        <View className={SURFACE[surface]}>{children}</View>
      </ReanimatedSwipeable>
    </View>
  );
}
