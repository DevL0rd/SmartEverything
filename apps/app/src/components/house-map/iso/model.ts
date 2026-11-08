import { appendTo } from '@smarteverything/domain';
import type { WallStyle } from '../3d/cutaway';
import { deviceGlyphPathOf, glyphPathOf } from '../plan/glyphs';
import { roomRings, shownRooms } from '../plan/rooms';
import type { PlanSymbolLayer, PlanSymbolOf } from '../plan/symbols';
import type { OverlayZoneFill } from '../overlays/model-types';
import type {
  RenderFloor,
  RenderObject,
  RenderPoint,
  RenderPose,
  RenderRoom,
} from '../render-scene';
import {
  ISO_VIEW,
  circleRing,
  fitIsoFrame,
  isoBasis,
  isoPath,
  isoPixels,
  isoPlaneMatrix,
  isoPrism,
  isoProject,
  isoWallPieces,
  objectHeight,
  objectRing,
  objectTop,
  squareRing,
  type IsoBasis,
  type IsoFrame,
  type IsoPrismDraw,
  type IsoView,
} from './project';

const GLYPH_BOX = 24;

const DEVICE_METRES = 0.18;

const ROBOT_RADIUS_METRES = 0.175;

const ROBOT_HEIGHT_METRES = 0.1;

const ROBOT_SIDES = 20;

const POOL_RADIUS_METRES = 2.2;

const SIDE_EPSILON = 1e-9;

const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

const NO_IDS: readonly string[] = [];

const NO_ZONES: readonly OverlayZoneFill[] = [];

export interface IsoZone {
  readonly d: string;
  readonly occupied: boolean;
}

export interface IsoStillLook {
  readonly symbolOf?: PlanSymbolOf | undefined;
  readonly finishOf?: ((item: RenderObject) => string | null) | undefined;
}

export interface IsoStillInput {
  readonly floor: RenderFloor;
  readonly robot?: RenderPose | null | undefined;
  readonly litDeviceIds?: readonly string[] | undefined;
  readonly activeRoomIds?: readonly string[] | undefined;
  readonly zones?: readonly OverlayZoneFill[] | undefined;
  readonly wallStyle?: WallStyle | undefined;
  readonly view?: IsoView | undefined;
  readonly look?: IsoStillLook | undefined;
}

export type IsoSolidKind = 'wall' | 'exterior' | 'glass' | 'object' | 'device' | 'robot';

export interface IsoMark {
  readonly transform: string;
  readonly glyph: string | null;
  readonly symbol: readonly PlanSymbolLayer[] | null;
}

export interface IsoSolid {
  readonly id: string;
  readonly kind: IsoSolidKind;
  readonly finish: string | null;
  readonly base: number;
  readonly draw: IsoPrismDraw;
  readonly mark: IsoMark | null;
}

export interface IsoRoomDraw {
  readonly id: string;
  readonly d: string;
  readonly room: RenderRoom;
  readonly active: boolean;
}

export interface IsoPoolDraw {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface IsoPoolGroup {
  readonly roomId: string | null;
  readonly clip: string | null;
  readonly pools: readonly IsoPoolDraw[];
}

export interface IsoStillModel {
  readonly rooms: readonly IsoRoomDraw[];
  readonly zones: readonly IsoZone[];
  readonly pools: readonly IsoPoolGroup[];
  readonly solids: readonly IsoSolid[];
}

interface Placed {
  readonly solid: IsoSolid;
  readonly ring: readonly RenderPoint[];
  readonly line: { readonly from: RenderPoint; readonly to: RenderPoint } | null;
}

interface Build {
  readonly basis: IsoBasis;
  readonly frame: IsoFrame;
  readonly input: IsoStillInput;
}

const glyphMark = (matrix: string, metres: number, glyph: string): IsoMark => {
  const k = (metres / GLYPH_BOX).toFixed(4);
  return { transform: `${matrix} scale(${k} -${k})`, glyph, symbol: null };
};

function objectSolid({ basis, frame, input }: Build, item: RenderObject): Placed {
  const ring = objectRing(item);
  const top = item.elevation + objectHeight(item);
  const face = objectTop(item, input.look?.symbolOf);
  const matrix = isoPlaneMatrix(basis, frame, {
    at: item.at,
    rotationDeg: item.rotationDeg,
    z: top,
  });
  const solid: IsoSolid = {
    id: `object:${item.id}`,
    kind: 'object',
    finish: input.look?.finishOf?.(item) ?? null,
    base: item.elevation,
    draw: isoPrism(basis, frame, { ring, base: item.elevation, top }),
    mark:
      face.symbol === null
        ? glyphMark(matrix, face.glyphMetres, glyphPathOf(face.category))
        : { transform: matrix, glyph: null, symbol: face.symbol },
  };
  return { solid, ring, line: null };
}

function deviceSolids({ basis, frame, input }: Build): readonly Placed[] {
  return input.floor.placements.map((placement) => {
    const base = Math.max(0, placement.height - DEVICE_METRES / 2);
    const top = base + DEVICE_METRES;
    const half = DEVICE_METRES / 2;
    const at = { at: placement.at, rotationDeg: placement.rotationDeg, z: top };
    const ring = squareRing(placement.at, placement.rotationDeg, half, half);
    const solid: IsoSolid = {
      id: `device:${placement.deviceId}`,
      kind: 'device',
      finish: null,
      base,
      draw: isoPrism(basis, frame, { ring, base, top }),
      mark: glyphMark(
        isoPlaneMatrix(basis, frame, at),
        DEVICE_METRES * 0.8,
        deviceGlyphPathOf(placement.kind),
      ),
    };
    return { solid, ring, line: null };
  });
}

function robotSolid({ basis, frame, input }: Build): readonly Placed[] {
  const pose = input.robot === undefined ? (input.floor.vacuum?.robot ?? null) : input.robot;
  if (pose === null) return [];
  const place = { at: pose, rotationDeg: pose.yawDeg, z: ROBOT_HEIGHT_METRES };
  const ring = circleRing(pose, ROBOT_RADIUS_METRES, ROBOT_SIDES);
  const solid: IsoSolid = {
    id: 'robot',
    kind: 'robot',
    finish: null,
    base: 0,
    draw: isoPrism(basis, frame, { ring, base: 0, top: ROBOT_HEIGHT_METRES }),
    mark: {
      transform: isoPlaneMatrix(basis, frame, place),
      glyph: `M0 0L${String(ROBOT_RADIUS_METRES * 0.8)} 0`,
      symbol: null,
    },
  };
  return [{ solid, ring, line: null }];
}

function wallSolids({ basis, frame, input }: Build): readonly Placed[] {
  return isoWallPieces(basis, input.floor, input.wallStyle ?? 'cutaway').map((piece) => ({
    solid: {
      id: `wall:${piece.id}`,
      kind: piece.glass ? 'glass' : piece.wall.exterior ? 'exterior' : 'wall',
      finish: null,
      base: piece.prism.base,
      draw: isoPrism(basis, frame, piece.prism),
      mark: null,
    },
    ring: piece.prism.ring,
    line: { from: piece.wall.from, to: piece.wall.to },
  }));
}

function screenSpan(basis: IsoBasis, ring: readonly RenderPoint[]): readonly [number, number] {
  const across = ring.map((at) => at.x * basis.right.x + at.y * basis.right.y);
  return [Math.min(...across), Math.max(...across)];
}

function ringCentre(ring: readonly RenderPoint[]): RenderPoint {
  const sum = ring.reduce((total, at) => ({ x: total.x + at.x, y: total.y + at.y }), {
    x: 0,
    y: 0,
  });
  const count = Math.max(1, ring.length);
  return { x: sum.x / count, y: sum.y / count };
}

function behindLine(basis: IsoBasis, line: NonNullable<Placed['line']>, at: RenderPoint): number {
  const normal = { x: line.from.y - line.to.y, y: line.to.x - line.from.x };
  const facing = normal.x * basis.forward.x + normal.y * basis.forward.y;
  if (Math.abs(facing) < SIDE_EPSILON) return 0;
  const side = (at.x - line.from.x) * normal.x + (at.y - line.from.y) * normal.y;
  return Math.abs(side) < SIDE_EPSILON ? 0 : Math.sign(side) * Math.sign(facing);
}

const fartherFirst = (left: IsoSolid, right: IsoSolid): number =>
  right.draw.depth - left.draw.depth || left.base - right.base;

function paintOrder(basis: IsoBasis, placed: readonly Placed[]): readonly IsoSolid[] {
  const after = placed.map((): number[] => []);
  const waiting = placed.map(() => 0);
  const spans = placed.map((entry) => screenSpan(basis, entry.ring));
  const precede = (first: number, second: number): void => {
    after[first]?.push(second);
    waiting[second] = (waiting[second] ?? 0) + 1;
  };
  placed.forEach((wall, wallIndex) => {
    const line = wall.line;
    if (line === null) return;
    const [wallMin, wallMax] = spans[wallIndex] ?? [0, 0];
    placed.forEach((other, otherIndex) => {
      if (other.line !== null) return;
      const [otherMin, otherMax] = spans[otherIndex] ?? [0, 0];
      if (otherMax <= wallMin || otherMin >= wallMax) return;
      const side = behindLine(basis, line, ringCentre(other.ring));
      if (side > 0) precede(otherIndex, wallIndex);
      if (side < 0) precede(wallIndex, otherIndex);
    });
  });
  const done = placed.map(() => false);
  const order: IsoSolid[] = [];
  while (order.length < placed.length) {
    let ready = -1;
    let any = -1;
    placed.forEach((entry, index) => {
      if (done[index] === true) return;
      const better = (current: number): boolean =>
        current === -1 || fartherFirst(entry.solid, placed[current]?.solid ?? entry.solid) < 0;
      if (better(any)) any = index;
      if (waiting[index] === 0 && better(ready)) ready = index;
    });
    const next = ready === -1 ? any : ready;
    done[next] = true;
    const entry = placed[next];
    if (entry !== undefined) order.push(entry.solid);
    for (const later of after[next] ?? []) waiting[later] = (waiting[later] ?? 0) - 1;
  }
  return order;
}

const roomPath = (build: Build, room: RenderRoom): string =>
  roomRings(room)
    .map((ring) => isoPath(build.basis, build.frame, ring, 0))
    .join('');

function poolGroups(build: Build, rooms: readonly IsoRoomDraw[]): readonly IsoPoolGroup[] {
  const lit = new Set(build.input.litDeviceIds ?? NO_IDS);
  const groups = new Map<string | null, IsoPoolDraw[]>();
  for (const placement of build.input.floor.placements) {
    if (!lit.has(placement.deviceId)) continue;
    const centre = isoPixels(build.frame, isoProject(build.basis, placement.at, 0));
    const rx = POOL_RADIUS_METRES * build.frame.scale;
    const pool = {
      id: placement.deviceId,
      cx: centre.u,
      cy: centre.v,
      rx,
      ry: rx * build.basis.sin,
    };
    appendTo(groups, placement.roomId, pool);
  }
  return [...groups].map(([roomId, pools]) => ({
    roomId,
    clip: rooms.find((room) => room.id === roomId)?.d ?? null,
    pools,
  }));
}

export function buildIsoStill(
  input: IsoStillInput,
  viewport: { readonly width: number; readonly height: number },
): IsoStillModel {
  const basis = isoBasis(input.view ?? ISO_VIEW);
  const tallest = Math.max(
    input.floor.ceilingHeight,
    ...input.floor.walls.map((wall) => wall.height),
  );
  const frame = fitIsoFrame(basis, input.floor.bounds ?? EMPTY_BOUNDS, tallest, viewport);
  const build: Build = { basis, frame, input };
  const active = new Set(input.activeRoomIds ?? NO_IDS);
  const rooms = shownRooms(input.floor).map((room) => ({
    id: room.id,
    d: roomPath(build, room),
    room,
    active: active.has(room.id),
  }));
  const solids = paintOrder(basis, [
    ...wallSolids(build),
    ...input.floor.objects.map((item) => objectSolid(build, item)),
    ...deviceSolids(build),
    ...robotSolid(build),
  ]);
  return {
    rooms,
    zones: (input.zones ?? NO_ZONES).map((zone) => ({
      occupied: zone.occupied,
      d: zone.polygons
        .flatMap((polygon) => [polygon.outer, ...polygon.holes])
        .map((ring) => isoPath(basis, frame, ring, 0))
        .join(''),
    })),
    pools: poolGroups(build, rooms),
    solids,
  };
}
