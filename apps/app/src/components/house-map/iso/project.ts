import {
  CUT_HEIGHT_METRES,
  LOW_WALL_HEIGHT_METRES,
  cutWalls,
  roomSides,
  styledWallHeight,
  wallSpan,
  wallStyleCuts,
  type WallSpan,
  type WallStyle,
} from '../3d/cutaway';
import { wallPieces } from '../3d/wall-pieces';
import { shownRooms } from '../plan/rooms';
import { objectCategory, type PlanSymbolLayer, type PlanSymbolOf } from '../plan/symbols';
import { floorLookOf, type StructureTheme } from '../3d/floor-looks';
import type { Rgb } from '../3d/mesh';
import {
  renderRoomAt,
  type RenderBounds,
  type RenderFloor,
  type RenderObject,
  type RenderPoint,
  type RenderRoom,
  type RenderWall,
} from '../render-scene';

export interface IsoView {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

export const ISO_VIEW: IsoView = { azimuthDeg: -45, elevationDeg: 30 };

export interface IsoBasis {
  readonly right: RenderPoint;
  readonly forward: RenderPoint;
  readonly sin: number;
  readonly cos: number;
  readonly polar: number;
  readonly azimuth: number;
}

export interface IsoPoint {
  readonly u: number;
  readonly v: number;
}

export interface IsoFrame {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface IsoPrism {
  readonly ring: readonly RenderPoint[];
  readonly base: number;
  readonly top: number;
}

export interface IsoFace {
  readonly d: string;
  readonly shade: number;
}

export interface IsoPrismDraw {
  readonly top: string;
  readonly sides: readonly IsoFace[];
  readonly depth: number;
}

export const ISO_PADDING_PX = 12;

const DEGREES = Math.PI / 180;

const SIDE_SHADE_LIT = 0.1;

const SIDE_SHADE_RANGE = 0.32;

const LIGHT_FROM_RIGHT = -0.55;

const LIGHT_FROM_FRONT = -0.84;

const MIN_SPAN_METRES = 1;

export function isoBasis(view: IsoView = ISO_VIEW): IsoBasis {
  const azimuth = view.azimuthDeg * DEGREES;
  const elevation = view.elevationDeg * DEGREES;
  return {
    forward: { x: -Math.sin(azimuth), y: Math.cos(azimuth) },
    right: { x: Math.cos(azimuth), y: Math.sin(azimuth) },
    sin: Math.sin(elevation),
    cos: Math.cos(elevation),
    polar: Math.PI / 2 - elevation,
    azimuth,
  };
}

const dot = (left: RenderPoint, right: RenderPoint): number => left.x * right.x + left.y * right.y;

export const isoDepth = (basis: IsoBasis, point: RenderPoint): number => dot(point, basis.forward);

export function isoProject(basis: IsoBasis, point: RenderPoint, z: number): IsoPoint {
  return { u: dot(point, basis.right), v: -dot(point, basis.forward) * basis.sin - z * basis.cos };
}

export function fitIsoFrame(
  basis: IsoBasis,
  bounds: RenderBounds,
  topMetres: number,
  viewport: { readonly width: number; readonly height: number },
): IsoFrame {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const points = [0, topMetres].flatMap((z) => corners.map((at) => isoProject(basis, at, z)));
  const us = points.map((point) => point.u);
  const vs = points.map((point) => point.v);
  const left = Math.min(...us);
  const top = Math.min(...vs);
  const spanU = Math.max(MIN_SPAN_METRES, Math.max(...us) - left);
  const spanV = Math.max(MIN_SPAN_METRES, Math.max(...vs) - top);
  const scale = Math.max(
    0,
    Math.min(
      (viewport.width - ISO_PADDING_PX * 2) / spanU,
      (viewport.height - ISO_PADDING_PX * 2) / spanV,
    ),
  );
  return {
    scale,
    offsetX: (viewport.width - spanU * scale) / 2 - left * scale,
    offsetY: (viewport.height - spanV * scale) / 2 - top * scale,
  };
}

export function isoPixels(frame: IsoFrame, point: IsoPoint): IsoPoint {
  return { u: frame.offsetX + point.u * frame.scale, v: frame.offsetY + point.v * frame.scale };
}

const fixed = (point: IsoPoint): string => `${point.u.toFixed(1)} ${point.v.toFixed(1)}`;

export function isoPath(
  basis: IsoBasis,
  frame: IsoFrame,
  ring: readonly RenderPoint[],
  z: number,
): string {
  if (ring.length < 2) return '';
  const [first, ...rest] = ring.map((point) =>
    fixed(isoPixels(frame, isoProject(basis, point, z))),
  );
  return `M${first ?? ''}${rest.map((point) => `L${point}`).join('')}Z`;
}

export function signedArea(ring: readonly RenderPoint[]): number {
  let area = 0;
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    area += point.x * next.y - next.x * point.y;
  });
  return area / 2;
}

const counterClockwise = (ring: readonly RenderPoint[]): readonly RenderPoint[] =>
  signedArea(ring) < 0 ? [...ring].reverse() : ring;

function sideShade(basis: IsoBasis, normal: RenderPoint): number {
  const light = {
    x: basis.right.x * LIGHT_FROM_RIGHT + basis.forward.x * LIGHT_FROM_FRONT,
    y: basis.right.y * LIGHT_FROM_RIGHT + basis.forward.y * LIGHT_FROM_FRONT,
  };
  const lit = Math.max(0, dot(normal, light) / Math.hypot(light.x, light.y));
  return SIDE_SHADE_LIT + (1 - lit) * SIDE_SHADE_RANGE;
}

export function isoPrism(basis: IsoBasis, frame: IsoFrame, prism: IsoPrism): IsoPrismDraw {
  const ring = counterClockwise(prism.ring);
  const sides = ring.flatMap((from, index): readonly IsoFace[] => {
    const to = ring[(index + 1) % ring.length] ?? from;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) return [];
    const normal = { x: (to.y - from.y) / length, y: -(to.x - from.x) / length };
    if (dot(normal, basis.forward) >= 0) return [];
    const corners = [from, to].map((at) => isoPixels(frame, isoProject(basis, at, prism.base)));
    const raised = [to, from].map((at) => isoPixels(frame, isoProject(basis, at, prism.top)));
    const d = `M${[...corners, ...raised].map(fixed).join('L')}Z`;
    return [{ d, shade: sideShade(basis, normal) }];
  });
  const centre = ring.reduce((sum, at) => ({ x: sum.x + at.x, y: sum.y + at.y }), { x: 0, y: 0 });
  const count = Math.max(1, ring.length);
  return {
    top: isoPath(basis, frame, ring, prism.top),
    sides,
    depth: isoDepth(basis, { x: centre.x / count, y: centre.y / count }),
  };
}

export function isoPlaneMatrix(
  basis: IsoBasis,
  frame: IsoFrame,
  place: { readonly at: RenderPoint; readonly rotationDeg: number; readonly z: number },
): string {
  const turn = place.rotationDeg * DEGREES;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const column = (x: number, y: number): IsoPoint => ({
    u: (x * basis.right.x + y * basis.right.y) * frame.scale,
    v: -(x * basis.forward.x + y * basis.forward.y) * basis.sin * frame.scale,
  });
  const along = column(cos, sin);
  const across = column(-sin, cos);
  const origin = isoPixels(frame, isoProject(basis, place.at, place.z));
  return `matrix(${[along.u, along.v, across.u, across.v, origin.u, origin.v].map((value) => value.toFixed(4)).join(' ')})`;
}

export interface IsoWallPiece {
  readonly id: string;
  readonly wall: RenderWall;
  readonly glass: boolean;
  readonly prism: IsoPrism;
}

function pieceRing(wall: RenderWall, start: number, end: number): readonly RenderPoint[] {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const along = { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
  const half = Math.max(wall.thickness, 0.02) / 2;
  const side = { x: -along.y * half, y: along.x * half };
  const at = (station: number, sign: number): RenderPoint => ({
    x: wall.from.x + along.x * station + side.x * sign,
    y: wall.from.y + along.y * station + side.y * sign,
  });
  return [at(start, -1), at(end, -1), at(end, 1), at(start, 1)];
}

function wallSpans(floor: RenderFloor): readonly (WallSpan | null)[] {
  const rooms = shownRooms(floor);
  const insideRoom = (point: RenderPoint): boolean => renderRoomAt(rooms, point) !== null;
  return floor.walls.map((wall) =>
    wallSpan(wall, roomSides(insideRoom, wall), { first: 0, count: 1, base: 0 }),
  );
}

export function isoWallPieces(
  basis: IsoBasis,
  floor: RenderFloor,
  style: WallStyle,
): readonly IsoWallPiece[] {
  const spans = wallSpans(floor);
  const present = spans.flatMap((span) => (span === null ? [] : [span]));
  const cutFlags = wallStyleCuts(style)
    ? cutWalls(present, { azimuth: basis.azimuth, polar: basis.polar }, [], new Set())
    : present.map(() => false);
  let cursor = 0;
  return floor.walls.flatMap((wall, index) => {
    if (spans[index] === null) return [];
    const cut = cutFlags[cursor] === true;
    cursor += 1;
    const full = styledWallHeight(style, wall.height, LOW_WALL_HEIGHT_METRES);
    const height = cut ? Math.min(full, CUT_HEIGHT_METRES) : full;
    return wallPieces(wall, height, floor.openings).map((piece, pieceIndex) => ({
      id: `${wall.id}:${String(pieceIndex)}`,
      wall,
      glass: piece.glass,
      prism: { ring: pieceRing(wall, piece.start, piece.end), base: piece.base, top: piece.top },
    }));
  });
}

export const DEFAULT_OBJECT_METRES = 0.6;

export const DEFAULT_OBJECT_HEIGHT_METRES = 0.75;

export function objectRing(item: RenderObject): readonly RenderPoint[] {
  if (item.footprint !== null && item.footprint.length >= 3) return item.footprint;
  const halfX = (item.params['depth'] ?? DEFAULT_OBJECT_METRES) / 2;
  const halfY = (item.params['width'] ?? DEFAULT_OBJECT_METRES) / 2;
  return squareRing(item.at, item.rotationDeg, halfX, halfY);
}

export function squareRing(
  at: RenderPoint,
  rotationDeg: number,
  halfX: number,
  halfY: number,
): readonly RenderPoint[] {
  const turn = rotationDeg * DEGREES;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return [
    [-halfX, -halfY],
    [halfX, -halfY],
    [halfX, halfY],
    [-halfX, halfY],
  ].map(([x = 0, y = 0]) => ({ x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos }));
}

export function circleRing(at: RenderPoint, radius: number, sides: number): readonly RenderPoint[] {
  return Array.from({ length: sides }, (_, index) => {
    const turn = (index / sides) * Math.PI * 2;
    return { x: at.x + Math.cos(turn) * radius, y: at.y + Math.sin(turn) * radius };
  });
}

export function objectHeight(item: RenderObject): number {
  return item.height ?? item.params['height'] ?? DEFAULT_OBJECT_HEIGHT_METRES;
}

export interface IsoObjectTop {
  readonly category: string;
  readonly symbol: readonly PlanSymbolLayer[] | null;
  readonly glyphMetres: number;
}

export function objectTop(item: RenderObject, symbolOf: PlanSymbolOf | undefined): IsoObjectTop {
  const symbol = symbolOf?.(item) ?? null;
  const ring = objectRing(item);
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  const short = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return {
    category: objectCategory(item),
    symbol: symbol === null ? null : symbol.layers,
    glyphMetres: short * 0.55,
  };
}

const NO_RGB: Rgb = [0, 0, 0];

const channel = (value: number): string =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');

export const rgbHex = (colour: Rgb): string =>
  `#${channel(colour[0])}${channel(colour[1])}${channel(colour[2])}`;

export function isoFloorFill(room: RenderRoom, roomColour: string, theme: StructureTheme): string {
  const look = floorLookOf(room.floor, NO_RGB, { tone: 'material', theme });
  return look.base === NO_RGB ? roomColour : rgbHex(look.base);
}

export function ellipsePath(pool: {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}): string {
  const rx = pool.rx.toFixed(1);
  const ry = pool.ry.toFixed(1);
  const across = (pool.rx * 2).toFixed(1);
  return `M${(pool.cx - pool.rx).toFixed(1)} ${pool.cy.toFixed(1)}a${rx} ${ry} 0 1 0 ${across} 0a${rx} ${ry} 0 1 0 -${across} 0Z`;
}
