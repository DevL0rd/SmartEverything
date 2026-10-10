import { useState } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { DURATION } from '../../../design/motion';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.5;
const WHEEL_PIXELS_PER_STEP = 400;

interface ZoomView {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

export function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

function limitOf(size: number, zoom: number): number {
  'worklet';
  return ((zoom - 1) * size) / 2;
}

export interface ZoomShared {
  readonly zoom: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly width: SharedValue<number>;
  readonly height: SharedValue<number>;
}

export function placeWithin(shared: ZoomShared, x: number, y: number): void {
  'worklet';
  const zoom = shared.zoom.get();
  shared.x.set(clamp(x, -limitOf(shared.width.get(), zoom), limitOf(shared.width.get(), zoom)));
  shared.y.set(clamp(y, -limitOf(shared.height.get(), zoom), limitOf(shared.height.get(), zoom)));
}

export interface Zoom {
  readonly shared: ZoomShared;
  readonly view: ZoomView;
  readonly report: (view: ZoomView) => void;
  readonly style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly zoomBy: (by: number) => void;
  readonly toggle: () => void;
  readonly reset: () => void;
  readonly wheel: (deltaY: number) => void;
}

function settle(shared: ZoomShared, next: ZoomView, animate: boolean): ZoomView {
  const zoom = clamp(next.zoom, ZOOM_MIN, ZOOM_MAX);
  const width = limitOf(shared.width.get(), zoom);
  const height = limitOf(shared.height.get(), zoom);
  const x = clamp(next.x, -width, width);
  const y = clamp(next.y, -height, height);
  const to = (value: number): number =>
    animate ? withTiming(value, { duration: DURATION.medium }) : value;
  shared.zoom.set(to(zoom));
  shared.x.set(to(x));
  shared.y.set(to(y));
  return { zoom, x, y };
}

export function useZoom(reduced: boolean): Zoom {
  const shared: ZoomShared = {
    zoom: useSharedValue(1),
    x: useSharedValue(0),
    y: useSharedValue(0),
    width: useSharedValue(0),
    height: useSharedValue(0),
  };
  const [view, setView] = useState<ZoomView>({ zoom: 1, x: 0, y: 0 });
  const apply = (next: ZoomView): void => {
    setView(settle(shared, next, !reduced));
  };
  const style = useAnimatedStyle((): ViewStyle => ({
    transform: [
      { translateX: shared.x.get() },
      { translateY: shared.y.get() },
      { scale: shared.zoom.get() },
    ],
  }));
  return {
    shared,
    view,
    report: setView,
    style,
    onLayout: (event): void => {
      shared.width.set(event.nativeEvent.layout.width);
      shared.height.set(event.nativeEvent.layout.height);
    },
    zoomBy: (by): void => {
      apply({ ...view, zoom: view.zoom + by });
    },
    toggle: (): void => {
      apply(view.zoom > 1 ? { zoom: 1, x: 0, y: 0 } : { zoom: 2, x: 0, y: 0 });
    },
    reset: (): void => {
      apply({ zoom: 1, x: 0, y: 0 });
    },
    wheel: (deltaY): void => {
      apply({ ...view, zoom: view.zoom - deltaY / WHEEL_PIXELS_PER_STEP });
    },
  };
}
