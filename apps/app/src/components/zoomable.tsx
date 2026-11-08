import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotion } from '../design/motion';

export const ZOOM_MAX = 5;
export const ZOOM_TAP = 2.5;

export function clampZoom(value: number): number {
  'worklet';
  return Math.min(ZOOM_MAX, Math.max(1, value));
}

export function tapZoomOf(zoom: number): number {
  'worklet';
  return zoom > 1 ? 1 : ZOOM_TAP;
}

export interface ZoomState {
  readonly zoom: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

export function useZoomState(): ZoomState {
  return { zoom: useSharedValue(1), x: useSharedValue(0), y: useSharedValue(0) };
}

interface ZoomGesture extends ZoomState {
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
}

function useZoomGesture(zoomed: boolean, state: ZoomState): ZoomGesture {
  const { reduced } = useMotion();
  const { zoom, x, y } = state;
  const start = useSharedValue({ zoom: 1, x: 0, y: 0 });
  const remember = (): void => {
    'worklet';
    start.set({ zoom: zoom.get(), x: x.get(), y: y.get() });
  };
  const pinch = Gesture.Pinch()
    .onBegin(remember)
    .onUpdate((event) => {
      zoom.set(clampZoom(start.get().zoom * event.scale));
    });
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onBegin(remember)
    .onUpdate((event) => {
      x.set(start.get().x + event.translationX);
      y.set(start.get().y + event.translationY);
    });
  const twice = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = tapZoomOf(zoom.get());
      zoom.set(reduced ? next : withTiming(next));
      x.set(reduced ? 0 : withTiming(0));
      y.set(reduced ? 0 : withTiming(0));
    });
  return { gesture: Gesture.Simultaneous(pinch, pan, twice), zoom, x, y };
}

export interface ZoomableProps {
  readonly children: ReactNode;
  readonly onZoomed?: ((zoomed: boolean) => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
  readonly state?: ZoomState;
}

export function Zoomable({
  children,
  onZoomed,
  style,
  className,
  state,
}: ZoomableProps): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const own = useZoomState();
  const { gesture, zoom, x, y } = useZoomGesture(zoomed, state ?? own);
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }],
  }));
  const report = (value: boolean): void => {
    setZoomed(value);
    onZoomed?.(value);
  };
  useAnimatedReaction(
    () => zoom.get() > 1,
    (now, before) => {
      if (now !== before) {
        scheduleOnRN(report, now);
      }
    },
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={style} className={className ?? 'size-full overflow-hidden'}>
        <Animated.View style={moved} className="size-full">
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
