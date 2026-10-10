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

export type Vertical = { readonly top: number } | { readonly bottom: number };

export interface Placed {
  readonly left: number;
  readonly vertical: Vertical;
  readonly maxHeight: number;
}

interface WindowSize {
  readonly width: number;
  readonly height: number;
}

const MARGIN = 8;
const GAP = 4;
const ROOM_ENOUGH = 240;

function leftOf(anchor: Rect, width: number, window: WindowSize): number {
  return Math.min(Math.max(MARGIN, anchor.x), window.width - width - MARGIN);
}

export function placeBelow(anchor: Rect, width: number, window: WindowSize): Placement {
  const below = anchor.y + anchor.height + GAP;
  const roomBelow = window.height - below - MARGIN;
  const roomAbove = anchor.y - MARGIN;
  const left = leftOf(anchor, width, window);
  if (roomBelow >= ROOM_ENOUGH || roomBelow >= roomAbove) {
    return { left, top: below, maxHeight: roomBelow };
  }
  return { left, top: MARGIN, maxHeight: roomAbove };
}

export function placeNear(anchor: Rect, width: number, window: WindowSize): Placed {
  const below = anchor.y + anchor.height + GAP;
  const roomBelow = window.height - below - MARGIN;
  const roomAbove = anchor.y - GAP - MARGIN;
  const left = leftOf(anchor, width, window);
  if (roomBelow >= ROOM_ENOUGH || roomBelow >= roomAbove) {
    return { left, vertical: { top: below }, maxHeight: roomBelow };
  }
  return {
    left,
    vertical: { bottom: window.height - anchor.y + GAP },
    maxHeight: roomAbove,
  };
}

export function centredRect(window: WindowSize): Rect {
  return pointRect(window.width / 2, window.height / 2);
}
