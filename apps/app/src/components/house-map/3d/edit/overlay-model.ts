import type { EditOverlay } from '../map-3d-edit-protocol';
import type { Point } from '../render-core-gestures';
import type { DragGrab, PointerHover } from './pointer';
import type { EditPreview } from './edit-drags';
import type { GizmoBreakpoint } from './gizmo';

export type OverlayTone = EditOverlay['labels'][number]['tone'];

export type HandleState = 'rest' | 'hover' | 'active' | 'faded';

export const HOVER_GROWTH = 1.3;

export type DrawnHandleKind = EditOverlay['handles'][number]['kind'];

export interface DrawnHandle {
  readonly id: string;
  readonly kind: DrawnHandleKind;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly size: number;
  readonly target: number;
  readonly state: HandleState;
  readonly label: string;
}

export type PathLook =
  | 'shaft-x'
  | 'shaft-y'
  | 'shaft-z'
  | 'ring'
  | 'frame'
  | 'frame-grown'
  | 'link'
  | 'stalk'
  | 'axis-guide'
  | 'tick'
  | 'tick-major'
  | 'wedge'
  | 'ghost'
  | 'ghost-area'
  | 'face'
  | 'tint'
  | 'place'
  | 'landing';

export interface DrawnPath {
  readonly key: string;
  readonly d: string;
  readonly look: PathLook;
  readonly tone: OverlayTone | null;
  readonly state: HandleState;
}

export type PillLook = 'live' | 'snap' | 'tip' | 'label';

export interface DrawnPill {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly look: PillLook;
  readonly tone: OverlayTone;
}

export interface Disc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export type ChipYield = 'fade' | 'hide';

export interface YieldZones {
  readonly discs: readonly Disc[];
  readonly hideLabels: boolean;
  readonly chips: ChipYield;
}

export type OverlayCursor = 'grab' | 'grabbing' | null;

export type TouchPair = readonly [Point, Point];

export interface OverlayScene {
  readonly handles: readonly DrawnHandle[];
  readonly paths: readonly DrawnPath[];
  readonly pills: readonly DrawnPill[];
  readonly pulse: Point | null;
  readonly touches: readonly Disc[];
  readonly cursor: OverlayCursor;
  readonly yieldTo: YieldZones;
}

export interface OverlayDrag {
  readonly grab: DragGrab | null;
  readonly preview: EditPreview | null;
}

export const IDLE_DRAG: OverlayDrag = { grab: null, preview: null };

export const NO_YIELD: YieldZones = { discs: [], hideLabels: false, chips: 'fade' };

export const LIVE_PILL_GAP_PX = 30;

export const PILL_HEIGHT_PX = 30;

export const PILL_STACK_PX = 36;

export const PICKED_UP_TEXT = 'Picked up · drag to move';

const BREAKPOINT_WIDTHS = { tablet: 600, desktop: 1200 } as const;

export const HANDLE_LABELS: Readonly<Record<DrawnHandleKind, string>> = {
  point: 'Move corner',
  edge: 'Move side',
  'axis-x': 'Move along X',
  'axis-y': 'Move along Y',
  'axis-z': 'Move up or down',
  plane: 'Move on the floor',
  ring: 'Turn',
  corner: 'Resize',
  side: 'Resize one side',
  top: 'Change height',
  uniform: 'Resize evenly',
  'cone-yaw': 'Turn the view',
  'cone-pitch': 'Tilt the view',
};

export function gizmoBreakpointOf(windowWidth: number): GizmoBreakpoint {
  if (windowWidth >= BREAKPOINT_WIDTHS.desktop) return 'desktop';
  return windowWidth >= BREAKPOINT_WIDTHS.tablet ? 'tablet' : 'phone';
}

export function handleStateOf(
  id: string,
  grab: DragGrab | null,
  hover: PointerHover | null,
): HandleState {
  if (grab === null) return hover?.kind === 'handle' && hover.handleId === id ? 'hover' : 'rest';
  return grab.kind === 'handle' && grab.handleId === id ? 'active' : 'faded';
}

export function handleSizeOf(size: number, state: HandleState): number {
  return state === 'hover' ? size * HOVER_GROWTH : size;
}

export function cursorOf(grab: DragGrab | null, hover: PointerHover | null): OverlayCursor {
  if (grab !== null) return 'grabbing';
  return hover?.kind === 'handle' ? 'grab' : null;
}

export function pathOf(points: readonly Point[], closed: boolean): string {
  const steps = points.map(
    (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
  );
  return closed && steps.length > 0 ? `${steps.join(' ')} Z` : steps.join(' ');
}

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function discCrosses(disc: Disc, box: Box): boolean {
  const x = Math.min(Math.max(disc.x, box.left), box.right);
  const y = Math.min(Math.max(disc.y, box.top), box.bottom);
  return Math.hypot(disc.x - x, disc.y - y) < disc.r;
}

export function underHandles(zones: YieldZones, box: Box): boolean {
  return zones.discs.some((disc) => discCrosses(disc, box));
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function targetBox(handle: DrawnHandle): Box {
  const half = handle.target / 2;
  return {
    left: handle.x - half,
    right: handle.x + half,
    top: handle.y - half,
    bottom: handle.y + half,
  };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

export function sameYield(left: YieldZones, right: YieldZones): boolean {
  return (
    left.hideLabels === right.hideLabels &&
    left.chips === right.chips &&
    left.discs.length === right.discs.length &&
    left.discs.every((disc, index) => {
      const other = right.discs[index];
      return other !== undefined && near(disc.x, other.x) && near(disc.y, other.y);
    })
  );
}

const PILL_PAD_PX = 12;

const PILL_CHAR_EM = 0.6;

const PILL_SLIDE_PX = 4;

const PILL_FACES: Readonly<Record<PillLook, { readonly font: number; readonly height: number }>> = {
  live: { font: 13, height: PILL_HEIGHT_PX },
  snap: { font: 12, height: 26 },
  tip: { font: 12, height: 26 },
  label: { font: 12, height: 24 },
};

export function pillBox(pill: DrawnPill): Box {
  const face = PILL_FACES[pill.look];
  const half = (pill.text.length * face.font * PILL_CHAR_EM) / 2 + PILL_PAD_PX;
  return {
    left: pill.x - half,
    right: pill.x + half,
    top: pill.y - face.height / 2,
    bottom: pill.y + face.height / 2,
  };
}

export interface PillRoom {
  readonly blocked: readonly Box[];
  readonly width: number;
  readonly height: number;
}

function fits(pill: DrawnPill, room: PillRoom): boolean {
  const box = pillBox(pill);
  if (box.left < 0 || box.top < 0 || box.right > room.width || box.bottom > room.height) {
    return false;
  }
  return !room.blocked.some((other) => boxesOverlap(box, other));
}

interface Stretch {
  readonly from: Point;
  readonly to: Point;
  readonly start: number;
  readonly length: number;
}

function stretchesOf(guide: readonly Point[]): readonly Stretch[] {
  let start = 0;
  return guide.slice(1).flatMap((to, index) => {
    const from = guide[index];
    if (from === undefined) return [];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const stretch = { from, to, start, length };
    start += length;
    return length > 0 ? [stretch] : [];
  });
}

function projectOn(stretch: Stretch, at: Point): { readonly s: number; readonly gap: number } {
  const { from, to, length } = stretch;
  const t = ((at.x - from.x) * (to.x - from.x) + (at.y - from.y) * (to.y - from.y)) / length ** 2;
  const along = Math.min(1, Math.max(0, t));
  const x = from.x + (to.x - from.x) * along;
  const y = from.y + (to.y - from.y) * along;
  return { s: stretch.start + along * length, gap: Math.hypot(at.x - x, at.y - y) };
}

function nearestOn(stretches: readonly Stretch[], at: Point): { s: number; gap: number } | null {
  return stretches.reduce<{ s: number; gap: number } | null>((best, stretch) => {
    const here = projectOn(stretch, at);
    return best === null || here.gap < best.gap ? here : best;
  }, null);
}

function pointAt(stretches: readonly Stretch[], s: number): Point | null {
  const stretch = stretches.find((each) => s >= each.start && s <= each.start + each.length);
  if (stretch === undefined) return null;
  const t = (s - stretch.start) / stretch.length;
  const { from, to } = stretch;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function guideUnder(
  pill: DrawnPill,
  guides: readonly (readonly Point[])[],
): readonly Point[] | null {
  const reach = PILL_FACES[pill.look].height / 2;
  let best: { readonly guide: readonly Point[]; readonly gap: number } | null = null;
  for (const guide of guides) {
    const near = nearestOn(stretchesOf(guide), pill);
    if (near !== null && near.gap <= reach && (best === null || near.gap < best.gap)) {
      best = { guide, gap: near.gap };
    }
  }
  return best?.guide ?? null;
}

export function pillAlong(pill: DrawnPill, guide: readonly Point[], room: PillRoom): DrawnPill {
  if (fits(pill, room)) return pill;
  const stretches = stretchesOf(guide);
  const near = nearestOn(stretches, pill);
  const last = stretches.at(-1);
  if (near === null || last === undefined) return pill;
  const total = last.start + last.length;
  const reach = Math.max(near.s, total - near.s);
  for (let slide = PILL_SLIDE_PX; slide <= reach; slide += PILL_SLIDE_PX) {
    for (const s of [near.s + slide, near.s - slide]) {
      const at = pointAt(stretches, s);
      const moved = at === null ? null : { ...pill, x: at.x, y: at.y };
      if (moved !== null && fits(moved, room)) return moved;
    }
  }
  return pill;
}

export function localPair(
  pair: TouchPair,
  bounds: { readonly left: number; readonly top: number },
): TouchPair {
  const [a, b] = pair;
  return [
    { x: a.x - bounds.left, y: a.y - bounds.top },
    { x: b.x - bounds.left, y: b.y - bounds.top },
  ];
}
