import type { OverlayHostView, OverlayPrefs } from '@smarteverything/domain';
import type { OverlayRole, OverlaySize } from './overlay-messages.js';
import { BAR_PILL_HEIGHT, FULL_PILL_HEIGHT } from './overlay-width.js';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DisplayInfo {
  readonly id: number;
  readonly origin: Point;
  readonly workArea: Rect;
  readonly scale: number;
  readonly primary: boolean;
}

export type OverlayMode = OverlayHostView['mode'];
export type Vertical = 'bottom' | 'top';
type Horizontal = 'left' | 'centre' | 'right';
export type Anchor = `${Vertical}-${Horizontal}`;

const GLOW_HEIGHT = 140;
export const SIDE_GAP = 12;
const FULL_LIFT = 72;
const FULL_TOP_LIFT = 12;
const BAR_LIFT = 8;
export const TRAY_GAP = 10;
const CAPTION_PREFIX = 'SmartEverything voice';
export const FIRST_PILL_SIZE: OverlaySize = { width: 320, height: FULL_PILL_HEIGHT };
export const FIRST_TRAY_SIZE: OverlaySize = { width: 420, height: 140 };

const HORIZONTAL: Readonly<Record<OverlayPrefs['position'], Horizontal>> = {
  centre: 'centre',
  left: 'left',
  right: 'right',
};

export function anchorOf(
  mode: OverlayMode,
  position: OverlayPrefs['position'],
  fullscreen = false,
): Anchor {
  const vertical: Vertical = mode === 'compact' || fullscreen ? 'top' : 'bottom';
  return `${vertical}-${HORIZONTAL[position]}`;
}

export interface FreePosition {
  readonly cx: number;
  readonly cy: number;
}

const FREE_PREFIX = 'free@';

export function freeToken(free: FreePosition): string {
  return `${FREE_PREFIX}${free.cx.toFixed(4)},${free.cy.toFixed(4)}`;
}

function pillInset(mode: OverlayMode, vertical: Vertical): number {
  if (mode !== 'full') {
    return BAR_LIFT;
  }
  return vertical === 'bottom' ? FULL_LIFT : FULL_TOP_LIFT;
}

function trayInset(mode: OverlayMode, vertical: Vertical): number {
  const height = mode === 'full' ? FULL_PILL_HEIGHT : BAR_PILL_HEIGHT;
  return pillInset(mode, vertical) + height + TRAY_GAP;
}

export function insetOf(
  role: OverlayRole,
  mode: OverlayMode,
  vertical: Vertical = mode === 'compact' ? 'top' : 'bottom',
): number {
  if (role === 'glow') {
    return 0;
  }
  return role === 'pill' ? pillInset(mode, vertical) : trayInset(mode, vertical);
}

export function anchorFor(role: OverlayRole, anchor: Anchor): Anchor {
  return role === 'glow' ? 'bottom-centre' : anchor;
}

function horizontalOf(anchor: Anchor): Horizontal {
  if (anchor.endsWith('left')) {
    return 'left';
  }
  return anchor.endsWith('right') ? 'right' : 'centre';
}

export function verticalOf(anchor: Anchor): Vertical {
  return anchor.startsWith('top') ? 'top' : 'bottom';
}

function leftOf(horizontal: Horizontal, area: Rect, width: number): number {
  if (horizontal === 'left') {
    return area.x + SIDE_GAP;
  }
  if (horizontal === 'right') {
    return area.x + area.width - width - SIDE_GAP;
  }
  return area.x + Math.round((area.width - width) / 2);
}

export function boundsOf(anchor: Anchor, size: OverlaySize, area: Rect, inset: number): Rect {
  const x = leftOf(horizontalOf(anchor), area, size.width);
  const y =
    verticalOf(anchor) === 'top' ? area.y + inset : area.y + area.height - size.height - inset;
  return { x, y, width: size.width, height: size.height };
}

export function glowSize(area: Rect): OverlaySize {
  return { width: area.width, height: GLOW_HEIGHT };
}

export interface CaptionParts {
  readonly role: OverlayRole;
  readonly anchor: string;
  readonly output: string;
  readonly focus: boolean;
  readonly inset: number;
}

export function captionOf(parts: CaptionParts): string {
  const focus = parts.focus ? '1' : '0';
  return `${CAPTION_PREFIX} ${parts.role} ${parts.anchor} ${parts.output} ${focus} ${String(parts.inset)}`;
}

export interface DisplayHints {
  readonly cursor: Point | null;
  readonly appWindow: Rect | null;
}

function contains(area: Rect, point: Point): boolean {
  return (
    point.x >= area.x &&
    point.x < area.x + area.width &&
    point.y >= area.y &&
    point.y < area.y + area.height
  );
}

function centreOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function primaryOf(displays: readonly DisplayInfo[]): DisplayInfo | null {
  return displays.find((display) => display.primary) ?? displays[0] ?? null;
}

function activeDisplay(displays: readonly DisplayInfo[], hints: DisplayHints): DisplayInfo | null {
  const cursor = hints.cursor;
  return cursor === null ? null : (displays.find((d) => contains(d.workArea, cursor)) ?? null);
}

function appDisplay(displays: readonly DisplayInfo[], hints: DisplayHints): DisplayInfo | null {
  const window = hints.appWindow;
  return window === null
    ? null
    : (displays.find((d) => contains(d.workArea, centreOf(window))) ?? null);
}

export function chooseDisplay(
  pref: OverlayPrefs['display'],
  displays: readonly DisplayInfo[],
  hints: DisplayHints,
): DisplayInfo | null {
  const picked =
    pref === 'active'
      ? activeDisplay(displays, hints)
      : pref === 'app'
        ? appDisplay(displays, hints)
        : null;
  return picked ?? primaryOf(displays);
}

const ACTIVE_OUTPUT = 'active';

export function outputToken(pref: OverlayPrefs['display'], display: DisplayInfo | null): string {
  if (pref === 'active' || display === null) {
    return ACTIVE_OUTPUT;
  }
  return `${String(display.origin.x)},${String(display.origin.y)}`;
}
