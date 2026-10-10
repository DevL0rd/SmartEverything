import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useMotion } from '../design/motion';
import { useIdiom } from '../design/platform';
import type { Frame } from './widget-board/board-geometry';
import { useAutoScroll, useDragState, type DragState } from './widget-board/edit/drag-state';
import {
  useMoveGesture,
  useWidgetMotion,
  useWidgetStyle,
} from './widget-board/edit/use-widget-motion';

export interface ReorderableListProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly labelOf: (item: T) => string;
  readonly renderItem: (item: T) => ReactElement;
  readonly onReorder: (keys: readonly string[]) => void;
}

const ACTIONS = [
  { name: 'earlier', label: 'Move up' },
  { name: 'later', label: 'Move down' },
] as const;

function moved(order: readonly string[], key: string, target: string | null): readonly string[] {
  const rest = order.filter((entry) => entry !== key);
  if (target === null) {
    return [...rest, key];
  }
  const from = order.indexOf(key);
  const to = order.indexOf(target);
  const at = rest.indexOf(target) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), key, ...rest.slice(at)];
}

function shifted(order: readonly string[], key: string, offset: -1 | 1): readonly string[] {
  const from = order.indexOf(key);
  const to = from + offset;
  if (to < 0 || to >= order.length) {
    return order;
  }
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

function framesOf(
  order: readonly string[],
  heights: Readonly<Record<string, number>>,
  width: number,
): Readonly<Record<string, Frame>> {
  const frames: Record<string, Frame> = {};
  let top = 0;
  for (const key of order) {
    const height = heights[key] ?? 0;
    frames[key] = { left: 0, top, width, height };
    top += height;
  }
  return frames;
}

interface RowProps {
  readonly rowKey: string;
  readonly label: string;
  readonly frame: Frame;
  readonly first: boolean;
  readonly drag: DragState;
  readonly onLift: (key: string) => void;
  readonly onDrop: () => void;
  readonly onShift: (key: string, offset: -1 | 1) => void;
  readonly onHeight: (key: string, height: number) => void;
  readonly children: ReactNode;
}

function Row(props: RowProps): ReactNode {
  const { rowKey, frame, drag } = props;
  const { reduced } = useMotion();
  const touch = useIdiom() === 'touch';
  const motion = useWidgetMotion(frame, reduced);
  const still = useSharedValue(0);
  const style = useWidgetStyle(rowKey, motion, drag, still);
  const gesture = useMoveGesture({
    key: rowKey,
    touch,
    motion,
    drag,
    onLift: props.onLift,
    onDrop: props.onDrop,
  });
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={style}
        className="absolute bg-surface-1"
        accessible
        accessibilityLabel={props.label}
        accessibilityHint={touch ? 'Hold and drag to reorder' : 'Drag to reorder'}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          props.onShift(rowKey, event.nativeEvent.actionName === 'earlier' ? -1 : 1);
        }}
      >
        <View
          onLayout={(event: LayoutChangeEvent) => {
            props.onHeight(rowKey, event.nativeEvent.layout.height);
          }}
        >
          {props.first ? null : <View className="ml-18 h-hairline bg-outline-variant" />}
          {props.children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function useReorder<T>(props: ReorderableListProps<T>): {
  readonly order: readonly string[];
  readonly drag: DragState;
  readonly lift: () => void;
  readonly drop: () => void;
  readonly shift: (key: string, offset: -1 | 1) => void;
} {
  const keys = props.items.map(props.keyOf);
  const [dragging, setDragging] = useState<readonly string[] | null>(null);
  const latest = useRef<readonly string[] | null>(null);
  const current = useRef({ keys, onReorder: props.onReorder });
  useEffect(() => {
    current.current = { keys, onReorder: props.onReorder };
  });
  const order = dragging ?? keys;
  const update = (next: readonly string[] | null): void => {
    latest.current = next;
    setDragging(next);
  };
  const drag = useDragState((key: string, target: string | null): void => {
    update(moved(latest.current ?? current.current.keys, key, target));
  });
  const autoScroll = useAutoScroll(drag);
  return {
    order,
    drag,
    lift: (): void => {
      update(current.current.keys);
      autoScroll(true);
    },
    drop: (): void => {
      autoScroll(false);
      const final = latest.current;
      if (final !== null && final.join() !== current.current.keys.join()) {
        current.current.onReorder(final);
      }
      update(null);
    },
    shift: (key, offset): void => {
      const next = shifted(keys, key, offset);
      if (next !== keys) {
        props.onReorder(next);
      }
    },
  };
}

function useSharedFrames(
  reorder: { readonly order: readonly string[]; readonly drag: DragState },
  heights: Readonly<Record<string, number>>,
  width: number,
): Readonly<Record<string, Frame>> {
  const frames = framesOf(reorder.order, heights, width);
  const shared = reorder.drag.frames;
  useEffect(() => {
    shared.set(frames);
  }, [frames, shared]);
  return frames;
}

function useHeights(): {
  readonly heights: Readonly<Record<string, number>>;
  readonly measure: (key: string, height: number) => void;
} {
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  return {
    heights,
    measure: (key, height): void => {
      setHeights((current) => (current[key] === height ? current : { ...current, [key]: height }));
    },
  };
}

export function ReorderableList<T>(props: ReorderableListProps<T>): ReactNode {
  const { heights, measure } = useHeights();
  const [width, setWidth] = useState(0);
  const reorder = useReorder(props);
  const frames = useSharedFrames(reorder, heights, width);
  const total = Object.values(frames).reduce(
    (sum, frame) => Math.max(sum, frame.top + frame.height),
    0,
  );
  const container = useAnimatedStyle(() => ({ height: total }), [total]);
  return (
    <Animated.View
      style={container}
      onLayout={(event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1"
    >
      {width === 0
        ? null
        : props.items.map((item) => {
            const key = props.keyOf(item);
            const frame = frames[key];
            if (frame === undefined) {
              return null;
            }
            return (
              <Row
                key={key}
                rowKey={key}
                label={props.labelOf(item)}
                frame={frame}
                first={reorder.order[0] === key}
                drag={reorder.drag}
                onLift={reorder.lift}
                onDrop={reorder.drop}
                onShift={reorder.shift}
                onHeight={measure}
              >
                {props.renderItem(item)}
              </Row>
            );
          })}
    </Animated.View>
  );
}
