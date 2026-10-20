import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { IconButton } from './icon-button';

export type PaneSide = 'left' | 'right';

export const PANE_KEY_STEP = 24;

const DRAG_ACTIVATION = 4;

export function clampPaneWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function widthAfterDrag(
  side: PaneSide,
  start: number,
  translation: number,
  limits: { readonly min: number; readonly max: number },
): number {
  const grown = side === 'right' ? start - translation : start + translation;
  return clampPaneWidth(grown, limits.min, limits.max);
}

export function widthAfterStep(
  current: number,
  direction: 'increment' | 'decrement',
  limits: { readonly min: number; readonly max: number },
): number {
  const sign = direction === 'increment' ? 1 : -1;
  return clampPaneWidth(current + sign * PANE_KEY_STEP, limits.min, limits.max);
}

export interface DockedPaneProps {
  readonly side: PaneSide;
  readonly label: string;
  readonly open: boolean;
  readonly width: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly onResize: (width: number) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

interface HandleProps {
  readonly side: PaneSide;
  readonly label: string;
  readonly width: number;
  readonly limits: { readonly min: number; readonly max: number };
  readonly live: ReturnType<typeof useSharedValue<number>>;
  readonly onResize: (width: number) => void;
  readonly onCollapse: () => void;
}

function Handle({
  side,
  label,
  width,
  limits,
  live,
  onResize,
  onCollapse,
}: HandleProps): ReactNode {
  const start = useSharedValue(width);
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-DRAG_ACTIVATION, DRAG_ACTIVATION])
    .onBegin(() => {
      start.set(live.get());
    })
    .onUpdate((event) => {
      live.set(widthAfterDrag(side, start.get(), event.translationX, limits));
    })
    .onEnd((event) => {
      onResize(widthAfterDrag(side, start.get(), event.translationX, limits));
    });
  const step = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName;
    if (name === 'increment' || name === 'decrement') {
      onResize(widthAfterStep(width, name, limits));
    } else if (name === 'activate') {
      onCollapse();
    }
  };
  const tap = Gesture.Tap().runOnJS(true).onEnd(onCollapse);
  return (
    <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Resize ${label}`}
        accessibilityHint="Drag to resize. Double tap to hide."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={step}
        className="h-full w-3 items-center justify-center"
      >
        <View className="h-10 w-1 rounded-full bg-outline-variant" />
      </View>
    </GestureDetector>
  );
}

function Rail({
  side,
  label,
  onExpand,
}: {
  readonly side: PaneSide;
  readonly label: string;
  readonly onExpand: () => void;
}): ReactNode {
  return (
    <View
      accessibilityLabel={label}
      className={cn(
        'h-full w-12 items-center bg-surface-1 pt-2',
        side === 'left' ? 'border-r border-outline-variant' : 'border-l border-outline-variant',
      )}
    >
      <IconButton
        icon={side === 'left' ? 'chevronRight' : 'chevronLeft'}
        label={`Show ${label}`}
        onPress={onExpand}
      />
    </View>
  );
}

export function DockedPane({
  side,
  label,
  open,
  width,
  minWidth,
  maxWidth,
  onResize,
  onOpenChange,
  children,
}: DockedPaneProps): ReactNode {
  const live = useSharedValue(width);
  useEffect(() => {
    live.set(width);
  }, [live, width]);
  const frame = useAnimatedStyle(() => ({ width: live.get() }));
  if (!open) {
    return (
      <Rail
        side={side}
        label={label}
        onExpand={() => {
          onOpenChange(true);
        }}
      />
    );
  }
  const handle = (
    <Handle
      side={side}
      label={label}
      width={width}
      limits={{ min: minWidth, max: maxWidth }}
      live={live}
      onResize={onResize}
      onCollapse={() => {
        onOpenChange(false);
      }}
    />
  );
  return (
    <View className="h-full flex-row">
      {side === 'right' ? handle : null}
      <Animated.View style={frame} className="h-full min-w-0">
        {children}
      </Animated.View>
      {side === 'left' ? handle : null}
    </View>
  );
}
