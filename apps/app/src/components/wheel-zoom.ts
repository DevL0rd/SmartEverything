import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { isNative } from '../design/platform';

const LINE_PIXELS = 40;
const DOM_DELTA_PIXEL = 0;

export type WheelZoom = 'wheel' | 'ctrl-wheel';

export interface WheelTurn {
  readonly pixels: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function wheelPixels(deltaY: number, deltaMode: number): number {
  return deltaMode === DOM_DELTA_PIXEL ? deltaY : deltaY * LINE_PIXELS;
}

export function zoomsOn(mode: WheelZoom, ctrlKey: boolean): boolean {
  return mode === 'wheel' || ctrlKey;
}

export function useWheelZoom(
  frame: RefObject<View | null>,
  mode: WheelZoom,
  onTurn: (turn: WheelTurn) => void,
): void {
  const latest = useRef({ mode, onTurn });
  useEffect(() => {
    latest.current = { mode, onTurn };
  });
  useEffect(() => {
    const node = frame.current;
    if (isNative() || !(node instanceof HTMLElement)) return undefined;
    const turn = (event: WheelEvent): void => {
      if (!zoomsOn(latest.current.mode, event.ctrlKey)) return;
      event.preventDefault();
      const box = node.getBoundingClientRect();
      latest.current.onTurn({
        pixels: wheelPixels(event.deltaY, event.deltaMode),
        x: event.clientX - box.left,
        y: event.clientY - box.top,
        width: box.width,
        height: box.height,
      });
    };
    node.addEventListener('wheel', turn, { passive: false });
    return (): void => {
      node.removeEventListener('wheel', turn);
    };
  }, [frame]);
}
