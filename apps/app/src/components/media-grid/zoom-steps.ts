import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { isNative } from '../../design/platform';
import {
  MEDIA_ZOOM_STEPS,
  rowHeight,
  TILE_GAP,
  type MediaGridRow,
  type MediaZoomStep,
  type TileRow,
} from './justify';

export const WHEEL_PIXELS_PER_STEP = 100;

const WHEEL_LINE_PIXELS = 40;

export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

export type StepChange = (step: MediaZoomStep, focal: FocalPoint) => void;

const HEIGHTS = MEDIA_ZOOM_STEPS.map((step) => rowHeight(step, 'pointer'));

function thresholdOf(from: number, to: number): number {
  const here = HEIGHTS[from];
  const there = HEIGHTS[to];
  return here === undefined || there === undefined ? Number.NaN : Math.sqrt(there / here);
}

const IN_AT = MEDIA_ZOOM_STEPS.map((_, index) => thresholdOf(index, index + 1));
const OUT_AT = MEDIA_ZOOM_STEPS.map((_, index) => thresholdOf(index, index - 1));
const LAST = MEDIA_ZOOM_STEPS.length - 1;

export function stepIndex(step: MediaZoomStep): number {
  return MEDIA_ZOOM_STEPS.indexOf(step);
}

export function stepAt(index: number): MediaZoomStep {
  const step = MEDIA_ZOOM_STEPS[Math.min(LAST, Math.max(0, index))];
  if (step === undefined) throw new RangeError('The zoom steps cannot be empty');
  return step;
}

export function shiftStep(step: MediaZoomStep, by: number): MediaZoomStep {
  return stepAt(stepIndex(step) + by);
}

export function pinchShift(index: number, scale: number): number {
  'worklet';
  const inAt = IN_AT[index] ?? Number.NaN;
  const outAt = OUT_AT[index] ?? Number.NaN;
  if (scale >= inAt) return 1;
  if (scale <= outAt) return -1;
  return 0;
}

export interface WheelTurn {
  readonly shift: number;
  readonly pending: number;
}

export function wheelTurn(index: number, pending: number, deltaY: number): WheelTurn {
  const kept = Math.sign(pending) === Math.sign(-deltaY) ? pending : 0;
  const total = kept - deltaY;
  if ((total > 0 && index >= LAST) || (total < 0 && index <= 0)) return { shift: 0, pending: 0 };
  const steps = Math.trunc(total / WHEEL_PIXELS_PER_STEP);
  const target = Math.min(LAST, Math.max(0, index + steps));
  return { shift: target - index, pending: total - steps * WHEEL_PIXELS_PER_STEP };
}

export function tileAtX(row: TileRow, x: number): string | null {
  let edge = 0;
  for (const placed of row.tiles) {
    edge += placed.width + TILE_GAP;
    if (x < edge) return placed.tile.id;
  }
  return row.tiles.at(-1)?.tile.id ?? null;
}

export function rowIndexOfTile(rows: readonly MediaGridRow[], id: string): number {
  return rows.findIndex(
    (row) => row.kind === 'tiles' && row.tiles.some((placed) => placed.tile.id === id),
  );
}

function wheelDelta(event: WheelEvent): number {
  return event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
    ? event.deltaY
    : event.deltaY * WHEEL_LINE_PIXELS;
}

function useWheelZoom(
  frame: RefObject<View | null>,
  step: MediaZoomStep,
  onStep: StepChange,
): void {
  const latest = useRef({ step, onStep });
  useEffect(() => {
    latest.current = { step, onStep };
  });
  useEffect(() => {
    const node = frame.current;
    if (isNative() || !(node instanceof HTMLElement)) return undefined;
    let pending = 0;
    const turn = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = latest.current;
      const index = stepIndex(current.step);
      const next = wheelTurn(index, pending, wheelDelta(event));
      pending = next.pending;
      if (next.shift === 0) return;
      const box = node.getBoundingClientRect();
      current.onStep(stepAt(index + next.shift), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    node.addEventListener('wheel', turn, { passive: false });
    return (): void => {
      node.removeEventListener('wheel', turn);
    };
  }, [frame]);
}

export type ZoomGesture = ReturnType<typeof Gesture.Pinch>;

function usePinchZoom(step: MediaZoomStep, onStep: StepChange): ZoomGesture {
  const index = useSharedValue(stepIndex(step));
  const base = useSharedValue(1);
  useEffect(() => {
    index.set(stepIndex(step));
  }, [index, step]);
  const report = (next: number, x: number, y: number): void => {
    onStep(stepAt(next), { x, y });
  };
  return Gesture.Pinch()
    .onBegin(() => {
      base.set(1);
    })
    .onUpdate((event) => {
      const shift = pinchShift(index.get(), event.scale / base.get());
      const next = index.get() + shift;
      if (shift === 0 || next < 0 || next > LAST) return;
      index.set(next);
      base.set(event.scale);
      scheduleOnRN(report, next, event.focalX, event.focalY);
    });
}

export function useZoomSteps(
  frame: RefObject<View | null>,
  step: MediaZoomStep,
  onStep: StepChange,
): ZoomGesture {
  useWheelZoom(frame, step, onStep);
  return usePinchZoom(step, onStep);
}
