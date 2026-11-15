import { useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { useWheelZoom, type WheelZoom } from '../../../components/wheel-zoom';
import type { FrameSize } from '../world-map/projection';
import { mapWheelOf, zoomedAt, type MapView } from './map-view';

export interface WheelMap {
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
}

export function useMapWheel(
  ref: RefObject<View | null>,
  mode: WheelZoom,
  map: WheelMap,
  frame: FrameSize | null,
): void {
  const pending = useRef(0);
  useWheelZoom(ref, mode, (turn) => {
    const next = mapWheelOf(pending.current, turn.pixels);
    pending.current = next.pending;
    if (next.steps === 0 || frame === null) return;
    map.onView(zoomedAt(map.view, next.steps, { x: turn.x, y: turn.y }, frame));
  });
}
