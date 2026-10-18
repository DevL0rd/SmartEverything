import type Animated from 'react-native-reanimated';
import { measure, scrollTo, type AnimatedRef, type SharedValue } from 'react-native-reanimated';

const SCROLL_MARGIN = 16;

export function bringIntoView(
  target: AnimatedRef<Animated.View>,
  scroller: AnimatedRef<Animated.ScrollView>,
  scrollY: SharedValue<number>,
): void {
  'worklet';
  const view = measure(scroller);
  const box = measure(target);
  if (view === null || box === null) {
    return;
  }
  const offset = box.pageY - view.pageY;
  const top =
    box.height > view.height ? offset - SCROLL_MARGIN : offset - (view.height - box.height) / 2;
  scrollTo(scroller, 0, Math.max(0, scrollY.get() + top), true);
}
