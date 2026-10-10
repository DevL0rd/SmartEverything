import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { AssistantAttachment } from '@smarteverything/domain';
import { useMotion } from '../../../design/motion';

const ZOOM_MAX = 5;
const ZOOM_TAP = 2.5;

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

const pageStyle = ({ width, height }: PageSize): PageSize => ({ width, height });

function clampZoom(value: number): number {
  'worklet';
  return Math.min(ZOOM_MAX, Math.max(1, value));
}

interface ZoomGesture {
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
  readonly zoom: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
}

function useZoomGesture(zoomed: boolean): ZoomGesture {
  const { reduced } = useMotion();
  const zoom = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
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
      const next = zoom.get() > 1 ? 1 : ZOOM_TAP;
      zoom.set(reduced ? next : withTiming(next));
      x.set(reduced ? 0 : withTiming(0));
      y.set(reduced ? 0 : withTiming(0));
    });
  return { gesture: Gesture.Simultaneous(pinch, pan, twice), zoom, x, y };
}

export function ZoomPage({
  image,
  url,
  size,
  onZoomed,
}: {
  readonly image: AssistantAttachment;
  readonly url: string | undefined;
  readonly size: PageSize;
  readonly onZoomed: (zoomed: boolean) => void;
}): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const { gesture, zoom, x, y } = useZoomGesture(zoomed);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }],
  }));
  const report = (value: boolean): void => {
    setZoomed(value);
    onZoomed(value);
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
      <View style={pageStyle(size)} className="items-center justify-center overflow-hidden px-2">
        <Animated.View style={style} className="size-full">
          {url === undefined ? null : (
            <Image
              source={{ uri: url }}
              resizeMode="contain"
              accessibilityLabel={image.name}
              className="size-full"
            />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
