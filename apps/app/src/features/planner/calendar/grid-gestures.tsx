import type { PlannerOccurrenceView } from '@smarteverything/domain';
import { useEffect, useState, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type PanGesture,
  type PinchGesture,
} from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withSpring,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { swallowNextClick } from '../../../components/level-math';
import { cn } from '../../../design/cn';
import { SPRING, useMotion } from '../../../design/motion';
import { isNative } from '../../../design/platform';
import { localDayKey, shiftDay, zonedInstant } from '../../../format/time';
import { heavyThud, selectionTick } from '../../../platform/haptics';
import { DAY_MINUTES, wallMinuteOf, type GridBlock } from './time-grid-layout';

export const SNAP_MINUTES = 15;

const HOLD_MS = 300;

const MIN_DISTANCE = 4;

const HOURS = 24;

const START_EDGE_FROM = 60;

export type DragMode = 'move' | 'start' | 'end';

export interface MinuteSpan {
  readonly from: number;
  readonly to: number;
}

export interface BlockShift {
  readonly days: number;
  readonly start: number;
  readonly end: number;
}

export interface BlockChange extends BlockShift {
  readonly block: GridBlock;
}

export interface ScrollAnchor {
  readonly scroll: number;
  readonly focal: number;
  readonly before: number;
}

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

export function snapMinute(minute: number): number {
  'worklet';
  return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

export function minuteAt(y: number, hourHeight: number): number {
  'worklet';
  return clamp((y / hourHeight) * 60, 0, DAY_MINUTES);
}

export function pixelsOf(minutes: number, hourHeight: number): number {
  'worklet';
  return (minutes / 60) * hourHeight;
}

export function draggedSpan(mode: DragMode, span: MinuteSpan, delta: number): MinuteSpan {
  'worklet';
  if (mode === 'start') {
    return { from: clamp(snapMinute(span.from + delta), 0, span.to - SNAP_MINUTES), to: span.to };
  }
  if (mode === 'end') {
    const to = clamp(snapMinute(span.to + delta), span.from + SNAP_MINUTES, DAY_MINUTES);
    return { from: span.from, to };
  }
  const length = span.to - span.from;
  const from = clamp(snapMinute(span.from + delta), 0, DAY_MINUTES - length);
  return { from, to: from + length };
}

export function dayShiftOf(dx: number, width: number, index: number, count: number): number {
  'worklet';
  return clamp(Math.round(dx / width), -index, count - 1 - index);
}

export function clampHourHeight(next: number, viewport: number): number {
  'worklet';
  return clamp(next, viewport / HOURS, viewport);
}

export function anchoredScroll(anchor: ScrollAnchor, after: number): number {
  'worklet';
  return Math.max(0, ((anchor.scroll + anchor.focal) * after) / anchor.before - anchor.focal);
}

function shifted(moment: string, days: number, minutes: number, timeZone: string): string {
  const at = Date.parse(moment);
  const day = shiftDay(localDayKey(at, timeZone), days);
  return new Date(zonedInstant(day, wallMinuteOf(at, timeZone) + minutes, timeZone)).toISOString();
}

export function changedTimes(
  occurrence: Pick<PlannerOccurrenceView, 'start' | 'end' | 'due_at'>,
  shift: BlockShift,
  timeZone: string,
): { readonly at: string; readonly end: string | null } {
  const begin = occurrence.start ?? occurrence.due_at;
  if (begin === null) throw new Error('A timed block needs a start or a due time');
  return {
    at: shifted(begin, shift.days, shift.start, timeZone),
    end: occurrence.end === null ? null : shifted(occurrence.end, shift.days, shift.end, timeZone),
  };
}

export function dragActivation(touch: boolean): PanGesture {
  const pan = Gesture.Pan();
  return touch ? pan.activateAfterLongPress(HOLD_MS) : pan.minDistance(MIN_DISTANCE);
}

export function liftFeedback(touch: boolean): void {
  if (touch) heavyThud();
  if (!isNative()) swallowNextClick(document);
}

export function stepFeedback(): void {
  selectionTick();
}

export interface HourZoom {
  readonly hourHeight: SharedValue<number>;
  readonly settled: number;
  readonly scroll: AnimatedRef<Animated.ScrollView>;
  readonly gesture: PinchGesture;
  readonly onViewport: (height: number) => void;
}

export function useHourZoom(initial: number): HourZoom {
  const hourHeight = useSharedValue(initial);
  const [settled, setSettled] = useState(initial);
  const [viewport, setViewport] = useState(0);
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scroll);
  const anchor = useSharedValue<ScrollAnchor>({ scroll: 0, focal: 0, before: initial });
  const gesture = Gesture.Pinch()
    .enabled(viewport > 0)
    .onStart((event) => {
      anchor.set({ scroll: offset.get(), focal: event.focalY, before: hourHeight.get() });
    })
    .onUpdate((event) => {
      const start = anchor.get();
      const next = clampHourHeight(start.before * event.scale, viewport);
      hourHeight.set(next);
      scrollTo(scroll, 0, anchoredScroll(start, next), false);
    })
    .onEnd(() => {
      scheduleOnRN(setSettled, hourHeight.get());
    });
  return { hourHeight, settled, scroll, gesture, onViewport: setViewport };
}

export function useMinuteBand(
  span: MinuteSpan,
  hourHeight: SharedValue<number>,
  minHeight = 0,
): ReturnType<typeof useAnimatedStyle<ViewStyle>> {
  return useAnimatedStyle<ViewStyle>(() => ({
    top: pixelsOf(span.from, hourHeight.get()),
    height: Math.max(minHeight, pixelsOf(span.to - span.from, hourHeight.get())),
  }));
}

export interface BlockDragContext {
  readonly hourHeight: SharedValue<number>;
  readonly minHeight: number;
  readonly columnWidth: number;
  readonly dayIndex: number;
  readonly dayCount: number;
  readonly touch: boolean;
  readonly onChange: (change: BlockChange) => void;
}

interface Offsets {
  readonly start: SharedValue<number>;
  readonly end: SharedValue<number>;
  readonly days: SharedValue<number>;
}

function useOffsets(block: GridBlock): Offsets {
  const start = useSharedValue(0);
  const end = useSharedValue(0);
  const days = useSharedValue(0);
  useEffect(() => {
    start.set(0);
    end.set(0);
    days.set(0);
  }, [block.from, block.to, start, end, days]);
  return { start, end, days };
}

function settleTo(value: SharedValue<number>, to: number, reduced: boolean): void {
  'worklet';
  value.set(reduced ? to : withSpring(to, SPRING));
}

interface PanInput {
  readonly mode: DragMode;
  readonly block: GridBlock;
  readonly context: BlockDragContext;
  readonly offsets: Offsets;
  readonly reduced: boolean;
}

interface PanGeometry {
  readonly span: MinuteSpan;
  readonly hourHeight: Pick<SharedValue<number>, 'get'>;
  readonly columnWidth: number;
  readonly dayIndex: number;
  readonly dayCount: number;
}

export function shiftOf(mode: DragMode, geometry: PanGeometry, dx: number, dy: number): BlockShift {
  'worklet';
  const { span } = geometry;
  const next = draggedSpan(mode, span, (dy / geometry.hourHeight.get()) * 60);
  const days =
    mode === 'move'
      ? dayShiftOf(dx, geometry.columnWidth, geometry.dayIndex, geometry.dayCount)
      : 0;
  return { days, start: next.from - span.from, end: next.to - span.to };
}

export function sameShift(left: BlockShift, right: BlockShift): boolean {
  'worklet';
  return left.days === right.days && left.start === right.start && left.end === right.end;
}

const STILL: BlockShift = { days: 0, start: 0, end: 0 };

function useBlockPan({ mode, block, context, offsets, reduced }: PanInput): PanGesture {
  const target = useSharedValue<BlockShift>(STILL);
  const { touch } = context;
  const geometry: PanGeometry = {
    span: { from: block.from, to: block.to },
    hourHeight: context.hourHeight,
    columnWidth: context.columnWidth,
    dayIndex: context.dayIndex,
    dayCount: context.dayCount,
  };
  const commit = (shift: BlockShift): void => {
    context.onChange({ ...shift, block });
  };
  return dragActivation(touch)
    .enabled(!block.readOnly && context.columnWidth > 0)
    .onStart(() => {
      target.set(STILL);
      scheduleOnRN(liftFeedback, touch);
    })
    .onUpdate((event) => {
      const next = shiftOf(mode, geometry, event.translationX, event.translationY);
      if (sameShift(next, target.get())) return;
      target.set(next);
      settleTo(offsets.start, next.start, reduced);
      settleTo(offsets.end, next.end, reduced);
      settleTo(offsets.days, next.days, reduced);
      scheduleOnRN(stepFeedback);
    })
    .onEnd(() => {
      const last = target.get();
      if (!sameShift(last, STILL)) scheduleOnRN(commit, last);
    });
}

function Edge({
  mode,
  gesture,
}: {
  readonly mode: DragMode;
  readonly gesture: PanGesture;
}): ReactNode {
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        aria-hidden
        className={cn(
          'absolute inset-x-0 z-10 h-2.5 cursor-ns-resize',
          mode === 'start' ? 'top-0' : 'bottom-0',
        )}
      />
    </GestureDetector>
  );
}

export interface MovableBlockProps {
  readonly block: GridBlock;
  readonly context: BlockDragContext;
  readonly lane: { readonly left: `${number}%`; readonly width: `${number}%` };
  readonly className: string;
  readonly children: ReactNode;
}

export function MovableBlock({
  block,
  context,
  lane,
  className,
  children,
}: MovableBlockProps): ReactNode {
  const { reduced } = useMotion();
  const offsets = useOffsets(block);
  const base = { block, context, offsets, reduced };
  const move = useBlockPan({ ...base, mode: 'move' });
  const start = useBlockPan({ ...base, mode: 'start' }).blocksExternalGesture(move);
  const end = useBlockPan({ ...base, mode: 'end' }).blocksExternalGesture(move);
  const resizable = !block.readOnly && block.occurrence.end !== null;
  const placed = useAnimatedStyle<ViewStyle>(() => {
    const hour = context.hourHeight.get();
    const from = block.from + offsets.start.get();
    const to = block.to + offsets.end.get();
    const moving = offsets.start.get() !== 0 || offsets.end.get() !== 0 || offsets.days.get() !== 0;
    return {
      top: pixelsOf(from, hour),
      height: Math.max(context.minHeight, pixelsOf(to - from, hour)),
      transform: [{ translateX: offsets.days.get() * context.columnWidth }],
      zIndex: moving ? 10 : 0,
    };
  });
  return (
    <GestureDetector gesture={move}>
      <Animated.View style={[lane, placed]} className={cn('absolute', className)}>
        {children}
        {resizable && block.to - block.from >= START_EDGE_FROM ? (
          <Edge mode="start" gesture={start} />
        ) : null}
        {resizable ? <Edge mode="end" gesture={end} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}
