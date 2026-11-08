import {
  HOME_MAP_GRID_M,
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapBoxCorners,
  homeMapEditToWorld,
  homeMapMountOnWall,
  homeMapPointInPolygon,
  homeMapRoomAt,
  type HomeMapEditBox,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { boxOf, type SpecOf } from '../../../../components/house-map/edit/furniture-box';
import { objectOp } from '../../../../components/house-map/edit/ops';
import type { IconName } from '../../../../components/icon-glyphs';
import { placementOp } from '../list-editor/objects-devices-model';
import type { GizmoMode } from '../tool-state';
import { NO_SPOT_TEXT } from '../tools/furniture-model';

export type ActionTarget =
  | { readonly kind: 'object'; readonly object: HomeMapObject }
  | { readonly kind: 'device'; readonly placement: HomeMapPlacement }
  | { readonly kind: 'room'; readonly room: HomeMapRoom };

export const OBJECT_ACTION_IDS = [
  'rotate',
  'flip',
  'duplicate',
  'style',
  'move',
  'lock',
  'delete',
] as const;

export type ObjectActionId = (typeof OBJECT_ACTION_IDS)[number];

export type ActionSurface = 'menu' | 'bar';

export interface ObjectAction {
  readonly id: ObjectActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly shortcut: string | null;
  readonly submenu: boolean;
  readonly destructive: boolean;
  readonly disabled: boolean;
}

export interface LookChoice {
  readonly kind: 'finish' | 'style';
  readonly value: string;
  readonly label: string;
  readonly on: boolean;
}

export interface ActionScene {
  readonly floor: HomeMapFloor;
  readonly specOf: SpecOf;
  readonly newId: () => string;
}

export type ActionOutcome =
  | { readonly kind: 'ops'; readonly ops: readonly HomeMapOp[]; readonly select: string | null }
  | { readonly kind: 'placeDevice'; readonly deviceId: string; readonly at: HomeMapVec }
  | { readonly kind: 'blocked'; readonly notice: string };

export const FINE_NUDGE_M = 0.01;
export const DUPLICATE_GAP_M = HOME_MAP_GRID_M;

interface ActionDef {
  readonly menu: string;
  readonly bar: string;
  readonly icon: IconName;
  readonly shortcut: string | null;
}

const DEFS: Readonly<Record<ObjectActionId, ActionDef>> = {
  rotate: { menu: 'Turn 90°', bar: 'Turn 90°', icon: 'refresh', shortcut: 'Q' },
  flip: { menu: 'Flip', bar: 'Flip', icon: 'panelLeft', shortcut: 'F' },
  duplicate: { menu: 'Duplicate', bar: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D' },
  style: { menu: 'Colour and style', bar: 'Style', icon: 'palette', shortcut: null },
  move: { menu: 'Move to another room', bar: 'Move to', icon: 'move', shortcut: null },
  lock: { menu: 'Lock position', bar: 'Lock', icon: 'lock', shortcut: 'Ctrl+L' },
  delete: { menu: 'Delete', bar: 'Delete', icon: 'trash', shortcut: 'Del' },
};

const OFFERED: Readonly<Record<ActionTarget['kind'], readonly ObjectActionId[]>> = {
  object: OBJECT_ACTION_IDS,
  device: ['rotate', 'move', 'delete'],
  room: ['delete'],
};

const POSITIONAL: ReadonlySet<ObjectActionId> = new Set(['rotate', 'move']);

function labelOf(target: ActionTarget, surface: ActionSurface, id: ObjectActionId): string {
  if (id === 'delete' && target.kind === 'device') return 'Remove from map';
  if (id === 'delete' && target.kind === 'room') return 'Delete room';
  if (id === 'lock' && target.kind === 'object' && target.object.locked) {
    return surface === 'menu' ? 'Unlock position' : 'Unlock';
  }
  return DEFS[id][surface];
}

export function objectActions(
  target: ActionTarget,
  surface: ActionSurface,
  readOnly: boolean,
): readonly ObjectAction[] {
  const locked = target.kind === 'object' && target.object.locked;
  return OFFERED[target.kind].map((id) => ({
    id,
    label: labelOf(target, surface, id),
    icon: id === 'lock' && locked ? 'lockOpen' : DEFS[id].icon,
    shortcut: DEFS[id].shortcut,
    submenu: id === 'style' || id === 'move',
    destructive: id === 'delete',
    disabled: readOnly || (locked && POSITIONAL.has(id)),
  }));
}

export function quarterTurn(rotation: number, degrees: number): number {
  return (((rotation + degrees) % 360) + 360) % 360;
}

function turnOps(floorId: string, target: ActionTarget, degrees: number): readonly HomeMapOp[] {
  if (target.kind === 'room') return [];
  if (target.kind === 'device') {
    const { placement } = target;
    const rotation = quarterTurn(placement.rotation, degrees);
    return [placementOp(floorId, placement.deviceId, { rotation })];
  }
  const rotation = quarterTurn(target.object.rotation, degrees);
  return [objectOp(floorId, target.object.id, { rotation })];
}

const ops = (list: readonly HomeMapOp[], select: string | null): ActionOutcome => ({
  kind: 'ops',
  ops: list,
  select,
});

const blocked = (notice: string): ActionOutcome => ({ kind: 'blocked', notice });

function idOf(target: ActionTarget): string {
  if (target.kind === 'room') return target.room.id;
  return target.kind === 'object' ? target.object.id : target.placement.deviceId;
}

function axisOf(a: HomeMapEditBox, b: HomeMapEditBox): readonly HomeMapVec[] {
  return [a.rotation, a.rotation + 90, b.rotation, b.rotation + 90].map((deg) => ({
    x: Math.cos((deg * Math.PI) / 180),
    y: Math.sin((deg * Math.PI) / 180),
  }));
}

function span(corners: readonly HomeMapVec[], axis: HomeMapVec): readonly [number, number] {
  const values = corners.map((corner) => corner.x * axis.x + corner.y * axis.y);
  return [Math.min(...values), Math.max(...values)];
}

export function boxesOverlap(a: HomeMapEditBox, b: HomeMapEditBox): boolean {
  const ca = homeMapBoxCorners(a);
  const cb = homeMapBoxCorners(b);
  return axisOf(a, b).every((axis) => {
    const [aLow, aHigh] = span(ca, axis);
    const [bLow, bHigh] = span(cb, axis);
    return aHigh > bLow + 1e-9 && bHigh > aLow + 1e-9;
  });
}

interface SpotSearch {
  readonly box: HomeMapEditBox;
  readonly origin: HomeMapVec;
  readonly room: HomeMapRoom | null;
  readonly others: readonly HomeMapEditBox[];
}

function fits(search: SpotSearch, at: HomeMapVec): boolean {
  const box = { ...search.box, at };
  const { room } = search;
  const inside =
    room === null || homeMapBoxCorners(box).every((c) => homeMapPointInPolygon(room.polygon, c));
  return inside && !search.others.some((other) => boxesOverlap(box, other));
}

function reach(search: SpotSearch): number {
  const ring = search.room?.polygon.outer ?? homeMapBoxCorners(search.box);
  return Math.max(...ring.map((p) => Math.hypot(p.x - search.origin.x, p.y - search.origin.y)));
}

const RING: readonly HomeMapVec[] = [0, 1, -1]
  .flatMap((x) => [0, 1, -1].map((y) => ({ x, y })))
  .filter((unit) => unit.x !== 0 || unit.y !== 0)
  .sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y));

function ringSpots(search: SpotSearch, step: number): readonly HomeMapVec[] {
  const frame = { at: search.origin, rotation: search.box.rotation };
  const sideW = (search.box.w + DUPLICATE_GAP_M) * step;
  const sideD = (search.box.d + DUPLICATE_GAP_M) * step;
  return RING.map((unit) => homeMapEditToWorld(frame, { x: unit.x * sideD, y: unit.y * sideW }));
}

export function nearestFreeSpot(search: SpotSearch, includeOrigin: boolean): HomeMapVec | null {
  if (includeOrigin && fits(search, search.origin)) return search.origin;
  const unit = Math.min(search.box.w, search.box.d) + DUPLICATE_GAP_M;
  const steps = Math.ceil(reach(search) / unit) + 1;
  for (let step = 1; step <= steps; step += 1) {
    const found = ringSpots(search, step).find((at) => fits(search, at));
    if (found !== undefined) return found;
  }
  return null;
}

function othersOf(scene: ActionScene, skip: string | null): readonly HomeMapEditBox[] {
  return scene.floor.objects
    .filter((item) => item.id !== skip && item.wall === undefined)
    .map((item) => boxOf(item, scene.specOf));
}

type Pose = Pick<HomeMapObject, 'at' | 'rotation' | 'wall'>;

function poseAt(floor: HomeMapFloor, object: HomeMapObject, at: HomeMapVec): Pose | null {
  if (object.wall === undefined) return { at: { x: at.x, y: at.y }, rotation: object.rotation };
  const mount = homeMapMountOnWall(floor.walls, floor.rooms, at);
  if (mount === null) return null;
  const spot = { x: mount.at.x, y: mount.at.y };
  return { at: spot, rotation: mount.rotation, wall: mount.attachment };
}

function duplicate(scene: ActionScene, object: HomeMapObject): ActionOutcome {
  const box = boxOf(object, scene.specOf);
  const room = homeMapRoomAt(scene.floor.rooms, object.at);
  const spot = nearestFreeSpot(
    { box, origin: object.at, room, others: othersOf(scene, null) },
    false,
  );
  const pose = spot === null ? null : poseAt(scene.floor, object, spot);
  if (pose === null) return blocked(NO_SPOT_TEXT);
  const id = scene.newId();
  const element = { ...object, ...pose, id, locked: false, origin: { kind: 'hand' } };
  return ops([{ op: 'add', kind: 'object', floorId: scene.floor.id, element }], id);
}

function centreOf(room: HomeMapRoom): HomeMapVec {
  const ring = room.polygon.outer;
  const sum = ring.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / Math.max(ring.length, 1), y: sum.y / Math.max(ring.length, 1) };
}

function deviceSpot(room: HomeMapRoom, deviceId: string): ActionOutcome {
  const origin = centreOf(room);
  const box = { at: origin, rotation: 0, w: HOME_MAP_GRID_M, d: HOME_MAP_GRID_M };
  const at = nearestFreeSpot({ box, origin, room, others: [] }, true);
  return at === null ? blocked(NO_SPOT_TEXT) : { kind: 'placeDevice', deviceId, at };
}

export function moveToRoom(
  scene: ActionScene,
  target: ActionTarget,
  roomId: string,
): ActionOutcome {
  const room = scene.floor.rooms.find((item) => item.id === roomId);
  if (room === undefined) return blocked(NO_SPOT_TEXT);
  if (target.kind === 'room') return ops([], target.room.id);
  if (target.kind === 'device') return deviceSpot(room, target.placement.deviceId);
  const { object } = target;
  const box = boxOf(object, scene.specOf);
  const spot = nearestFreeSpot(
    { box, origin: centreOf(room), room, others: othersOf(scene, object.id) },
    true,
  );
  const pose = spot === null ? null : poseAt(scene.floor, object, spot);
  if (pose === null) return blocked(NO_SPOT_TEXT);
  return ops([objectOp(scene.floor.id, object.id, pose)], object.id);
}

export function lookOps(floorId: string, object: HomeMapObject, look: LookChoice): ActionOutcome {
  const patch = look.kind === 'finish' ? { finish: look.value } : { style: look.value };
  return ops([objectOp(floorId, object.id, patch)], object.id);
}

function removeOps(floorId: string, target: ActionTarget): readonly HomeMapOp[] {
  if (target.kind === 'room') return [{ op: 'remove', kind: 'room', floorId, id: target.room.id }];
  return target.kind === 'object'
    ? [{ op: 'remove', kind: 'object', floorId, id: target.object.id }]
    : [{ op: 'remove', kind: 'placement', floorId, id: target.placement.deviceId }];
}

export function runAction(
  scene: ActionScene,
  target: ActionTarget,
  id: Exclude<ObjectActionId, 'style' | 'move'>,
): ActionOutcome {
  const floorId = scene.floor.id;
  const self = idOf(target);
  if (id === 'rotate') return ops(turnOps(floorId, target, 90), self);
  if (id === 'delete') return ops(removeOps(floorId, target), null);
  if (target.kind !== 'object') return ops([], self);
  const { object } = target;
  if (id === 'duplicate') return duplicate(scene, object);
  const patch = id === 'flip' ? { flipped: object.flipped !== true } : { locked: !object.locked };
  return ops([objectOp(floorId, object.id, patch)], self);
}

export type SelectionCommand =
  | { readonly kind: 'action'; readonly id: Exclude<ObjectActionId, 'style' | 'move'> }
  | { readonly kind: 'turn'; readonly degrees: number }
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number };

export type SelectionKey = SelectionCommand | { readonly kind: 'menu' };

export type GizmoKey =
  | { readonly kind: 'mode'; readonly mode: GizmoMode }
  | { readonly kind: 'snapping' }
  | { readonly kind: 'space' };

export type KeyCommand =
  SelectionKey | GizmoKey | { readonly kind: 'undo' } | { readonly kind: 'redo' };

export interface KeyPress {
  readonly key: string;
  readonly shift: boolean;
  readonly mod: boolean;
}

const ARROWS: Readonly<Record<string, HomeMapVec>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

const PLAIN_KEYS: Readonly<Record<string, KeyCommand>> = {
  q: { kind: 'action', id: 'rotate' },
  f: { kind: 'action', id: 'flip' },
  w: { kind: 'mode', mode: 'move' },
  e: { kind: 'mode', mode: 'rotate' },
  r: { kind: 'mode', mode: 'scale' },
  s: { kind: 'snapping' },
  x: { kind: 'space' },
};

const MOD_KEYS: Readonly<Record<string, KeyCommand>> = {
  d: { kind: 'action', id: 'duplicate' },
  l: { kind: 'action', id: 'lock' },
  z: { kind: 'undo' },
};

function letterCommand(letter: string, shift: boolean, mod: boolean): KeyCommand | null {
  if (mod) return letter === 'z' && shift ? { kind: 'redo' } : (MOD_KEYS[letter] ?? null);
  if (letter === 'q' && shift) return { kind: 'turn', degrees: HOME_MAP_ROTATION_STEP_DEG };
  return PLAIN_KEYS[letter] ?? null;
}

export function keyCommand(press: KeyPress): KeyCommand | null {
  const { key, shift, mod } = press;
  const arrow = ARROWS[key];
  if (arrow !== undefined) {
    const metres = shift ? FINE_NUDGE_M : HOME_MAP_GRID_M;
    return mod ? null : { kind: 'nudge', dx: arrow.x * metres, dy: arrow.y * metres };
  }
  if (key === 'ContextMenu' || (key === 'F10' && shift)) return { kind: 'menu' };
  if (key === 'Delete' || key === 'Backspace') return { kind: 'action', id: 'delete' };
  return letterCommand(key.toLowerCase(), shift, mod);
}

function nudgeOps(floorId: string, target: ActionTarget, dx: number, dy: number): ActionOutcome {
  if (target.kind === 'object') {
    if (target.object.locked) return ops([], target.object.id);
    return ops([{ op: 'move', kind: 'object', floorId, id: target.object.id, dx, dy }], null);
  }
  if (target.kind === 'room') {
    return ops([{ op: 'move', kind: 'room', floorId, id: target.room.id, dx, dy }], target.room.id);
  }
  const { placement } = target;
  const at = { x: placement.at.x + dx, y: placement.at.y + dy };
  return ops([placementOp(floorId, placement.deviceId, { at })], placement.deviceId);
}

export function commandOutcome(
  scene: ActionScene,
  target: ActionTarget,
  command: SelectionCommand,
): ActionOutcome {
  const locked = target.kind === 'object' && target.object.locked;
  const self = idOf(target);
  if (command.kind === 'nudge') return nudgeOps(scene.floor.id, target, command.dx, command.dy);
  if (command.kind === 'turn') {
    return locked ? ops([], self) : ops(turnOps(scene.floor.id, target, command.degrees), self);
  }
  if (command.id === 'rotate' && locked) return ops([], self);
  if (target.kind !== 'object' && command.id !== 'rotate' && command.id !== 'delete') {
    return ops([], self);
  }
  return runAction(scene, target, command.id);
}
