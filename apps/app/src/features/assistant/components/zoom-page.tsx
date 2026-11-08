import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { AssistantAttachment } from '@smarteverything/domain';
import type { Rect } from '../../../components/anchor';
import { IconButton } from '../../../components/icon-button';
import { Zoomable } from '../../../components/zoomable';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { swipeChoiceOf } from '../../photos/viewer/swipe';

const IMAGE_SIZE = { width: '100%', height: '100%' } as const;

export const PAGE_GUTTER = 8;
export const DOT = 4;
export const DOT_ACTIVE = 14;
export const DOT_GAP = 4;
export const OPEN_SCALE_PLAIN = 0.92;

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface Opening {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly fade: boolean;
}

const pageStyle = ({ width, height }: PageSize): PageSize => ({ width, height });

export function fittedFrame(
  image: Pick<AssistantAttachment, 'width' | 'height'>,
  area: Rect,
): Rect {
  const room = {
    width: Math.max(1, area.width - PAGE_GUTTER * 2),
    height: Math.max(1, area.height),
  };
  const aspect = image.width === null || image.height === null ? 1 : image.width / image.height;
  const width = Math.min(room.width, room.height * aspect);
  const height = width / aspect;
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}

export function openingFrom(fitted: Rect, origin: Rect | null): Opening {
  if (origin === null || origin.width <= 0 || origin.height <= 0) {
    return { x: 0, y: 0, scale: OPEN_SCALE_PLAIN, fade: true };
  }
  return {
    x: origin.x + origin.width / 2 - (fitted.x + fitted.width / 2),
    y: origin.y + origin.height / 2 - (fitted.y + fitted.height / 2),
    scale: Math.max(origin.width / fitted.width, origin.height / fitted.height),
    fade: false,
  };
}

export function dotsOffset(count: number, index: number, width: number): number {
  const total = count * (DOT + DOT_GAP) - DOT_GAP + (DOT_ACTIVE - DOT);
  if (total <= width) return (width - total) / 2;
  const centre = index * (DOT + DOT_GAP) + DOT_ACTIVE / 2;
  return Math.min(0, Math.max(width - total, width / 2 - centre));
}

export function PageDots({
  count,
  index,
  width,
}: {
  readonly count: number;
  readonly index: number;
  readonly width: number;
}): ReactNode {
  const { reduced } = useMotion();
  const offset = dotsOffset(count, index, width);
  const shifted = useSharedValue(offset);
  useEffect(() => {
    shifted.set(reduced ? offset : withTiming(offset, { duration: DURATION.medium }));
  }, [offset, reduced, shifted]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shifted.get() }] }));
  if (count < 2 || width === 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden pb-2 pt-2.5"
    >
      <Animated.View style={style} className="flex-row gap-1 self-start">
        {Array.from({ length: count }, (_, position) => (
          <View
            key={position}
            className={cn(
              'h-1 rounded-full bg-white',
              position === index ? 'w-3.5' : 'w-1 opacity-35',
            )}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function Step({
  side,
  onPress,
}: {
  readonly side: 'left' | 'right';
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      className={cn('absolute inset-y-0 justify-center', side === 'left' ? 'left-2' : 'right-2')}
    >
      <IconButton
        icon={side === 'left' ? 'chevronLeft' : 'chevronRight'}
        label={side === 'left' ? 'Previous image' : 'Next image'}
        shortcut={side === 'left' ? '←' : '→'}
        variant="overlay"
        onPress={onPress}
      />
    </View>
  );
}

export function PageSteps({
  index,
  count,
  go,
}: {
  readonly index: number;
  readonly count: number;
  readonly go: (next: number) => void;
}): ReactNode {
  return (
    <>
      {index > 0 ? (
        <Step
          side="left"
          onPress={() => {
            go(index - 1);
          }}
        />
      ) : null}
      {index < count - 1 ? (
        <Step
          side="right"
          onPress={() => {
            go(index + 1);
          }}
        />
      ) : null}
    </>
  );
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
  return (
    <Zoomable
      style={pageStyle(size)}
      className="items-center justify-center overflow-hidden px-2"
      onZoomed={onZoomed}
    >
      {url === undefined ? null : (
        <Image
          source={{ uri: url }}
          resizeMode="contain"
          style={IMAGE_SIZE}
          accessibilityLabel={image.name}
          className="size-full"
        />
      )}
    </Zoomable>
  );
}

const DRAG_OFFSET = 12;
const DRAG_SHRINK = 0.1;

export interface ViewerMotion {
  readonly open: SharedValue<number>;
  readonly drag: SharedValue<number>;
  readonly begin: () => void;
  readonly close: () => void;
}

export function useViewerMotion(onClose: () => void): ViewerMotion {
  const { reduced } = useMotion();
  const open = useSharedValue(0);
  const drag = useSharedValue(0);
  const started = useRef(false);
  const begin = (): void => {
    if (started.current) return;
    started.current = true;
    open.set(reduced ? 1 : withTiming(1, { duration: DURATION.medium, easing: EASING.decelerate }));
  };
  const close = (): void => {
    if (reduced) {
      onClose();
      return;
    }
    const timing = { duration: DURATION.mediumOut, easing: EASING.accelerate };
    open.set(
      withTiming(0, timing, (finished) => {
        if (finished === true) scheduleOnRN(onClose);
      }),
    );
  };
  return { open, drag, begin, close };
}

function dragShare(drag: number, height: number): number {
  'worklet';
  return Math.min(1, drag / Math.max(1, height / 2));
}

function useShownStyle(motion: ViewerMotion, height: number): AnimatedStyle<ViewStyle> {
  const { open, drag } = motion;
  return useAnimatedStyle(() => ({
    opacity: open.get() * (1 - dragShare(drag.get(), height)),
  }));
}

export function useStageStyle(
  motion: ViewerMotion,
  opening: Opening,
  height: number,
): AnimatedStyle<ViewStyle> {
  const { open, drag } = motion;
  return useAnimatedStyle(() => {
    const shown = open.get();
    const shrink = 1 - DRAG_SHRINK * dragShare(drag.get(), height);
    return {
      opacity: opening.fade ? shown : 1,
      transform: [
        { translateX: opening.x * (1 - shown) },
        { translateY: opening.y * (1 - shown) + drag.get() },
        { scale: (opening.scale + (1 - opening.scale) * shown) * shrink },
      ],
    };
  });
}

export function useDragClose(motion: ViewerMotion, size: PageSize, enabled: boolean): PanGesture {
  const { drag, close } = motion;
  const { reduced } = useMotion();
  return Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .activeOffsetY(DRAG_OFFSET)
    .failOffsetX([-DRAG_OFFSET, DRAG_OFFSET])
    .onUpdate((event) => {
      drag.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      const move = { dx: event.translationX, dy: event.translationY };
      const fling = { vx: event.velocityX, vy: event.velocityY };
      if (swipeChoiceOf({ ...move, ...fling, ...size }) === 'close') {
        scheduleOnRN(close);
        return;
      }
      drag.set(reduced ? 0 : withTiming(0, { duration: DURATION.short }));
    });
}

export function Backdrop({
  motion,
  height,
}: {
  readonly motion: ViewerMotion;
  readonly height: number;
}): ReactNode {
  return (
    <Animated.View
      pointerEvents="none"
      style={useShownStyle(motion, height)}
      className="absolute inset-0 bg-black"
    />
  );
}

export function ShownChrome({
  motion,
  height,
  children,
}: {
  readonly motion: ViewerMotion;
  readonly height: number;
  readonly children: ReactNode;
}): ReactNode {
  return <Animated.View style={useShownStyle(motion, height)}>{children}</Animated.View>;
}
