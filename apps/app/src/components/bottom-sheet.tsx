import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SheetBody } from './sheet-body';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DURATION, EASING, SPRING, useMotion } from '../design/motion';
import { Overlay, useOverlayShown } from './overlay';
import { SheetHeader } from './sheet-header';

export type Detent = 'fit' | 'half' | 'full';

const FULL_SHARE = 0.92;
const HALF_SHARE = 0.5;
const CLOSE_VELOCITY = 1200;

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string | undefined;
  readonly label: string;
  readonly detents: readonly Detent[];
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

function restingOffset(detents: readonly Detent[], full: number): number {
  return detents[0] === 'half' ? full - full * (HALF_SHARE / FULL_SHARE) : 0;
}

function snapOf(
  offset: number,
  velocity: number,
  stops: readonly number[],
  full: number,
): number | null {
  'worklet';
  if (velocity > CLOSE_VELOCITY || offset > full * 0.75) {
    return null;
  }
  return stops.reduce((best, stop) =>
    Math.abs(stop - offset) < Math.abs(best - offset) ? stop : best,
  );
}

interface SheetOffset {
  readonly offset: SharedValue<number>;
  readonly onMounted: () => void;
}

function useSheetOffset(open: boolean, full: number, rest: number): SheetOffset {
  const { reduced } = useMotion();
  const shown = useOverlayShown();
  const offset = useSharedValue(full);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!open) {
      offset.set(full);
    }
  }, [open, full, offset]);
  useEffect(() => {
    if (!open || !mounted) {
      return;
    }
    if (reduced) {
      offset.set(rest);
      shown();
      return;
    }
    offset.set(
      withTiming(rest, { duration: DURATION.medium, easing: EASING.decelerate }, (finished) => {
        'worklet';
        if (finished === true) {
          scheduleOnRN(shown);
        }
      }),
    );
  }, [open, mounted, rest, full, reduced, offset, shown]);
  return {
    offset,
    onMounted: (): void => {
      setMounted(true);
    },
  };
}

interface DragTargets {
  readonly stops: readonly number[];
  readonly full: number;
  readonly onClose: () => void;
}

function useDragToDismiss(
  offset: SharedValue<number>,
  { stops, full, onClose }: DragTargets,
): PanGesture {
  const start = useSharedValue(0);
  return Gesture.Pan()
    .onBegin(() => {
      start.set(offset.get());
    })
    .onUpdate((event) => {
      offset.set(Math.max(0, start.get() + event.translationY));
    })
    .onEnd((event) => {
      const target = snapOf(offset.get(), event.velocityY, stops, full);
      if (target === null) {
        scheduleOnRN(onClose);
        return;
      }
      offset.set(withSpring(target, SPRING));
    });
}

function Handle({
  title,
  onClose,
}: {
  readonly title: string | undefined;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View collapsable={false}>
      <View className="items-center py-3">
        <View className="h-1 w-8 rounded-full bg-on-surface-faint" />
      </View>
      <SheetHeader title={title} onClose={onClose} touch />
    </View>
  );
}

interface PanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string | undefined;
  readonly label: string;
  readonly detents: readonly Detent[];
  readonly footer: ReactNode;
  readonly scroll: boolean;
  readonly full: number;
  readonly children: ReactNode;
}

function SheetPanel({
  open,
  onClose,
  title,
  label,
  detents,
  footer,
  scroll,
  full,
  children,
}: PanelProps): ReactNode {
  const rest = restingOffset(detents, full);
  const stops = detents.includes('full') ? [0, rest] : [rest];
  const { offset, onMounted } = useSheetOffset(open, full, rest);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const pan = useDragToDismiss(offset, { stops, full, onClose });
  const sized = detents.includes('fit') ? { maxHeight: full } : { height: full };
  return (
    <Animated.View
      accessibilityViewIsModal
      aria-modal
      accessibilityLabel={label}
      onLayout={onMounted}
      style={[sized, slide]}
      className="w-full overflow-hidden rounded-t-xxl bg-surface-raised pb-safe elevation-3"
    >
      <GestureDetector gesture={pan}>
        <Handle title={title} onClose={onClose} />
      </GestureDetector>
      <SheetBody scroll={scroll} padding="px-4 pb-4">
        {children}
      </SheetBody>
      {footer === undefined ? null : (
        <View className="flex-row gap-3 px-4 pb-4 pt-2">{footer}</View>
      )}
    </Animated.View>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  label,
  detents,
  footer,
  scroll = true,
  children,
}: BottomSheetProps): ReactNode {
  const { height } = useWindowDimensions();
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim className="justify-end">
      <SheetPanel
        open={open}
        onClose={onClose}
        title={title}
        label={label}
        detents={detents}
        footer={footer}
        scroll={scroll}
        full={height * FULL_SHARE}
      >
        {children}
      </SheetPanel>
    </Overlay>
  );
}
