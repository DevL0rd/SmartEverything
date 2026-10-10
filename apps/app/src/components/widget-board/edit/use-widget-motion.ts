import { useEffect } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING } from '../../../design/motion';
import type { Frame } from '../board-geometry';
import { NO_TARGET, RESTING, draggedPosition, hitTest, type DragState } from './drag-state';

const LONG_PRESS_MS = 200;
const JIGGLE_DEGREES = 0.6;
const JIGGLE_HALF_PERIOD_MS = 83;
const LIFT_SCALE = 1.03;

export interface WidgetMotion {
  readonly left: SharedValue<number>;
  readonly top: SharedValue<number>;
  readonly width: SharedValue<number>;
  readonly height: SharedValue<number>;
  readonly home: SharedValue<Frame>;
  readonly lift: SharedValue<number>;
  readonly reduced: boolean;
}

function settle(value: SharedValue<number>, to: number, reduced: boolean): void {
  value.set(reduced ? to : withSpring(to, SPRING));
}

export function useWidgetMotion(frame: Frame, reduced: boolean): WidgetMotion {
  const left = useSharedValue(frame.left);
  const top = useSharedValue(frame.top);
  const width = useSharedValue(frame.width);
  const height = useSharedValue(frame.height);
  const home = useSharedValue(frame);
  const lift = useSharedValue(1);
  useEffect(() => {
    home.set({ left: frame.left, top: frame.top, width: frame.width, height: frame.height });
    settle(left, frame.left, reduced);
    settle(top, frame.top, reduced);
    settle(width, frame.width, reduced);
    settle(height, frame.height, reduced);
  }, [frame.left, frame.top, frame.width, frame.height, reduced, left, top, width, height, home]);
  return { left, top, width, height, home, lift, reduced };
}

export function useJiggle(active: boolean, phase: number): SharedValue<number> {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      rotation.set(0);
      return undefined;
    }
    const swing = withSequence(
      withTiming(JIGGLE_DEGREES, { duration: JIGGLE_HALF_PERIOD_MS }),
      withTiming(-JIGGLE_DEGREES, { duration: JIGGLE_HALF_PERIOD_MS }),
    );
    rotation.set(withDelay((phase % 4) * 40, withRepeat(swing, -1, true)));
    return (): void => {
      cancelAnimation(rotation);
    };
  }, [active, phase, rotation]);
  return rotation;
}

export function useWidgetStyle(
  key: string,
  motion: WidgetMotion,
  drag: DragState,
  rotation: SharedValue<number>,
): ReturnType<typeof useAnimatedStyle<ViewStyle>> {
  return useAnimatedStyle<ViewStyle>(() => {
    const lifted = drag.key.get() === key;
    const at = lifted
      ? draggedPosition(drag.point.get(), drag.scrollY.get())
      : { left: motion.left.get(), top: motion.top.get() };
    return {
      left: at.left,
      top: at.top,
      width: motion.width.get(),
      height: motion.height.get(),
      zIndex: lifted ? 10 : 1,
      transform: [
        { scale: motion.lift.get() },
        { rotate: `${String(lifted ? 0 : rotation.get())}deg` },
      ],
    };
  });
}

export interface MoveGestureInput {
  readonly key: string;
  readonly touch: boolean;
  readonly motion: WidgetMotion;
  readonly drag: DragState;
  readonly onLift: (key: string) => void;
  readonly onDrop: () => void;
}

function settleDropped(motion: WidgetMotion, drag: DragState): void {
  'worklet';
  const at = draggedPosition(drag.point.get(), drag.scrollY.get());
  const home = motion.home.get();
  motion.left.set(at.left);
  motion.top.set(at.top);
  motion.left.set(motion.reduced ? home.left : withSpring(home.left, SPRING));
  motion.top.set(motion.reduced ? home.top : withSpring(home.top, SPRING));
  drag.key.set(NO_TARGET);
  drag.point.set(RESTING);
  motion.lift.set(motion.reduced ? 1 : withSpring(1, SPRING));
}

export function useMoveGesture({
  key,
  touch,
  motion,
  drag,
  onLift,
  onDrop,
}: MoveGestureInput): PanGesture {
  const pan = touch
    ? Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS)
    : Gesture.Pan().minDistance(4);
  return pan
    .onStart((event) => {
      drag.point.set({
        originLeft: motion.left.get(),
        originTop: motion.top.get(),
        grabX: event.x,
        grabY: event.y,
        dx: 0,
        dy: 0,
        scrollStart: drag.scrollY.get(),
        pointerY: event.absoluteY,
      });
      drag.target.set(NO_TARGET);
      drag.key.set(key);
      if (!motion.reduced) {
        motion.lift.set(withSpring(LIFT_SCALE, SPRING));
      }
      scheduleOnRN(onLift, key);
    })
    .onUpdate((event) => {
      drag.point.set({
        ...drag.point.get(),
        dx: event.translationX,
        dy: event.translationY,
        pointerY: event.absoluteY,
      });
      hitTest(drag);
    })
    .onFinalize(() => {
      if (drag.key.get() !== key) {
        return;
      }
      settleDropped(motion, drag);
      scheduleOnRN(onDrop);
    });
}
