import type { Ray } from 'three';
import { HOME_MAP_GRID_M } from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { Modifiers } from '../../edit/gestures';
import type { EditOverlay, EditPathGhost } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { metresForPixels, surfaceHit } from './ground';
import type { DragSession, DragStart, EditEventDraft } from './pointer';
import { free, rayAt, surfacesOf, type EditLabel, type MoveView } from './sessions';

export const SHAPE_EPS = 1e-9;

export type EditHandle = EditOverlay['handles'][number];

export type ScanPlacement = Extract<EditEventDraft, { readonly type: 'scan' }>['placement'];

export interface ShapeView extends MoveView {
  readonly overlay: EditOverlay;
  readonly scan: ScanPlacement | null;
}

interface PreviewMarks {
  readonly ghosts: readonly EditPathGhost[];
  readonly labels: readonly EditLabel[];
}

export type ShapePreview =
  | ({ readonly kind: 'outline' } & PreviewMarks)
  | ({ readonly kind: 'scan'; readonly placement: ScanPlacement } & PreviewMarks)
  | ({
      readonly kind: 'cone';
      readonly deviceId: string;
      readonly yaw: number;
      readonly pitch: number;
    } & PreviewMarks);

export interface ShapeHooks {
  readonly view: () => ShapeView;
  readonly preview: (preview: ShapePreview | null) => void;
}

export interface ShapeFrame {
  readonly event: EditEventDraft | null;
  readonly preview: ShapePreview;
  readonly snap: string | null;
}

export type ShapeStep = (view: ShapeView, ray: Ray, modifiers: Modifiers) => ShapeFrame | null;

export interface ShapeGrab {
  readonly view: ShapeView;
  readonly handle: EditHandle;
  readonly ray: Ray;
  readonly from: HomeMapVec;
}

export interface SurfacePoint {
  readonly point: HomeMapVec;
  readonly world: Vec3;
}

export class ShapeTargetMissingError extends Error {
  constructor(
    readonly what: string,
    readonly id: string,
  ) {
    super(`The edited floor has no ${what} ${id} for the dragged handle`);
    this.name = 'ShapeTargetMissingError';
  }
}

export function pointOn(view: ShapeView, handle: EditHandle, ray: Ray): SurfacePoint | null {
  const hit = surfaceHit(ray, handle.surface, surfacesOf(view.edit));
  return hit === null ? null : { point: hit.at, world: hit.world };
}

export function grabOf(view: ShapeView, handle: EditHandle, from: Point): ShapeGrab {
  const ray = rayAt(view, from);
  const start = pointOn(view, handle, ray);
  const point = start === null ? { x: handle.at.x, y: handle.at.y } : start.point;
  return { view, handle, ray, from: point };
}

export function radiusAt(view: ShapeView, world: Vec3, pixels: number): number | null {
  return metresForPixels(view.camera, world, view.viewport, pixels);
}

export function gridStep(view: ShapeView, modifiers: Modifiers, step: number): number | null {
  return free(view, modifiers) ? null : step;
}

export function stepped(value: number, step: number | null): number {
  return step === null ? value : Math.round(value / step) * step;
}

export function steppedMetres(view: ShapeView, modifiers: Modifiers, value: number): number {
  return stepped(value, gridStep(view, modifiers, HOME_MAP_GRID_M));
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function plus(a: HomeMapVec, b: HomeMapVec): HomeMapVec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function minus(a: HomeMapVec, b: HomeMapVec): HomeMapVec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function midpoint(a: HomeMapVec, b: HomeMapVec): HomeMapVec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function same(a: HomeMapVec, b: HomeMapVec): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= SHAPE_EPS;
}

export function label(at: HomeMapVec, text: string, tone: EditLabel['tone']): EditLabel {
  return { at: { x: at.x, y: at.y, height: 0 }, text, tone };
}

export function ghost(
  shape: EditPathGhost['shape'],
  points: readonly HomeMapVec[],
  tone: EditPathGhost['tone'],
): EditPathGhost {
  return { shape, points: points.map((point) => ({ x: point.x, y: point.y, height: 0 })), tone };
}

export class ShapeSession implements DragSession {
  private event: EditEventDraft | null = null;
  private snap: string | null = null;

  constructor(
    private readonly hooks: ShapeHooks,
    private readonly start: DragStart,
    private readonly step: ShapeStep,
  ) {}

  move(at: Point, modifiers: Modifiers): void {
    const view = this.hooks.view();
    const frame = this.step(view, rayAt(view, at), modifiers);
    if (frame === null) return;
    this.event = frame.event;
    this.signal(frame.snap);
    this.hooks.preview(frame.preview);
  }

  readonly twist = (): void => undefined;

  end(): EditEventDraft | null {
    return this.event;
  }

  cancel(): void {
    this.event = null;
    this.hooks.preview(null);
  }

  private signal(next: string | null): void {
    if (next === this.snap) return;
    this.snap = next;
    this.start.emit({ type: 'snap', engaged: next !== null });
  }
}
