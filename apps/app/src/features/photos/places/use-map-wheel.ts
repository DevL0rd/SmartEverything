import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { useWheelZoom, type WheelZoom } from '../../../components/wheel-zoom';
import { wheeledAt, type MapView, type WheelState } from './map-view';

export interface WheelMap {
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
}

export function useMapWheel(ref: RefObject<View | null>, mode: WheelZoom, map: WheelMap): void {
  const state = useRef<WheelState>({ view: map.view, pending: 0 });
  useEffect(() => {
    state.current = { view: map.view, pending: state.current.pending };
  }, [map.view]);
  useWheelZoom(ref, mode, (turn) => {
    if (turn.width <= 0 || turn.height <= 0) return;
    const next = wheeledAt(
      state.current,
      turn.pixels,
      { x: turn.x, y: turn.y },
      { width: turn.width, height: turn.height },
    );
    const moved = next.view !== state.current.view;
    state.current = next;
    if (moved) map.onView(next.view);
  });
}
