import type Animated from 'react-native-reanimated';
import { measure, scrollTo, type AnimatedRef, type SharedValue } from 'react-native-reanimated';

const SCROLL_MARGIN = 16;

export function scrollBoxIntoView(
  scroller: AnimatedRef<Animated.ScrollView>,
  scrollY: SharedValue<number>,
  box: { readonly pageY: number; readonly height: number },
  mode: 'centre' | 'if-hidden',
): void {
  'worklet';
  const view = measure(scroller);
  if (view === null) {
    return;
  }
  const inView = box.pageY >= view.pageY && box.pageY + box.height <= view.pageY + view.height;
  if (mode === 'if-hidden' && inView) {
    return;
  }
  const offset = box.pageY - view.pageY;
  const top =
    box.height > view.height ? offset - SCROLL_MARGIN : offset - (view.height - box.height) / 2;
  scrollTo(scroller, 0, Math.max(0, scrollY.get() + top), mode === 'centre');
}

export function bringIntoView(
  target: AnimatedRef<Animated.View>,
  scroller: AnimatedRef<Animated.ScrollView>,
  scrollY: SharedValue<number>,
): void {
  'worklet';
  const box = measure(target);
  if (box === null) {
    return;
  }
  scrollBoxIntoView(scroller, scrollY, box, 'centre');
}
