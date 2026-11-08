import type { RenderFloor, RenderPoint, RenderRoom, RenderWall } from '../render-scene';
import {
  CUT_HEIGHT_METRES,
  LOW_WALL_HEIGHT_METRES,
  roomSides,
  styledWallHeight,
  wallNormal,
  wallSpan,
  wallStyleCuts,
  type WallSpan,
  type WallStyle,
} from './cutaway';
import {
  floorLookOf,
  hexRgb,
  parseHexColour,
  type FloorLook,
  type FloorTone,
  type StructureTheme,
} from './floor-looks';
import {
  addFlat,
  addPolygonFlat,
  addSide,
  createCollector,
  finishLayer,
  triangleCount,
  type Collector,
  type MeshLayer,
  type Rgb,
  type Vec3,
} from './mesh';
import { wallPieces, type WallPiece } from './wall-pieces';

export type StructureFloor = Pick<RenderFloor, 'rooms' | 'walls' | 'openings' | 'carpets'>;

export interface StructureOptions {
  readonly theme: StructureTheme;
  readonly wallStyle: WallStyle;
  readonly lowWallHeight: number;
  readonly floorTone: FloorTone;
}

export const DEFAULT_STRUCTURE_OPTIONS: StructureOptions = {
  theme: 'light',
  wallStyle: 'cutaway',
  lowWallHeight: LOW_WALL_HEIGHT_METRES,
  floorTone: 'material',
};

export interface StructureRoomRange {
  readonly roomId: string;
  readonly firstTriangle: number;
  readonly triangleCount: number;
  readonly look: FloorLook;
}

export interface StructureLabel {
  readonly roomId: string;
  readonly name: string;
  readonly position: Vec3;
}

export interface StructureGeometry {
  readonly floor: MeshLayer | null;
  readonly walls: MeshLayer | null;
  readonly carpets: MeshLayer | null;
  readonly rooms: readonly StructureRoomRange[];
  readonly spans: readonly WallSpan[];
  readonly labels: readonly StructureLabel[];
  readonly cutHeight: number;
}

interface StructurePalette {
  readonly floors: readonly Rgb[];
  readonly exteriorWall: Rgb;
  readonly interiorWall: Rgb;
  readonly exteriorTop: Rgb;
  readonly interiorTop: Rgb;
  readonly carpet: Rgb;
  readonly glass: Rgb;
}

interface WallPaint {
  readonly left: Rgb;
  readonly right: Rgb;
  readonly cap: Rgb;
  readonly top: Rgb;
}

const PALETTES: Readonly<Record<StructureTheme, StructurePalette>> = {
  light: {
    floors: [0xbcd4ec, 0xead2ad, 0xc3e0bd, 0xeec3c9, 0xd2c6ef, 0xeadf9f, 0xb4e0dc, 0xe7cba9].map(
      hexRgb,
    ),
    exteriorWall: hexRgb(0xd3cec4),
    interiorWall: hexRgb(0xe4e0d8),
    exteriorTop: hexRgb(0xf4f1eb),
    interiorTop: hexRgb(0xf8f6f2),
    carpet: hexRgb(0xb59a7a),
    glass: hexRgb(0xa9d4ea),
  },
  dark: {
    floors: [0x2f4e6e, 0x5f4a30, 0x3a5e3a, 0x613d48, 0x4a4282, 0x5e5a2c, 0x2b5c58, 0x5e4630].map(
      hexRgb,
    ),
    exteriorWall: hexRgb(0x5a5853),
    interiorWall: hexRgb(0x6e6c66),
    exteriorTop: hexRgb(0x5a5853),
    interiorTop: hexRgb(0x6e6c66),
    carpet: hexRgb(0x7c6a52),
    glass: hexRgb(0x3d6a85),
  },
};

const NEUTRAL_FLOOR: Rgb = [0.87, 0.87, 0.87];

const CARPET_HEIGHT_METRES = 0.012;

const HALF_WALL_METRES = 1;

const RAILING_THICKNESS_METRES = 0.04;

const GLASS_SHARE_OF_THICKNESS = 0.3;

const PAINT_PROBE_METRES = 0.2;

function insideRing(point: RenderPoint, ring: readonly RenderPoint[]): boolean {
  let inside = false;
  ring.forEach((corner, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length] ?? corner;
    const crosses = corner.y > point.y !== previous.y > point.y;
    const edgeX =
      ((previous.x - corner.x) * (point.y - corner.y)) / (previous.y - corner.y) + corner.x;
    if (crosses && point.x < edgeX) inside = !inside;
  });
  return inside;
}

function roomAt(rooms: readonly RenderRoom[], point: RenderPoint): RenderRoom | null {
  return (
    rooms.find((room) =>
      room.polygons.some(
        (polygon) =>
          insideRing(point, polygon.outer) &&
          !polygon.holes.some((hole) => insideRing(point, hole)),
      ),
    ) ?? null
  );
}

function floorLayer(
  rooms: readonly RenderRoom[],
  palette: StructurePalette,
  options: StructureOptions,
): { readonly layer: MeshLayer | null; readonly ranges: readonly StructureRoomRange[] } {
  const collector = createCollector();
  const ranges = rooms.map((room) => {
    const look = floorLookOf(room.floor, palette.floors[room.colourSlot - 1] ?? NEUTRAL_FLOOR, {
      tone: options.floorTone,
      theme: options.theme,
    });
    const first = triangleCount(collector);
    for (const polygon of room.polygons) {
      addPolygonFlat(collector, polygon, { y: 0, colour: look.base });
    }
    return {
      roomId: room.id,
      firstTriangle: first,
      triangleCount: triangleCount(collector) - first,
      look,
    };
  });
  return { layer: finishLayer('floor', collector, 1), ranges };
}

function paintOf(
  wall: RenderWall,
  rooms: readonly RenderRoom[],
  palette: StructurePalette,
): WallPaint {
  const plain = wall.exterior ? palette.exteriorWall : palette.interiorWall;
  const normal = wallNormal(wall) ?? { x: 0, y: 0 };
  const middle = { x: (wall.from.x + wall.to.x) / 2, y: (wall.from.y + wall.to.y) / 2 };
  const paintOn = (sign: number): Rgb => {
    const room = roomAt(rooms, {
      x: middle.x + normal.x * PAINT_PROBE_METRES * sign,
      y: middle.y + normal.y * PAINT_PROBE_METRES * sign,
    });
    return parseHexColour(room?.wallPaint ?? null) ?? plain;
  };
  const top = wall.exterior ? palette.exteriorTop : palette.interiorTop;
  return { left: paintOn(1), right: paintOn(-1), cap: plain, top };
}

function pieceRing(wall: RenderWall, piece: WallPiece, half: number): readonly RenderPoint[] {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const along = { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
  const start = piece.start - (piece.start <= 0 ? half : 0);
  const end = piece.end + (piece.end >= length ? half : 0);
  const at = (station: number, sign: number): RenderPoint => ({
    x: wall.from.x + along.x * station - along.y * half * sign,
    y: wall.from.y + along.y * station + along.x * half * sign,
  });
  return [at(start, -1), at(end, -1), at(end, 1), at(start, 1)];
}

function addPiece(
  collector: Collector,
  ring: readonly RenderPoint[],
  piece: WallPiece,
  paint: WallPaint,
): void {
  const height = piece.top - piece.base;
  addFlat(collector, ring, { y: piece.top, colour: paint.top });
  const faces = [paint.right, paint.cap, paint.left, paint.cap];
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    addSide(collector, [from, to], { base: piece.base, height, colour: faces[index] ?? paint.cap });
  });
}

function kindHeight(wall: RenderWall): number {
  return wall.kind === 'half' || wall.kind === 'railing'
    ? Math.min(wall.height, HALF_WALL_METRES)
    : wall.height;
}

function halfThickness(wall: RenderWall, piece: WallPiece): number {
  const thickness = wall.kind === 'railing' ? RAILING_THICKNESS_METRES : wall.thickness;
  return (piece.glass ? thickness * GLASS_SHARE_OF_THICKNESS : thickness) / 2;
}

function wallsLayer(
  floor: StructureFloor,
  rooms: readonly RenderRoom[],
  palette: StructurePalette,
  options: StructureOptions,
): { readonly layer: MeshLayer | null; readonly spans: readonly WallSpan[] } {
  const collector = createCollector();
  const insideRoom = (point: RenderPoint): boolean => roomAt(rooms, point) !== null;
  const glass: WallPaint = {
    left: palette.glass,
    right: palette.glass,
    cap: palette.glass,
    top: palette.glass,
  };
  const spans = floor.walls.flatMap((wall) => {
    const height = styledWallHeight(options.wallStyle, kindHeight(wall), options.lowWallHeight);
    const pieces = wallPieces(wall, height, floor.openings);
    if (pieces.length === 0) return [];
    const sides = roomSides(insideRoom, wall);
    const paint = paintOf(wall, rooms, palette);
    return pieces.flatMap((piece) => {
      const first = collector.positions.length / 3;
      addPiece(
        collector,
        pieceRing(wall, piece, halfThickness(wall, piece)),
        piece,
        piece.glass ? glass : paint,
      );
      const count = collector.positions.length / 3 - first;
      const span = wallSpan(wall, sides, { first, count, base: piece.base });
      return span === null ? [] : [span];
    });
  });
  return {
    layer: finishLayer('walls', collector, 1),
    spans: wallStyleCuts(options.wallStyle) ? spans : [],
  };
}

function carpetsLayer(floor: StructureFloor, palette: StructurePalette): MeshLayer | null {
  const collector = createCollector();
  for (const carpet of floor.carpets) {
    addFlat(collector, carpet.ring, { y: CARPET_HEIGHT_METRES, colour: palette.carpet });
  }
  return finishLayer('carpets', collector, 1);
}

function labelsOf(rooms: readonly RenderRoom[]): readonly StructureLabel[] {
  return rooms.flatMap((room) =>
    room.name === null || room.name.length === 0
      ? []
      : [
          {
            roomId: room.id,
            name: room.name,
            position: [room.labelAt.x, 0, -room.labelAt.y] as const,
          },
        ],
  );
}

export function buildStructure(
  floor: StructureFloor,
  options: StructureOptions = DEFAULT_STRUCTURE_OPTIONS,
): StructureGeometry {
  const palette = PALETTES[options.theme];
  const rooms = floor.rooms.filter((room) => !room.hidden);
  const floors = floorLayer(rooms, palette, options);
  const walls = wallsLayer(floor, rooms, palette, options);
  return {
    floor: floors.layer,
    walls: walls.layer,
    carpets: carpetsLayer(floor, palette),
    rooms: floors.ranges,
    spans: walls.spans,
    labels: labelsOf(rooms),
    cutHeight: CUT_HEIGHT_METRES,
  };
}
