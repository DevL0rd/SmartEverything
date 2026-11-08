import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { WideClass } from '../card/wide-card';

export const RING_PX: Readonly<Record<WideClass, number>> = { m: 52, w: 64, l: 88, xl: 88 };
export const SPARK_PX: Readonly<Record<WideClass, number>> = { m: 32, w: 40, l: 64, xl: 64 };

const RING_LABEL_LINE = 22;
const CAPTION_LINE = 16;

export const RING_STROKE_PX = 6;
export const RING_MIN_PX = RING_LABEL_LINE + 2 * RING_STROKE_PX;
export const SPARK_MIN_PX = CAPTION_LINE;
export const TRACK_MIN_PX = 8;
export const TIMELINE_CAPTIONS_PX = 4 + CAPTION_LINE;

export interface GraphRoom {
  readonly room: number;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

export function roomWithin(cap: number, height: number): number {
  return Math.max(0, Math.min(cap, Math.floor(height)));
}

export function shownPx(cap: number, room: number, least: number): number | null {
  const px = Math.min(cap, room);
  return px < least ? null : px;
}

export function useGraphRoom(cap: number): GraphRoom {
  const [room, setRoom] = useState(cap);
  return {
    room: Math.min(room, cap),
    onLayout: (event): void => {
      setRoom(roomWithin(cap, event.nativeEvent.layout.height));
    },
  };
}

export function trackPx(track: number, room: number): number | null {
  return shownPx(track, room - TIMELINE_CAPTIONS_PX, TRACK_MIN_PX);
}

export function emptyStripPx(strip: number, room: number): number | null {
  return shownPx(strip, room, SPARK_MIN_PX);
}
