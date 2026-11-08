import type { Modifiers } from '../../edit/gestures';
import type { EditHit, EditOverlay, EditPaintTarget } from '../map-3d-edit-protocol';
import type { Point, PointerSample } from '../render-core-gestures';
import type { DragGrab, DragSession, EditEventDraft, PlaceSpot, PointerScene } from './pointer';

export type Release = 'tap' | 'menu' | 'none';

export interface Twin {
  readonly id: number;
  readonly spread: number;
  readonly angle: number;
}

export interface Grab {
  readonly kind: 'grab';
  readonly id: number;
  readonly from: Point;
  readonly grab: DragGrab;
  readonly long: boolean;
  readonly session: DragSession | null;
  readonly twin: Twin | null;
  readonly twisted: boolean;
}

export interface CameraPress {
  readonly kind: 'camera';
  readonly id: number;
  readonly release: Release;
  readonly pick: EditHit;
  readonly multi: boolean;
  readonly long: boolean;
}

export type Press = { readonly kind: 'idle' } | CameraPress | Grab | { readonly kind: 'spent' };

export type EditHover =
  | { readonly kind: 'paint'; readonly target: EditPaintTarget }
  | { readonly kind: 'place'; readonly spot: PlaceSpot };

export const NO_HIT: EditHit = { kind: 'none' };

export function pointOf(pointer: PointerSample): Point {
  return { x: pointer.x, y: pointer.y };
}

export function modifiersOf(pointer: PointerSample, free: boolean): Modifiers {
  return { shift: pointer.shift, alt: pointer.alt, free };
}

export function liftable(pick: EditHit): pick is Extract<EditHit, { readonly id: string }> {
  if (pick.kind === 'none' || pick.kind === 'room') return false;
  return pick.kind !== 'object' || !pick.locked;
}

export function lockedBody(pick: EditHit, bodyId: string): boolean {
  return pick.kind === 'object' && pick.id === bodyId && pick.locked;
}

export function pairOf(a: Point, b: Point): { readonly spread: number; readonly angle: number } {
  return { spread: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function grabbed(id: number, from: Point, grab: DragGrab): Grab {
  return { kind: 'grab', id, from, grab, long: false, session: null, twin: null, twisted: false };
}

export function hoverOf(overlay: EditOverlay, scene: PointerScene, at: Point): EditHover | null {
  if (overlay.readOnly) return null;
  if (overlay.mode === 'paint') {
    const target = scene.paintAt(at);
    return target === null ? null : { kind: 'paint', target };
  }
  if (overlay.mode !== 'place') return null;
  const spot = scene.placeAt(at);
  return spot === null ? null : { kind: 'place', spot };
}

function placeEvent(spot: PlaceSpot): EditEventDraft {
  const { at, height, rotation, surface, wall } = spot;
  return { type: 'place', at, height, rotation, surface, wall };
}

export function tapEventOf(
  overlay: EditOverlay,
  scene: PointerScene,
  at: Point,
): EditEventDraft | null {
  if (overlay.mode === 'paint' || overlay.mode === 'place') {
    if (overlay.readOnly) return null;
    const hover = hoverOf(overlay, scene, at);
    if (hover === null) return null;
    return hover.kind === 'paint'
      ? { type: 'paint', target: hover.target }
      : placeEvent(hover.spot);
  }
  const ground = scene.groundAt(at);
  if (ground === null) return null;
  const hit = scene.pressAt(at, null).pick;
  const { point, floorId, metresPerPx } = ground;
  return { type: 'tap', point, floorId, hit, metresPerPx };
}
