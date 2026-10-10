import type { ReactNode } from 'react';
import { Image, Linking, Modal, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ScopedTheme } from 'uniwind';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { useMotion } from '../../../design/motion';

const FILL = { flex: 1 } as const;
const ZOOM_MAX = 5;

export interface ViewedImage {
  readonly url: string;
  readonly name: string;
}

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

function useZoomGesture(): ZoomGesture {
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
    .onBegin(remember)
    .onUpdate((event) => {
      if (zoom.get() > 1) {
        x.set(start.get().x + event.translationX);
        y.set(start.get().y + event.translationY);
      }
    });
  const twice = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = zoom.get() > 1 ? 1 : 2.5;
      zoom.set(reduced ? next : withTiming(next));
      x.set(reduced ? 0 : withTiming(0));
      y.set(reduced ? 0 : withTiming(0));
    });
  return { gesture: Gesture.Simultaneous(pinch, pan, twice), zoom, x, y };
}

function ViewerBar({
  image,
  onClose,
}: {
  readonly image: ViewedImage;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="z-10 flex-row items-center gap-2 px-2 pt-safe-offset-2">
      <IconButton icon="close" label="Close" variant="overlay" onPress={onClose} shortcut="Esc" />
      <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
        {image.name}
      </Text>
      <IconButton
        icon="download"
        label={`Open ${image.name}`}
        variant="overlay"
        onPress={() => {
          void Linking.openURL(image.url);
        }}
      />
    </View>
  );
}

function Viewer({
  image,
  onClose,
}: {
  readonly image: ViewedImage;
  readonly onClose: () => void;
}): ReactNode {
  const { gesture, zoom, x, y } = useZoomGesture();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }],
  }));
  useEscape(true, onClose);
  return (
    <GestureHandlerRootView style={FILL}>
      <ScopedTheme theme="dark">
        <View className="flex-1 bg-bg">
          <ViewerBar image={image} onClose={onClose} />
          <GestureDetector gesture={gesture}>
            <View className="flex-1 items-center justify-center overflow-hidden px-2 pb-safe-offset-4">
              <Animated.View style={style} className="size-full">
                <Image
                  source={{ uri: image.url }}
                  resizeMode="contain"
                  accessibilityLabel={image.name}
                  className="size-full"
                />
              </Animated.View>
            </View>
          </GestureDetector>
        </View>
      </ScopedTheme>
    </GestureHandlerRootView>
  );
}

export function ImageViewer({
  image,
  onClose,
}: {
  readonly image: ViewedImage | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Modal
      visible={image !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {image === null ? null : <Viewer image={image} onClose={onClose} />}
    </Modal>
  );
}
