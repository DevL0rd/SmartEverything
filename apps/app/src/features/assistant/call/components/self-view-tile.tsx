import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ThemeScope } from '../../../../design/theme-scope';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { SPRING } from '../../../../design/motion';
import type { CallVideo } from '../call-state';
import { SightPreview } from './sight-preview';

export type TileCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TileBox {
  readonly width: number;
  readonly height: number;
}

const TILE = { width: 96, height: 128 } as const;
const TILE_WIDE = { width: 168, height: 128 } as const;
const MARGIN = 12;

const CORNER_LABELS: Readonly<Record<TileCorner, string>> = {
  'top-left': 'Move to top left',
  'top-right': 'Move to top right',
  'bottom-left': 'Move to bottom left',
  'bottom-right': 'Move to bottom right',
};

const CORNERS: readonly TileCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export interface SelfViewTileProps {
  readonly video: CallVideo;
  readonly box: TileBox;
  readonly wide: boolean;
  readonly corner: TileCorner;
  readonly swappable: boolean;
  readonly slot: 'sent' | 'self';
  readonly onCorner: (corner: TileCorner) => void;
  readonly onSwap: () => void;
}

function sizeOf(wide: boolean): { readonly width: number; readonly height: number } {
  return wide ? TILE_WIDE : TILE;
}

function positionOf(
  corner: TileCorner,
  box: TileBox,
  size: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  'worklet';
  return {
    x: corner.endsWith('left') ? MARGIN : box.width - size.width - MARGIN,
    y: corner.startsWith('top') ? MARGIN : box.height - size.height - MARGIN,
  };
}

function nearestCorner(
  x: number,
  y: number,
  box: TileBox,
  size: { readonly width: number; readonly height: number },
): TileCorner {
  'worklet';
  const left = x + size.width / 2 < box.width / 2;
  const top = y + size.height / 2 < box.height / 2;
  if (top) {
    return left ? 'top-left' : 'top-right';
  }
  return left ? 'bottom-left' : 'bottom-right';
}

function useTileDrag(props: SelfViewTileProps): {
  readonly gesture: ReturnType<typeof Gesture.Race>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
} {
  const { box, wide, corner, swappable, onCorner, onSwap } = props;
  const size = sizeOf(wide);
  const home = positionOf(corner, box, size);
  const x = useSharedValue(home.x);
  const y = useSharedValue(home.y);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) {
      x.set(withSpring(home.x, SPRING));
      y.set(withSpring(home.y, SPRING));
    }
  }, [dragging, home.x, home.y, x, y]);
  const pan = Gesture.Pan()
    .minDistance(8)
    .onBegin(() => {
      scheduleOnRN(setDragging, true);
    })
    .onUpdate((event) => {
      x.set(home.x + event.translationX);
      y.set(home.y + event.translationY);
    })
    .onEnd(() => {
      scheduleOnRN(onCorner, nearestCorner(x.get(), y.get(), box, size));
    })
    .onFinalize(() => {
      scheduleOnRN(setDragging, false);
    });
  const tap = Gesture.Tap().onEnd(() => {
    if (swappable) {
      scheduleOnRN(onSwap);
    }
  });
  return { gesture: Gesture.Race(pan, tap), x, y };
}

function actionsOf(
  corner: TileCorner,
  swappable: boolean,
): readonly { readonly name: string; readonly label: string }[] {
  return [
    ...(swappable ? [{ name: 'activate', label: 'Swap' }] : []),
    ...CORNERS.filter((candidate) => candidate !== corner).map((candidate) => ({
      name: candidate,
      label: CORNER_LABELS[candidate],
    })),
  ];
}

export function SelfViewTile(props: SelfViewTileProps): ReactNode {
  const { video, wide, corner, swappable, slot, onCorner, onSwap } = props;
  const { gesture, x, y } = useTileDrag(props);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={swappable ? 'Your camera. Swap with the main picture' : 'Your camera'}
        accessibilityActions={actionsOf(corner, swappable)}
        onAccessibilityAction={(event) => {
          const target = CORNERS.find((candidate) => candidate === event.nativeEvent.actionName);
          if (target !== undefined) {
            onCorner(target);
          } else if (swappable) {
            onSwap();
          }
        }}
        style={style}
        className="absolute left-0 top-0"
      >
        <View
          className={cn(
            'h-32 overflow-hidden rounded-lg border-hairline border-outline bg-surface-3 elevation-2',
            wide ? 'w-42' : 'w-24',
          )}
        >
          <SightPreview
            slot={slot}
            fit="cover"
            label="Your camera"
            facing={video.facing}
            light={false}
          />
          <ThemeScope theme="dark">
            <View className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5">
              <Text variant="caption">You</Text>
            </View>
          </ThemeScope>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
