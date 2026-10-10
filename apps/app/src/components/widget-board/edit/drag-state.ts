import { useWindowDimensions } from 'react-native';
import {
  scrollTo,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScreen } from '../../screen-context';
import type { Frame } from '../board-geometry';

export const NO_TARGET = '';

const END_TARGET = '#end';

export interface DragPoint {
  readonly originLeft: number;
  readonly originTop: number;
  readonly grabX: number;
  readonly grabY: number;
  readonly dx: number;
  readonly dy: number;
  readonly scrollStart: number;
  readonly pointerY: number;
}

export const RESTING: DragPoint = {
  originLeft: 0,
  originTop: 0,
  grabX: 0,
  grabY: 0,
  dx: 0,
  dy: 0,
  scrollStart: 0,
  pointerY: -1,
};

export interface DragState {
  readonly key: SharedValue<string>;
  readonly point: SharedValue<DragPoint>;
  readonly target: SharedValue<string>;
  readonly frames: SharedValue<Readonly<Record<string, Frame>>>;
  readonly scrollY: SharedValue<number>;
  readonly onTarget: (key: string, target: string | null) => void;
}

function contains(frame: Frame, x: number, y: number): boolean {
  'worklet';
  return (
    x >= frame.left &&
    x <= frame.left + frame.width &&
    y >= frame.top &&
    y <= frame.top + frame.height
  );
}

function targetAt(
  frames: Readonly<Record<string, Frame>>,
  self: string,
  x: number,
  y: number,
): string {
  'worklet';
  let bottom = 0;
  for (const [key, frame] of Object.entries(frames)) {
    if (key !== self && contains(frame, x, y)) {
      return key;
    }
    bottom = Math.max(bottom, frame.top + frame.height);
  }
  return y > bottom ? END_TARGET : NO_TARGET;
}

export function draggedPosition(point: DragPoint, scrollY: number): { left: number; top: number } {
  'worklet';
  return {
    left: point.originLeft + point.dx,
    top: point.originTop + point.dy + scrollY - point.scrollStart,
  };
}

export function hitTest(state: DragState): void {
  'worklet';
  const self = state.key.get();
  if (self === NO_TARGET) {
    return;
  }
  const point = state.point.get();
  const at = draggedPosition(point, state.scrollY.get());
  const target = targetAt(state.frames.get(), self, at.left + point.grabX, at.top + point.grabY);
  if (target === state.target.get()) {
    return;
  }
  state.target.set(target);
  if (target !== NO_TARGET) {
    scheduleOnRN(state.onTarget, self, target === END_TARGET ? null : target);
  }
}

export function useDragState(onTarget: (key: string, target: string | null) => void): DragState {
  const { scrollY } = useScreen();
  return {
    key: useSharedValue(NO_TARGET),
    point: useSharedValue(RESTING),
    target: useSharedValue(NO_TARGET),
    frames: useSharedValue<Readonly<Record<string, Frame>>>({}),
    scrollY,
    onTarget,
  };
}

const EDGE = 96;
const TOP_CHROME = 72;
const BOTTOM_CHROME = 96;
const MAX_SPEED = 14;

function edgeSpeed(pointerY: number, height: number): number {
  'worklet';
  if (pointerY < 0) {
    return 0;
  }
  const top = TOP_CHROME + EDGE - pointerY;
  if (top > 0) {
    return -Math.min(MAX_SPEED, (top / EDGE) * MAX_SPEED);
  }
  const bottom = pointerY - (height - BOTTOM_CHROME - EDGE);
  return bottom > 0 ? Math.min(MAX_SPEED, (bottom / EDGE) * MAX_SPEED) : 0;
}

export function useAutoScroll(state: DragState): (active: boolean) => void {
  const { scrollRef } = useScreen();
  const { height } = useWindowDimensions();
  const callback = useFrameCallback(() => {
    if (scrollRef === null || state.key.get() === NO_TARGET) {
      return;
    }
    const speed = edgeSpeed(state.point.get().pointerY, height);
    if (speed === 0) {
      return;
    }
    scrollTo(scrollRef, 0, Math.max(0, state.scrollY.get() + speed), false);
    hitTest(state);
  }, false);
  return callback.setActive;
}
