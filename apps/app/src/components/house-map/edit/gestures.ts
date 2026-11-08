import {
  HOME_MAP_GRID_M,
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapMoveObject,
  homeMapObjectBox,
  homeMapPinchTwist,
  homeMapResize,
  homeMapRotateStep,
  homeMapRotateTo,
  type HomeMapEditBox,
  type HomeMapGuideLine,
  type HomeMapManipulation,
  type HomeMapSnapGuide,
  type HomeMapSnapWall,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapFloor } from '@smarteverything/domain/home-map';
import type { HomeMapObject } from '@smarteverything/domain/home-map-elements';
import type { HomeMapOp } from '@smarteverything/domain';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import {
  boxOf,
  editFactsOf,
  editObjectOf,
  gripAt,
  hitObject,
  type Grip,
  type SpecOf,
} from './furniture-box';
import { objectOp } from './ops';
import { SNAP_RADIUS_PX } from './radii';

export interface Modifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly free: boolean;
}

export const NO_MODIFIERS: Modifiers = { shift: false, alt: false, free: false };

export interface Scene {
  readonly floor: HomeMapFloor;
  readonly specOf: SpecOf;
  readonly metresPerPx: number;
  readonly nameOf: (id: string) => string;
}

export interface LiveLabel {
  readonly text: string;
  readonly at: HomeMapVec;
  readonly tone: 'size' | 'snap';
}

export type SnapTarget =
  | { readonly kind: 'object'; readonly id: string; readonly box: HomeMapEditBox }
  | { readonly kind: 'wall'; readonly from: HomeMapVec; readonly to: HomeMapVec };

export interface Live {
  readonly id: string;
  readonly box: HomeMapEditBox;
  readonly ghost: HomeMapEditBox;
  readonly patch: Partial<HomeMapObject>;
  readonly guides: readonly HomeMapSnapGuide[];
  readonly labels: readonly LiveLabel[];
  readonly snap: string | null;
  readonly target: SnapTarget | null;
}

export interface Hold {
  readonly object: HomeMapObject;
  readonly grip: Grip;
}

export interface Pick {
  readonly select: string | null;
  readonly hold: Hold | null;
}

const MINUS = '−';

export function metresText(value: number): string {
  const text = `${Math.abs(value).toFixed(2)} m`;
  return value < -0.005 ? `${MINUS}${text}` : text;
}

export function degreesText(value: number): string {
  return `${String(Math.round(((value % 360) + 360) % 360))}°`;
}

export function holdAt(scene: Scene, selected: HomeMapObject | null, point: HomeMapVec): Pick {
  const handle =
    selected === null
      ? null
      : gripAt(boxOf(selected, scene.specOf), selected.locked, point, scene.metresPerPx);
  if (selected !== null && handle !== null) {
    return { select: selected.id, hold: { object: selected, grip: handle } };
  }
  const hit = hitObject(scene.floor, point, scene.specOf);
  if (hit === null) return { select: null, hold: null };
  const grab = { x: point.x - hit.at.x, y: point.y - hit.at.y };
  return {
    select: hit.id,
    hold: hit.locked ? null : { object: hit, grip: { kind: 'move', grab } },
  };
}

function stepOf(modifiers: Modifiers): number | null {
  return modifiers.alt || modifiers.free ? null : HOME_MAP_ROTATION_STEP_DEG;
}

function guideOf(line: HomeMapGuideLine): HomeMapSnapGuide {
  return { kind: 'extension', from: line.from, to: line.to };
}

function footOn(wall: HomeMapSnapWall, at: HomeMapVec): { foot: HomeMapVec; along: number } {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { foot: wall.from, along: 0 };
  const along = ((at.x - wall.from.x) * dx + (at.y - wall.from.y) * dy) / length;
  const foot = { x: wall.from.x + (dx * along) / length, y: wall.from.y + (dy * along) / length };
  return { foot, along };
}

interface Moved {
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly wall: HomeMapSnapWall | null;
  readonly guides: readonly HomeMapGuideLine[];
}

function moveLabels(scene: Scene, ghost: HomeMapEditBox, moved: Moved): readonly LiveLabel[] {
  const { at, wall, guides } = moved;
  if (wall !== null) {
    const { along } = footOn(wall, at);
    return [
      { text: `${metresText(along)} along the wall`, at, tone: 'size' },
      { text: 'snapped to the wall', at: footOn(wall, at).foot, tone: 'snap' },
    ];
  }
  const target = guides[0];
  const offsets = [at.x - ghost.at.x, at.y - ghost.at.y].filter((value) => Math.abs(value) > 0.005);
  const offset: readonly LiveLabel[] =
    offsets.length === 0 ? [] : [{ text: offsets.map(metresText).join(' · '), at, tone: 'size' }];
  if (target === undefined) return offset;
  const name = scene.nameOf(target.targetId).toLowerCase();
  return [...offset, { text: `snaps to the ${name}`, at: target.to, tone: 'snap' }];
}

function moveGuides(moved: Moved): readonly HomeMapSnapGuide[] {
  if (moved.wall === null) return moved.guides.map(guideOf);
  const { foot } = footOn(moved.wall, moved.at);
  return [{ kind: 'extension', from: moved.wall.from, to: foot }];
}

function snapKeyOf(moved: Moved): string | null {
  if (moved.wall !== null) return `wall:${String(moved.wall.from.x)},${String(moved.wall.from.y)}`;
  const ids = moved.guides.map((guide) => `${guide.orientation}:${guide.targetId}`);
  return ids.length === 0 ? null : `object:${ids.join('|')}`;
}

interface Other {
  readonly id: string;
  readonly box: HomeMapEditBox;
}

function targetOf(moved: Moved, others: readonly Other[]): SnapTarget | null {
  if (moved.wall !== null) return { kind: 'wall', from: moved.wall.from, to: moved.wall.to };
  const id = moved.guides[0]?.targetId;
  const other = others.find((item) => item.id === id);
  return other === undefined ? null : { kind: 'object', id: other.id, box: other.box };
}

function moveLive(scene: Scene, hold: Hold, pointer: HomeMapVec, modifiers: Modifiers): Live {
  const { object } = hold;
  const grab = hold.grip.kind === 'move' ? hold.grip.grab : { x: 0, y: 0 };
  const box = boxOf(object, scene.specOf);
  const others = scene.floor.objects
    .filter((item) => item.id !== object.id)
    .map((item): Other => ({ id: item.id, box: boxOf(item, scene.specOf) }));
  const moved = homeMapMoveObject(
    box,
    { x: pointer.x - grab.x, y: pointer.y - grab.y },
    { walls: scene.floor.walls, others },
    {
      radiusM: modifiers.alt ? 0 : SNAP_RADIUS_PX * scene.metresPerPx,
      gridM: modifiers.alt ? null : HOME_MAP_GRID_M,
      hugWalls: !modifiers.alt,
    },
  );
  return {
    id: object.id,
    box: { ...box, at: moved.at, rotation: moved.rotation },
    ghost: box,
    patch: { at: { x: moved.at.x, y: moved.at.y }, rotation: moved.rotation },
    guides: moveGuides(moved),
    labels: moveLabels(scene, box, moved),
    snap: snapKeyOf(moved),
    target: targetOf(moved, others),
  };
}

function rotateLive(scene: Scene, hold: Hold, pointer: HomeMapVec, modifiers: Modifiers): Live {
  const box = boxOf(hold.object, scene.specOf);
  const rotation = homeMapRotateTo({ box, pointer, stepDeg: stepOf(modifiers) });
  return {
    id: hold.object.id,
    box: { ...box, rotation },
    ghost: box,
    patch: { rotation },
    guides: [],
    labels: [{ text: degreesText(rotation), at: box.at, tone: 'size' }],
    snap: null,
    target: null,
  };
}

function countSuffix(scene: Scene, object: HomeMapObject, made: HomeMapManipulation): string {
  const spec = scene.specOf(object.modelId);
  const counts = Object.entries(made.derived).flatMap(([name, value]) =>
    spec?.params?.[name]?.unit === 'count' ? [`${String(Math.round(value))} ${name}`] : [],
  );
  return counts.map((count) => ` · ${count}`).join('');
}

function manipulationLive(
  scene: Scene,
  object: HomeMapObject,
  made: HomeMapManipulation,
  labels: readonly LiveLabel[],
): Live {
  const spec = scene.specOf(object.modelId);
  return {
    id: object.id,
    box: made.box,
    ghost: homeMapObjectBox(editObjectOf(object, spec), editFactsOf(spec)),
    patch: {
      at: { x: made.box.at.x, y: made.box.at.y },
      rotation: made.box.rotation,
      params: made.params,
    },
    guides: [],
    labels,
    snap: made.preset === null ? null : `preset:${made.preset}`,
    target: null,
  };
}

function resizeLive(scene: Scene, hold: Hold, pointer: HomeMapVec, modifiers: Modifiers): Live {
  const { object, grip } = hold;
  const spec = scene.specOf(object.modelId);
  const handle = grip.kind === 'resize' ? grip.handle : 'se';
  const made = homeMapResize({
    object: editObjectOf(object, spec),
    facts: editFactsOf(spec),
    handle,
    pointer,
    options: {
      gridM: modifiers.alt ? null : HOME_MAP_GRID_M,
      presetRadiusM: modifiers.alt ? null : SNAP_RADIUS_PX * scene.metresPerPx,
      keepProportions: modifiers.shift,
    },
  });
  const suffix = countSuffix(scene, object, made);
  const labels = made.labels.map((label): LiveLabel => ({
    text: `${metresText(label.valueM)}${suffix}`,
    at: label.at,
    tone: 'size',
  }));
  return manipulationLive(scene, object, made, labels);
}

export function dragLive(
  scene: Scene,
  hold: Hold,
  pointer: HomeMapVec,
  modifiers: Modifiers,
): Live {
  if (hold.grip.kind === 'move') return moveLive(scene, hold, pointer, modifiers);
  if (hold.grip.kind === 'rotate') return rotateLive(scene, hold, pointer, modifiers);
  return resizeLive(scene, hold, pointer, modifiers);
}

export interface PinchTwist {
  readonly scale: number;
  readonly twistDeg: number;
}

export function pinchLive(
  scene: Scene,
  object: HomeMapObject,
  motion: PinchTwist,
  modifiers: Modifiers,
): Live {
  const spec = scene.specOf(object.modelId);
  const made = homeMapPinchTwist({
    object: editObjectOf(object, spec),
    facts: editFactsOf(spec),
    scale: motion.scale,
    twistDeg: motion.twistDeg,
    stepDeg: stepOf(modifiers),
  });
  const size = `${made.box.w.toFixed(2)} × ${metresText(made.box.d)}`;
  const text = `${size}${countSuffix(scene, object, made)} · ${degreesText(made.box.rotation)}`;
  return manipulationLive(scene, object, made, [{ text, at: made.box.at, tone: 'size' }]);
}

export function wheelOps(
  floorId: string,
  object: HomeMapObject | null,
  deltaY: number,
  modifiers: Modifiers,
): readonly HomeMapOp[] {
  if (object === null || object.locked || !modifiers.alt || deltaY === 0) return [];
  const rotation = homeMapRotateStep(
    object.rotation,
    deltaY > 0 ? 1 : -1,
    HOME_MAP_ROTATION_STEP_DEG,
  );
  return [objectOp(floorId, object.id, { rotation })];
}

export function liveOps(floorId: string, live: Live | null): readonly HomeMapOp[] {
  return live === null ? [] : [objectOp(floorId, live.id, live.patch)];
}

export function snapEngaged(before: Live | null, after: Live | null): boolean {
  const snap = after?.snap ?? null;
  return snap !== null && snap !== (before?.snap ?? null);
}
