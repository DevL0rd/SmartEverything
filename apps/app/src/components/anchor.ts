import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Idiom } from '../design/tokens';

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

type Vertical = { readonly top: number } | { readonly bottom: number };

export interface Placed {
  readonly left: number;
  readonly vertical: Vertical;
  readonly maxHeight: number;
}

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export const MARGIN = 8;
export const GAP = 4;
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

export function placeAbove(anchor: Rect, width: number, window: WindowSize): Placed {
  return {
    left: leftOf(anchor, width, window),
    vertical: { bottom: window.height - anchor.y + GAP },
    maxHeight: Math.max(0, anchor.y - GAP - MARGIN),
  };
}

export interface Insets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface PanelSize {
  readonly width: number;
  readonly maxHeight: number;
  readonly minHeight: number;
}

export type PanelPresentation = 'popover' | 'dialog' | 'sheet';

export interface PanelPlacement {
  readonly presentation: PanelPresentation;
  readonly frame: Rect;
}

export const PANEL_SIZE: PanelSize = { width: 400, maxHeight: 560, minHeight: 360 };

const DIALOG_WIDTH = 480;
const SHEET_MAX_WIDTH = 560;
const SHORT_WINDOW_HEIGHT = 480;
const MIN_FRAME = 1;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function centred(width: number, height: number, window: WindowSize): Rect {
  return {
    x: (window.width - width) / 2,
    y: (window.height - height) / 2,
    width,
    height,
  };
}

function dialogFrame(size: PanelSize, window: WindowSize): Rect {
  const width = Math.max(MIN_FRAME, Math.min(DIALOG_WIDTH, window.width - 2 * MARGIN));
  const height = Math.max(MIN_FRAME, Math.min(size.maxHeight, window.height - 2 * MARGIN));
  return centred(width, height, window);
}

function sheetFrame(size: PanelSize, window: WindowSize, safeArea: Insets): Rect {
  const width = Math.min(SHEET_MAX_WIDTH, window.width);
  const height = Math.max(
    MIN_FRAME,
    Math.min(size.maxHeight, window.height - safeArea.top - MARGIN),
  );
  return { x: (window.width - width) / 2, y: window.height - height, width, height };
}

function popoverFrame(anchor: Rect, size: PanelSize, window: WindowSize, space: number): Rect {
  const width = Math.max(MIN_FRAME, Math.min(size.width, window.width - 2 * MARGIN));
  const height = Math.max(MIN_FRAME, Math.min(size.maxHeight, space));
  return {
    x: clamp(anchor.x + anchor.width - width, MARGIN, window.width - width - MARGIN),
    y: anchor.y - GAP - height,
    width,
    height,
  };
}

export interface PanelContext {
  readonly window: WindowSize;
  readonly safeArea: Insets;
  readonly idiom: Idiom;
}

export function placePanel(
  anchor: Rect,
  size: PanelSize,
  { window, safeArea, idiom }: PanelContext,
): PanelPlacement {
  if (idiom === 'touch') {
    return { presentation: 'sheet', frame: sheetFrame(size, window, safeArea) };
  }
  const space = anchor.y - safeArea.top - MARGIN - GAP;
  if (window.height < SHORT_WINDOW_HEIGHT || space < size.minHeight) {
    return { presentation: 'dialog', frame: dialogFrame(size, window) };
  }
  return { presentation: 'popover', frame: popoverFrame(anchor, size, window, space) };
}

export function settlePanel(previous: PanelPlacement | null, next: PanelPlacement): PanelPlacement {
  if (previous === null) {
    return next;
  }
  const kept =
    previous.presentation === 'popover' && next.presentation === 'popover'
      ? shrunk(previous.frame, next.frame)
      : next.frame;
  const same =
    previous.presentation === next.presentation &&
    previous.frame.x === kept.x &&
    previous.frame.y === kept.y &&
    previous.frame.width === kept.width &&
    previous.frame.height === kept.height;
  return same ? previous : { presentation: next.presentation, frame: kept };
}

function shrunk(previous: Rect, next: Rect): Rect {
  const height = Math.min(previous.height, next.height);
  return { ...next, height, y: next.y + next.height - height };
}
