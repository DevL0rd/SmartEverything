import type { RefObject } from 'react';
import type { View } from 'react-native';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function measureAnchor(ref: RefObject<View | null>, done: (rect: Rect) => void): void {
  ref.current?.measureInWindow((x, y, width, height) => {
    done({ x, y, width, height });
  });
}

export function pointRect(x: number, y: number): Rect {
  return { x, y, width: 0, height: 0 };
}

export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

const MARGIN = 8;

export function placeBelow(
  anchor: Rect,
  width: number,
  window: { readonly width: number; readonly height: number },
): Placement {
  const left = Math.min(Math.max(MARGIN, anchor.x), window.width - width - MARGIN);
  const below = anchor.y + anchor.height + 4;
  const roomBelow = window.height - below - MARGIN;
  const roomAbove = anchor.y - MARGIN;
  if (roomBelow >= 240 || roomBelow >= roomAbove) {
    return { left, top: below, maxHeight: roomBelow };
  }
  const maxHeight = roomAbove;
  return { left, top: MARGIN, maxHeight };
}
