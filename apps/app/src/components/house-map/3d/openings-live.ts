import {
  openingChanges,
  type HomeMapOpeningLiveState,
  type HomeMapOpeningStates,
} from '@smarteverything/domain/home-map-openings';
import {
  BoxGeometry,
  Group,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';
import type { OverlayOpeningDraw } from '../overlays/model-types';
import type { RenderFloor, RenderOpening, RenderPoint } from '../render-scene';
import { groundPosition } from './mesh';
import {
  LEAF_THICKNESS_M,
  OVERLAY_LIFT_M,
  OVERLAY_OPACITY,
  SEGMENTS,
  basic,
  mesh,
  onFloor,
  type OverlayLook,
  type OverlayMesh,
} from './overlay-kit';
import type { SceneTheme } from './vacuum-geometry';

export const DOOR_OPEN_DEG = 70;
export const WINDOW_OPEN_DEG = 35;
export const WINDOW_TILT_DEG = 12;
export const OPENING_PULSE_MS = 600;
export const HANDLE_HEIGHT_M = 1.05;
export const EDGE_M = 0.035;
export const SENSOR_DOT_M = 0.035;
export const LOCK_M = { body: 0.08, depth: 0.03, shackle: 0.026, tube: 0.008, off: 0.03 } as const;
export const PULSE_RING_M = { from: 0.15, to: 0.9, band: 0.03 } as const;

const SLIDE_SHARE = 0.5;
const RAD = Math.PI / 180;

export const OPENING_POSITIVE: Readonly<Record<SceneTheme, string>> = {
  light: '#1a7a43',
  dark: '#6fd39a',
};

type Motion = 'swing' | 'slide' | 'none';

const MOTIONS: Readonly<Record<RenderOpening['kind'], Motion>> = {
  door: 'swing',
  double_door: 'swing',
  garage_door: 'swing',
  window: 'swing',
  sliding_door: 'slide',
  pocket_door: 'slide',
  opening: 'none',
};

export interface OpeningLiveDraw extends Pick<OverlayOpeningDraw, 'id' | 'locked'> {
  readonly contact: HomeMapOpeningLiveState | null;
}

export interface OpeningsLook {
  readonly look: OverlayLook;
  readonly positive: string;
}

export interface OpeningsContext {
  readonly floor: Pick<RenderFloor, 'openings' | 'walls'>;
  readonly y: number;
  readonly tones: OpeningsLook;
}

interface Leaf {
  readonly hinge: RenderPoint;
  readonly tip: RenderPoint;
}

interface Frame {
  readonly opening: RenderOpening;
  readonly leaves: readonly Leaf[];
  readonly along: RenderPoint;
  readonly side: RenderPoint;
  readonly middle: RenderPoint;
  readonly half: number;
}

const add = (point: RenderPoint, by: RenderPoint, times: number): RenderPoint => ({
  x: point.x + by.x * times,
  y: point.y + by.y * times,
});

const angleOf = (from: RenderPoint, to: RenderPoint): number =>
  Math.atan2(to.y - from.y, to.x - from.x);

const span = (leaf: Leaf): number =>
  Math.hypot(leaf.tip.x - leaf.hinge.x, leaf.tip.y - leaf.hinge.y);

export const openAngleOf = (kind: RenderOpening['kind']): number =>
  kind === 'window' ? WINDOW_OPEN_DEG : DOOR_OPEN_DEG;

export function openingFrame(opening: RenderOpening, walls: RenderFloor['walls']): Frame | null {
  const width = Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y);
  if (width === 0 || opening.headHeight <= opening.sillHeight) return null;
  const along = {
    x: (opening.to.x - opening.from.x) / width,
    y: (opening.to.y - opening.from.y) / width,
  };
  const inward = { x: along.y, y: -along.x };
  const side = opening.swing === 'in' ? inward : { x: -inward.x, y: -inward.y };
  const middle = add(opening.from, along, width / 2);
  const wall = walls.find((candidate) => candidate.id === opening.wallId);
  const half = (wall?.thickness ?? LEAF_THICKNESS_M) / 2;
  const leaves =
    opening.kind === 'double_door'
      ? [
          { hinge: opening.from, tip: middle },
          { hinge: opening.to, tip: middle },
        ]
      : [
          opening.hinge === 'left'
            ? { hinge: opening.from, tip: opening.to }
            : { hinge: opening.to, tip: opening.from },
        ];
  return { opening, leaves, along, side, middle, half };
}

export function swungAngle(leaf: Leaf, side: RenderPoint, deg: number): number {
  const width = span(leaf);
  const u = { x: (leaf.tip.x - leaf.hinge.x) / width, y: (leaf.tip.y - leaf.hinge.y) / width };
  const cos = Math.cos(deg * RAD);
  const sin = Math.sin(deg * RAD);
  return Math.atan2(u.y * cos + side.y * sin, u.x * cos + side.x * sin);
}

interface PanelSpec {
  readonly name: string;
  readonly at: RenderPoint;
  readonly angle: number;
  readonly width: number;
  readonly state: HomeMapOpeningLiveState;
  readonly tiltDeg: number;
}

const toneOf = (state: HomeMapOpeningLiveState, tones: OpeningsLook): string => {
  if (state === 'open' || state === 'tilted') return tones.look.warning;
  return state === 'unknown' ? tones.look.muted : tones.positive;
};

function panel(spec: PanelSpec, frame: Frame, context: OpeningsContext): Group {
  const { sillHeight, headHeight } = frame.opening;
  const height = headHeight - sillHeight;
  const { look } = context.tones;
  const pivot = new Group();
  pivot.name = spec.name;
  pivot.position.set(...groundPosition(spec.at, context.y + sillHeight));
  pivot.rotation.y = spec.angle;
  const sash = new Group();
  sash.rotation.x = spec.tiltDeg * RAD;
  pivot.add(sash);
  const colour = spec.state === 'unknown' ? look.muted : look.leaf;
  const body = mesh(
    `${spec.name}:leaf`,
    new BoxGeometry(spec.width, height, LEAF_THICKNESS_M),
    basic(colour, OVERLAY_OPACITY.leaf),
  );
  body.position.set(spec.width / 2, height / 2, 0);
  const dot = mesh(
    `${spec.name}:sensor`,
    new SphereGeometry(SENSOR_DOT_M, 12, 8),
    basic(toneOf(spec.state, context.tones), 1),
    4,
  );
  dot.position.set(spec.width - EDGE_M, height + SENSOR_DOT_M * 1.5, 0);
  sash.add(body, dot);
  if (spec.state !== 'open' && spec.state !== 'tilted') return pivot;
  const edge = mesh(
    `${spec.name}:edge`,
    new BoxGeometry(EDGE_M, height, LEAF_THICKNESS_M * 1.4),
    basic(look.warning, 1),
    3,
  );
  edge.position.set(spec.width - EDGE_M / 2, height / 2, 0);
  sash.add(edge);
  return pivot;
}

function tiltedSpec(frame: Frame): Omit<PanelSpec, 'name'> {
  const { from, to } = frame.opening;
  const width = Math.hypot(to.x - from.x, to.y - from.y);
  return { at: from, angle: angleOf(from, to), width, state: 'tilted', tiltDeg: WINDOW_TILT_DEG };
}

function leafSpecs(
  frame: Frame,
  draw: OpeningLiveDraw,
  state: HomeMapOpeningLiveState,
): readonly PanelSpec[] {
  const motion = MOTIONS[frame.opening.kind];
  const base = { state, tiltDeg: 0 };
  return frame.leaves.map((leaf, index) => {
    const name = `opening:${draw.id}:${String(index)}`;
    const width = span(leaf);
    if (state === 'tilted') return { ...tiltedSpec(frame), name };
    if (motion === 'slide' && state === 'open') {
      const shift = { x: leaf.hinge.x - leaf.tip.x, y: leaf.hinge.y - leaf.tip.y };
      const start = add(
        add(leaf.tip, shift, SLIDE_SHARE),
        frame.side,
        frame.half + LEAF_THICKNESS_M,
      );
      return { ...base, name, at: start, angle: angleOf(leaf.tip, leaf.hinge), width };
    }
    const deg = state === 'open' && motion === 'swing' ? openAngleOf(frame.opening.kind) : 0;
    return { ...base, name, at: leaf.hinge, angle: swungAngle(leaf, frame.side, deg), width };
  });
}

function padlock(frame: Frame, draw: OpeningLiveDraw, context: OpeningsContext): Group {
  const locked = draw.locked === true;
  const colour = locked ? context.tones.positive : context.tones.look.warning;
  const leaf = frame.leaves[0];
  const jamb = frame.opening.kind === 'double_door' || leaf === undefined ? frame.middle : leaf.tip;
  const at = add(jamb, frame.side, -(frame.half + LOCK_M.off + LOCK_M.depth / 2));
  const badge = new Group();
  badge.name = `lock:${draw.id}`;
  badge.position.set(...groundPosition(at, context.y + frame.opening.sillHeight + HANDLE_HEIGHT_M));
  badge.rotation.y = angleOf(frame.opening.from, frame.opening.to);
  const body = mesh(
    `lock-body:${draw.id}`,
    new BoxGeometry(LOCK_M.body, LOCK_M.body * 0.8, LOCK_M.depth),
    basic(colour, 1),
    4,
  );
  const shackle = mesh(
    `lock-shackle:${draw.id}`,
    new TorusGeometry(LOCK_M.shackle, LOCK_M.tube, 8, 16, Math.PI),
    basic(colour, 1),
    4,
  );
  shackle.position.set(0, LOCK_M.body * 0.4 + (locked ? 0 : LOCK_M.shackle * 0.8), 0);
  badge.add(body, shackle);
  return badge;
}

export function buildOpenings(
  items: readonly OpeningLiveDraw[],
  context: OpeningsContext,
): readonly Object3D[] {
  return items.flatMap((draw) => {
    const opening = context.floor.openings.find((item) => item.id === draw.id);
    const frame = opening === undefined ? null : openingFrame(opening, context.floor.walls);
    if (frame === null) return [];
    const leaves =
      draw.contact === null || MOTIONS[frame.opening.kind] === 'none'
        ? []
        : leafSpecs(frame, draw, draw.contact).map((spec) => panel(spec, frame, context));
    return draw.locked === null ? leaves : [...leaves, padlock(frame, draw, context)];
  });
}

export interface OpeningPulse {
  readonly ring: OverlayMesh;
  readonly at: (progress: number) => void;
}

export function buildOpeningPulse(
  draw: OpeningLiveDraw,
  context: OpeningsContext,
): OpeningPulse | null {
  const opening = context.floor.openings.find((item) => item.id === draw.id);
  const frame = opening === undefined ? null : openingFrame(opening, context.floor.walls);
  if (frame === null || draw.contact === null) return null;
  const geometry = new RingGeometry(1 - PULSE_RING_M.band, 1, SEGMENTS.ring);
  const material = basic(toneOf(draw.contact, context.tones), OVERLAY_OPACITY.alert);
  const ring = onFloor(
    { name: `opening-pulse:${draw.id}`, at: frame.middle, y: context.y + OVERLAY_LIFT_M * 5 },
    geometry,
    material,
  );
  const at = (progress: number): void => {
    const done = Math.min(1, Math.max(0, progress));
    const radius = PULSE_RING_M.from + (PULSE_RING_M.to - PULSE_RING_M.from) * done;
    ring.scale.set(radius, radius, 1);
    material.opacity = OVERLAY_OPACITY.alert * (1 - done);
  };
  at(0);
  return { ring, at };
}

export function openingStatesOf(items: readonly OpeningLiveDraw[]): HomeMapOpeningStates {
  return new Map(
    items.flatMap((item) => (item.contact === null ? [] : [[item.id, item.contact] as const])),
  );
}

export function changedOpenings(
  previous: HomeMapOpeningStates | null,
  next: HomeMapOpeningStates,
  motion: boolean,
): readonly string[] {
  return motion ? openingChanges(previous, next).map((change) => change.id) : [];
}
