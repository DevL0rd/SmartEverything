import type { ReactNode } from 'react';
import { AccessibilityInfo, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { HOLD_MS } from '../../../components/hold-button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { SPRING } from '../../../design/motion';
import { slideProgressOf, slideStops } from './slide-model';

const KNOB_SIZE = 60;
const KNOB_INSET = 6;
const SLOP = 8;

interface StopSliderProps {
  readonly label: string;
  readonly hint: string;
  readonly enabled: boolean;
  readonly onStop: () => void;
}

interface Slide {
  readonly gesture: ReturnType<typeof Gesture.Pan>;
  readonly progress: SharedValue<number>;
  readonly travel: SharedValue<number>;
}

function Knob({ progress, travel }: Omit<Slide, 'gesture'>): ReactNode {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * travel.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute top-1.5 left-1.5 size-15 items-center justify-center rounded-full bg-primary"
    >
      <Icon name="arrowRight" size={24} tone="onPrimary" />
    </Animated.View>
  );
}

function Fill({ progress }: Pick<Slide, 'progress'>): ReactNode {
  const style = useAnimatedStyle(() => ({
    transformOrigin: 'left',
    transform: [{ scaleX: progress.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className="absolute inset-0 rounded-full bg-primary/20"
    />
  );
}

function useSlide(enabled: boolean, stop: () => void): Slide {
  const progress = useSharedValue(0);
  const travel = useSharedValue(0);
  const fired = useSharedValue(false);
  const fire = (): void => {
    'worklet';
    if (fired.get()) return;
    fired.set(true);
    scheduleOnRN(stop);
  };
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .minDistance(0)
    .onBegin(() => {
      fired.set(false);
      progress.set(
        withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
          if (finished === true) fire();
        }),
      );
    })
    .onUpdate((event) => {
      if (fired.get() || Math.abs(event.translationX) < SLOP) return;
      cancelAnimation(progress);
      progress.set(slideProgressOf(event.translationX, travel.get()));
    })
    .onEnd(() => {
      if (slideStops(progress.get())) fire();
    })
    .onFinalize(() => {
      if (fired.get()) return;
      cancelAnimation(progress);
      progress.set(withSpring(0, SPRING));
    });
  return { gesture, progress, travel };
}

export function StopSlider({ label, hint, enabled, onStop }: StopSliderProps): ReactNode {
  const { gesture, progress, travel } = useSlide(enabled, onStop);
  const measure = (event: LayoutChangeEvent): void => {
    travel.set(Math.max(event.nativeEvent.layout.width - KNOB_SIZE - KNOB_INSET * 2, 0));
  };
  const activate = (): void => {
    if (!enabled) return;
    AccessibilityInfo.announceForAccessibility(label);
    onStop();
  };
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        role="button"
        aria-label={label}
        aria-disabled={!enabled}
        accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate', label }]}
        onAccessibilityAction={activate}
        onLayout={measure}
        className={cn(
          'h-18 items-center justify-center overflow-hidden rounded-full border border-outline bg-surface-2 pl-16 pr-4',
          !enabled && 'opacity-50',
        )}
      >
        <Fill progress={progress} />
        <Text variant="callout" tone="variant" numberOfLines={1}>
          Slide or hold to stop
        </Text>
        <Knob progress={progress} travel={travel} />
      </View>
    </GestureDetector>
  );
}
