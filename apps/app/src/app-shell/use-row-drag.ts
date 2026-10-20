import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import type { Point } from '../components/interactive';
import { SPRING, useMotion } from '../design/motion';
import { heavyThud } from '../platform/haptics';
import { holdOutcome, movedPastSlop } from './nav-bar-drag';

const MIN_DISTANCE = 4;
const HOLD_MS = 300;

interface RowDragInput {
  readonly rowKey: string;
  readonly touch: boolean;
  readonly topOf: (key: string) => number;
  readonly onLift: (key: string) => void;
  readonly onMove: (key: string, pointerY: number) => void;
  readonly onDrop: (key: string) => boolean;
  readonly onHold: (point: Point) => void;
}

interface RowDrag {
  readonly gesture: PanGesture;
  readonly style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  readonly swallowed: SharedValue<boolean>;
}

function activation(touch: boolean): PanGesture {
  const pan = Gesture.Pan().runOnJS(true);
  return touch ? pan.activateAfterLongPress(HOLD_MS) : pan.minDistance(MIN_DISTANCE);
}

export function useRowDrag({
  rowKey,
  touch,
  topOf,
  onLift,
  onMove,
  onDrop,
  onHold,
}: RowDragInput): RowDrag {
  const { reduced } = useMotion();
  const offset = useSharedValue(0);
  const grab = useSharedValue(0);
  const lifted = useSharedValue(false);
  const swallowed = useSharedValue(false);
  const moved = useSharedValue(false);
  const press = useSharedValue<Point>({ x: 0, y: 0 });
  const gesture = activation(touch)
    .onBegin(() => {
      swallowed.set(false);
    })
    .onStart((event) => {
      grab.set(event.y);
      lifted.set(true);
      swallowed.set(true);
      moved.set(false);
      press.set({ x: event.absoluteX, y: event.absoluteY });
      if (touch) heavyThud();
      onLift(rowKey);
    })
    .onUpdate((event) => {
      offset.set(event.translationY);
      if (movedPastSlop(event.translationY)) moved.set(true);
      onMove(rowKey, topOf(rowKey) + grab.get() + event.translationY);
    })
    .onFinalize(() => {
      if (!lifted.get()) return;
      lifted.set(false);
      const placed = onDrop(rowKey);
      if (touch && holdOutcome(placed, moved.get()) === 'menu') onHold(press.get());
      offset.set(placed || reduced ? 0 : withSpring(0, SPRING));
    });
  const style = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateY: offset.get() }],
    zIndex: offset.get() === 0 ? 0 : 10,
  }));
  return { gesture, style, swallowed };
}
