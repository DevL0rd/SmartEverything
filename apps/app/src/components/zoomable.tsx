import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
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
import { useWheelZoom, type WheelTurn, type WheelZoom } from './wheel-zoom';

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

const WHEEL_DOUBLING_PIXELS = 300;

export interface ZoomView {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

export function wheelZoomed(view: ZoomView, turn: WheelTurn): ZoomView {
  const zoom = clampZoom(view.zoom * 2 ** (-turn.pixels / WHEEL_DOUBLING_PIXELS));
  if (zoom === 1) return { zoom, x: 0, y: 0 };
  const ratio = zoom / view.zoom;
  const atX = turn.x - turn.width / 2;
  const atY = turn.y - turn.height / 2;
  return { zoom, x: atX - (atX - view.x) * ratio, y: atY - (atY - view.y) * ratio };
}

export interface ZoomState {
  readonly zoom: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

export function useZoomState(): ZoomState {
  return { zoom: useSharedValue(1), x: useSharedValue(0), y: useSharedValue(0) };
}

function useWheel(frame: RefObject<View | null>, wheel: WheelZoom, state: ZoomState): void {
  useWheelZoom(frame, wheel, (turn) => {
    const next = wheelZoomed({ zoom: state.zoom.get(), x: state.x.get(), y: state.y.get() }, turn);
    state.zoom.set(next.zoom);
    state.x.set(next.x);
    state.y.set(next.y);
  });
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
  readonly wheel: WheelZoom;
}

export function Zoomable({
  children,
  onZoomed,
  style,
  className,
  state,
  wheel,
}: ZoomableProps): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const frame = useRef<View>(null);
  const own = useZoomState();
  const used = state ?? own;
  useWheel(frame, wheel, used);
  const { gesture, zoom, x, y } = useZoomGesture(zoomed, used);
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
      <View
        ref={frame}
        collapsable={false}
        style={style}
        className={className ?? 'size-full overflow-hidden'}
      >
        <Animated.View style={moved} className="size-full">
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
