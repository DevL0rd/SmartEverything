import {
  homeMapRoomAt,
  homeMapWallLength,
  homeMapWallPose,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRoom,
} from '@smarteverything/domain';
import type { FloorPattern } from '../../../../components/house-map/3d/floor-looks';
import {
  NO_EDIT_OVERLAY,
  type EditOverlay,
  type EditPaintTarget,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { FinishToken } from '../../../../components/models/three/materials';
import type { EditorNotice } from '../mount-edit';

export interface FloorChoice {
  readonly id: string;
  readonly kind: string;
  readonly variant: string | null;
  readonly label: string;
}

const choice = (kind: string, variant: string | null, label: string): FloorChoice => ({
  id: variant === null ? kind : `${kind}:${variant}`,
  kind,
  variant,
  label,
});

const LIGHT_WOOD = choice('wood', 'light', 'Light wood');

export const FLOOR_CHOICES: readonly FloorChoice[] = [
  LIGHT_WOOD,
  choice('wood', 'medium', 'Medium wood'),
  choice('wood', 'dark', 'Dark wood'),
  choice('wood', 'herringbone', 'Herringbone'),
  choice('laminate', null, 'Laminate'),
  choice('tile', 'small', 'Small tiles'),
  choice('tile', 'large', 'Large tiles'),
  choice('tile', 'hex', 'Hex tiles'),
  choice('marble', null, 'Marble'),
  choice('stone', null, 'Stone'),
  choice('concrete', null, 'Concrete'),
  choice('terrazzo', null, 'Terrazzo'),
  choice('vinyl', null, 'Vinyl'),
  choice('carpet', null, 'Carpet'),
  choice('rubber', null, 'Rubber'),
  choice('deck', null, 'Deck'),
  choice('grass', null, 'Grass'),
  choice('gravel', null, 'Gravel'),
];

export interface FinishSwatch {
  readonly token: FinishToken;
  readonly hex: string;
  readonly label: string;
}

const MATTE_WHITE: FinishSwatch = { token: 'matte-white', hex: '#F2F1EE', label: 'Matte white' };

export const WALL_PAINTS: readonly FinishSwatch[] = [
  MATTE_WHITE,
  { token: 'warm-white', hex: '#EFE8DC', label: 'Warm white' },
  { token: 'ceramic', hex: '#F4F2EE', label: 'Ceramic' },
  { token: 'ash', hex: '#D8C7A8', label: 'Ash' },
  { token: 'terrazzo', hex: '#DAD4CB', label: 'Stone grey' },
  { token: 'knit-fabric', hex: '#8E8A84', label: 'Fabric grey' },
  { token: 'terracotta', hex: '#B8664A', label: 'Terracotta' },
  { token: 'graphite', hex: '#3A3D42', label: 'Graphite' },
  { token: 'satin-black', hex: '#1D1E21', label: 'Satin black' },
];

export interface WallChoice {
  readonly id: string;
  readonly hex: string | null;
  readonly label: string;
}

const PLAIN_WALLS: WallChoice = { id: 'plain', hex: null, label: 'Plain' };

const wallChoice = (paint: FinishSwatch): WallChoice => ({
  id: paint.token,
  hex: paint.hex,
  label: paint.label,
});

export const WALL_CHOICES: readonly WallChoice[] = [PLAIN_WALLS, ...WALL_PAINTS.map(wallChoice)];

export const FLOOR_TINTS: readonly FinishSwatch[] = [
  { token: 'ash', hex: '#D8C7A8', label: 'Ash' },
  { token: 'oak', hex: '#B88A5A', label: 'Oak' },
  { token: 'walnut', hex: '#5E3F2C', label: 'Walnut' },
  { token: 'marble', hex: '#E9E6E1', label: 'Marble' },
  { token: 'terrazzo', hex: '#DAD4CB', label: 'Terrazzo' },
  { token: 'terracotta', hex: '#B8664A', label: 'Terracotta' },
  { token: 'graphite', hex: '#3A3D42', label: 'Graphite' },
  { token: 'rubber', hex: '#232427', label: 'Rubber' },
];

export const CEILING_RANGE = { min: 1.5, max: 12, step: 0.05 } as const;

export const MATERIALS_LABEL = 'Materials';

type RoomLook = Pick<HomeMapRoom, 'id' | 'floorMaterial' | 'wallPaint' | 'ceilingHeight'>;

export function floorChoiceId(material: HomeMapRoom['floorMaterial']): string | null {
  const found = FLOOR_CHOICES.find(
    (item) => item.kind === material.kind && item.variant === material.variant,
  );
  return found?.id ?? null;
}

const roomUpdate = (floorId: string, id: string, patch: Record<string, unknown>): HomeMapOp => ({
  op: 'update',
  kind: 'room',
  floorId,
  id,
  patch,
});

export function floorMaterialOps(
  floorId: string,
  rooms: readonly RoomLook[],
  picked: FloorChoice,
): readonly HomeMapOp[] {
  return rooms.map((room) =>
    roomUpdate(floorId, room.id, {
      floorMaterial: {
        ...room.floorMaterial,
        kind: picked.kind,
        variant: picked.variant,
        tint: null,
      },
    }),
  );
}

export function tintOps(
  floorId: string,
  rooms: readonly RoomLook[],
  tint: string | null,
): readonly HomeMapOp[] {
  return rooms.map((room) =>
    roomUpdate(floorId, room.id, { floorMaterial: { ...room.floorMaterial, tint } }),
  );
}

export function wallPaintOps(
  floorId: string,
  rooms: readonly RoomLook[],
  paint: string | null,
): readonly HomeMapOp[] {
  return rooms.map((room) => roomUpdate(floorId, room.id, { wallPaint: paint }));
}

export function roomCeilingOps(
  floorId: string,
  room: RoomLook,
  height: number | null,
): readonly HomeMapOp[] {
  return room.ceilingHeight === height
    ? []
    : [roomUpdate(floorId, room.id, { ceilingHeight: height })];
}

export function floorCeilingOps(
  floor: Pick<HomeMapFloor, 'id' | 'ceilingHeight'>,
  height: number,
): readonly HomeMapOp[] {
  return floor.ceilingHeight === height
    ? []
    : [{ op: 'setFloor', floorId: floor.id, patch: { ceilingHeight: height } }];
}

export function matchRoomOps(
  floorId: string,
  from: RoomLook,
  rooms: readonly RoomLook[],
): readonly HomeMapOp[] {
  return rooms
    .filter((room) => room.id !== from.id)
    .map((room) =>
      roomUpdate(floorId, room.id, {
        floorMaterial: from.floorMaterial,
        wallPaint: from.wallPaint,
      }),
    );
}

export function box(x: number, y: number, w: number, h: number): string {
  return `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}z`;
}

export const VIEW_W = 96;
export const VIEW_H = 48;
const PX_PER_M = 80;
const MIN_STEP_PX = 4;

const steps = (step: number, span: number): readonly number[] =>
  Array.from({ length: Math.ceil(span / step) + 1 }, (_, at) => at * step);

function planks(step: number): string {
  return steps(step, VIEW_H)
    .map((y, row) => {
      const shift = row % 2 === 0 ? 0 : step * 2.5;
      const joints = steps(step * 5, VIEW_W + step * 5).map(
        (x) => `M${String(x - shift)} ${String(y)}v${String(step)}`,
      );
      return `M0 ${String(y)}H${String(VIEW_W)}${joints.join('')}`;
    })
    .join('');
}

function herringbone(step: number): string {
  return steps(step, VIEW_H)
    .flatMap((y) =>
      steps(step * 2, VIEW_W).map(
        (x) =>
          `M${String(x)} ${String(y + step)}l${String(step)} ${String(-step)}l${String(step)} ${String(step)}`,
      ),
    )
    .join('');
}

function grid(step: number): string {
  const across = steps(step, VIEW_H).map((y) => `M0 ${String(y)}H${String(VIEW_W)}`);
  const down = steps(step, VIEW_W).map((x) => `M${String(x)} 0V${String(VIEW_H)}`);
  return [...across, ...down].join('');
}

function hexes(step: number): string {
  const r = step / 2;
  const rise = (Math.sqrt(3) * r) / 2;
  return steps(r * 1.5, VIEW_W)
    .flatMap((cx, col) =>
      steps(rise * 2, VIEW_H).map((y) => {
        const cy = y + (col % 2 === 0 ? 0 : rise);
        return `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}l${(r / 2).toFixed(1)} ${(-rise).toFixed(1)}h${r.toFixed(1)}l${(r / 2).toFixed(1)} ${rise.toFixed(1)}l${(-r / 2).toFixed(1)} ${rise.toFixed(1)}h${(-r).toFixed(1)}z`;
      }),
    )
    .join('');
}

function speckle(step: number): string {
  return steps(step, VIEW_H)
    .flatMap((y, row) =>
      steps(step, VIEW_W).map((x, col) => {
        const jitter = ((row * 7 + col * 13) % 5) / 5;
        return `M${(x + jitter * step).toFixed(1)} ${(y + (1 - jitter) * step * 0.6).toFixed(1)}h0.1`;
      }),
    )
    .join('');
}

const DIAGONALS = (step: number): string =>
  steps(step, VIEW_W + VIEW_H)
    .map(
      (x) =>
        `M${String(x)} 0l${String(-VIEW_H)} ${String(VIEW_H)}M${String(x - VIEW_H)} 0l${String(VIEW_H)} ${String(VIEW_H)}`,
    )
    .join('');

const PATTERN_PATHS: Readonly<Record<FloorPattern, (step: number) => string>> = {
  plain: () => '',
  planks,
  herringbone,
  tiles: grid,
  hex: hexes,
  cobble: (step) => planks(step * 1.4),
  weave: DIAGONALS,
  speckle,
};

export function patternPath(pattern: FloorPattern, scaleMetres: number): string {
  return PATTERN_PATHS[pattern](Math.max(MIN_STEP_PX, scaleMetres * PX_PER_M));
}

export const FINISH_SURFACES = ['floors', 'walls', 'ceilings'] as const;

export type FinishSurface = (typeof FINISH_SURFACES)[number];

export const FINISH_SURFACE_LABELS: Readonly<Record<FinishSurface, string>> = {
  floors: 'Floors',
  walls: 'Walls',
  ceilings: 'Ceilings',
};

export interface FinishPick {
  readonly surface: FinishSurface;
  readonly floor: FloorChoice;
  readonly wall: WallChoice;
}

export const INITIAL_FINISH: FinishPick = {
  surface: 'floors',
  floor: LIGHT_WOOD,
  wall: wallChoice(MATTE_WHITE),
};

export const CEILING_HINT = 'Tap a room to set its ceiling height';

export function finishNotice(pick: FinishPick): EditorNotice {
  if (pick.surface === 'ceilings') return { text: CEILING_HINT, tone: 'info' };
  const text =
    pick.surface === 'floors'
      ? `Tap a floor to apply ${pick.floor.label}`
      : `Tap a wall to apply ${pick.wall.label}`;
  return { text, tone: 'info' };
}

export function finishOverlay(
  pick: FinishPick,
  selected: string | null,
  readOnly: boolean,
): EditOverlay {
  const selection = selected === null ? [] : [selected];
  if (pick.surface === 'ceilings') return { ...NO_EDIT_OVERLAY, selection, readOnly };
  const surface = pick.surface === 'floors' ? 'floor' : 'wall';
  return { ...NO_EDIT_OVERLAY, mode: 'paint', paint: { surface }, selection, readOnly };
}

const WALL_PROBE_M = 0.05;

const OTHER_SIDE = { left: 'right', right: 'left' } as const;

type PaintRoom = Pick<
  HomeMapRoom,
  'id' | 'polygon' | 'floorMaterial' | 'wallPaint' | 'ceilingHeight'
>;

type PaintFloor = Pick<HomeMapFloor, 'id' | 'walls'> & { readonly rooms: readonly PaintRoom[] };

function roomBehindWall(
  floor: PaintFloor,
  target: Extract<EditPaintTarget, { readonly kind: 'wall' }>,
): PaintRoom | null {
  const wall = floor.walls.find((item) => item.id === target.wallId);
  if (wall === undefined) return null;
  const offset = homeMapWallLength(wall) / 2;
  for (const side of [target.side, OTHER_SIDE[target.side]]) {
    const pose = homeMapWallPose(wall, { offset, side });
    if (pose === null) return null;
    const probe = {
      x: pose.at.x + pose.normal.x * WALL_PROBE_M,
      y: pose.at.y + pose.normal.y * WALL_PROBE_M,
    };
    const room = homeMapRoomAt(floor.rooms, probe);
    if (room !== null) return room;
  }
  return null;
}

export function paintedRoom(floor: PaintFloor, target: EditPaintTarget): PaintRoom | null {
  if (target.kind === 'wall') return roomBehindWall(floor, target);
  return floor.rooms.find((room) => room.id === target.roomId) ?? null;
}

export function paintOps(
  floorId: string,
  room: PaintRoom,
  pick: FinishPick,
  target: EditPaintTarget,
): readonly HomeMapOp[] {
  if (target.kind === 'wall') {
    return room.wallPaint === pick.wall.hex ? [] : wallPaintOps(floorId, [room], pick.wall.hex);
  }
  const same = floorChoiceId(room.floorMaterial) === pick.floor.id;
  return same && room.floorMaterial.tint === null
    ? []
    : floorMaterialOps(floorId, [room], pick.floor);
}
