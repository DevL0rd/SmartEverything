import type { Ray } from 'three';
import {
  HOME_MAP_EDIT_MIN_EXTENT,
  HOME_MAP_GRID_M,
  homeMapEditToLocal,
  homeMapEditToWorld,
  type HomeMapEditBox,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import { metresText, type Modifiers } from '../../edit/gestures';
import type { Point } from '../render-core-gestures';
import { UP, along, lineParam, planOfWorld, type GizmoView } from './gizmo';
import type { GizmoHandle, GizmoLayout } from './gizmo-handles';
import { planeAt } from './ground';
import type { EditEventDraft } from './pointer';
import { free, type EditLabel, type MoveItem } from './sessions';
import type { MovePose, MovePreview } from './sessions-factory';

const METRE_DECIMALS = 2;
const SIZE_EPS = 1e-9;

export interface GizmoPreview extends MovePreview {
  readonly tall: number | null;
}

export interface GizmoHooks {
  readonly view: () => GizmoView;
  readonly preview: (preview: GizmoPreview | null) => void;
}

export interface GizmoMotion {
  readonly event: EditEventDraft;
  readonly preview: GizmoPreview;
}

export interface GizmoPointer {
  readonly ray: Ray;
  readonly at: Point;
}

export type GizmoStep = (
  view: GizmoView,
  pointer: GizmoPointer,
  modifiers: Modifiers,
) => GizmoMotion | null;

export interface GizmoGrab {
  readonly layout: GizmoLayout;
  readonly item: MoveItem;
  readonly handle: GizmoHandle;
  readonly ray: Ray;
  readonly from: Point;
}

interface Footprint {
  readonly w: number;
  readonly d: number;
}

interface Sizes extends Footprint {
  readonly h: number;
}

export function fixedMetres(value: number): string {
  return value.toFixed(METRE_DECIMALS);
}

export function stepped(value: number, step: number | null): number {
  return step === null ? value : Math.round(value / step) * step;
}

function extent(value: number, step: number | null): number {
  return Math.max(step ?? HOME_MAP_EDIT_MIN_EXTENT, stepped(value, step));
}

export function gridOf(view: GizmoView, modifiers: Modifiers, step: number): number | null {
  return free(view, modifiers) ? null : step;
}

export function poseOf(item: MoveItem, change: Partial<Omit<MovePose, 'id'>>): MovePose {
  return {
    id: item.id,
    at: item.box.at,
    rotation: item.box.rotation,
    height: item.height,
    wall: item.wall,
    ...change,
  };
}

export function liveLabel(at: HomeMapVec, height: number, text: string): EditLabel {
  return { at: { x: at.x, y: at.y, height }, text, tone: 'neutral' };
}

export function flatAt(ray: Ray, level: number): HomeMapVec | null {
  const hit = planeAt(ray, level);
  return hit === null ? null : planOfWorld(hit.world);
}

function footprintText(sizes: Footprint): string {
  return `${fixedMetres(sizes.w)} × ${fixedMetres(sizes.d)} m`;
}

function resized(item: MoveItem, sizes: Sizes, at: HomeMapVec, tall: number | null): GizmoMotion {
  const pose = poseOf(item, { at });
  const text =
    tall === null ? footprintText(sizes) : `${footprintText(sizes)} · ${metresText(tall)}`;
  return {
    event: {
      type: 'resize',
      id: item.id,
      box: { at, rotation: item.box.rotation, w: sizes.w, d: sizes.d, h: tall },
    },
    preview: {
      pose,
      size: { w: sizes.w, d: sizes.d },
      tall,
      guides: [],
      labels: [liveLabel(at, item.height + sizes.h, text)],
    },
  };
}

function scaleSnapped(
  sizes: readonly number[],
  factor: number,
  step: number | null,
): number | null {
  const longest = Math.max(...sizes);
  if (longest < SIZE_EPS) return null;
  return extent(longest * factor, step) / longest;
}

function proportional(box: HomeMapEditBox, raw: Footprint, step: number | null): Footprint | null {
  const factor = (raw.d * box.d + raw.w * box.w) / (box.d * box.d + box.w * box.w);
  const scale = scaleSnapped([box.d, box.w], factor, step);
  return scale === null ? null : { d: box.d * scale, w: box.w * scale };
}

function footprintOf(
  grab: GizmoGrab,
  raw: Footprint,
  modifiers: Modifiers,
  step: number | null,
): Footprint | null {
  const { box } = grab.item;
  const [sx, sy] = grab.handle.signs;
  if (grab.handle.kind === 'corner' && modifiers.shift) return proportional(box, raw, step);
  return {
    d: sx === 0 ? box.d : extent(raw.d, step),
    w: sy === 0 ? box.w : extent(raw.w, step),
  };
}

export function edgeStep(grab: GizmoGrab): GizmoStep {
  const { item } = grab;
  const { frame } = grab.layout;
  const { box } = item;
  const [sx, sy] = grab.handle.signs;
  const level = frame.centre[1];
  const start = flatAt(grab.ray, level);
  return (view, { ray }, modifiers) => {
    const now = flatAt(ray, level);
    if (start === null || now === null) return null;
    const from = homeMapEditToLocal(box, start);
    const to = homeMapEditToLocal(box, now);
    const raw = { d: box.d + sx * (to.x - from.x), w: box.w + sy * (to.y - from.y) };
    const sizes = footprintOf(grab, raw, modifiers, gridOf(view, modifiers, HOME_MAP_GRID_M));
    if (sizes === null) return null;
    const at = homeMapEditToWorld(box, {
      x: (sx * (sizes.d - box.d)) / 2,
      y: (sy * (sizes.w - box.w)) / 2,
    });
    return resized(item, { ...sizes, h: item.tall }, at, null);
  };
}

export function topStep(grab: GizmoGrab): GizmoStep {
  const { item } = grab;
  const top = along(grab.layout.frame.centre, UP, item.tall);
  const start = lineParam(grab.ray, top, UP);
  return (view, { ray }, modifiers) => {
    const now = lineParam(ray, top, UP);
    if (start === null || now === null) return null;
    const tall = extent(item.tall + now - start, gridOf(view, modifiers, HOME_MAP_GRID_M));
    return resized(item, { w: item.box.w, d: item.box.d, h: tall }, item.box.at, tall);
  };
}

export function uniformStep(grab: GizmoGrab): GizmoStep {
  const { item } = grab;
  const { box } = item;
  const level = grab.layout.frame.centre[1];
  const start = flatAt(grab.ray, level);
  const reach = start === null ? 0 : Math.hypot(start.x - box.at.x, start.y - box.at.y);
  return (view, { ray }, modifiers) => {
    const now = flatAt(ray, level);
    if (now === null || reach < SIZE_EPS) return null;
    const factor = Math.hypot(now.x - box.at.x, now.y - box.at.y) / reach;
    const grid = gridOf(view, modifiers, HOME_MAP_GRID_M);
    const scale = scaleSnapped([box.w, box.d, item.tall], factor, grid);
    if (scale === null) return null;
    const sizes = { w: box.w * scale, d: box.d * scale, h: item.tall * scale };
    return resized(item, sizes, box.at, sizes.h);
  };
}
