import {
  HOME_MAP_OPENING_KINDS,
  HOME_MAP_WALL_THICKNESS,
  homeMapProjectOnSegment,
  homeMapRingArea,
  homeMapWallsFromRings,
  type HomeMapPolygonShape,
  type HomeMapRingShape,
  type HomeMapSourceGeometry,
  type HomeMapVec,
} from '@smarteverything/domain';

export interface RectifyTransform {
  readonly rotationDeg: number;
  readonly tx: number;
  readonly ty: number;
  readonly mirrored: boolean;
}

export type RectifyOpeningKind = (typeof HOME_MAP_OPENING_KINDS)[number];

export interface RectifiedRoom {
  readonly ref: string;
  readonly name: string | null;
  readonly polygon: HomeMapPolygonShape;
  readonly labelAt: HomeMapVec;
  readonly floorCode: number | null;
}

export interface RectifiedWall {
  readonly ref: string;
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
  readonly thickness: number;
  readonly kind: 'solid';
}

export interface RectifiedOpening {
  readonly ref: string;
  readonly wallRef: string;
  readonly offset: number;
  readonly width: number;
  readonly kind: RectifyOpeningKind;
}

export interface RectifiedFurniture {
  readonly kind: string;
  readonly label: string;
  readonly modelId: string | null;
  readonly ring: HomeMapRingShape;
  readonly height: number | null;
}

export interface RectifySkip {
  readonly kind: 'room' | 'room_part' | 'door' | 'carpet' | 'furniture';
  readonly ref: string;
  readonly reason: string;
}

export interface RectifiedScene {
  readonly rooms: readonly RectifiedRoom[];
  readonly walls: readonly RectifiedWall[];
  readonly openings: readonly RectifiedOpening[];
  readonly carpets: readonly HomeMapRingShape[];
  readonly furniture: readonly RectifiedFurniture[];
  readonly dock: { readonly at: HomeMapVec; readonly yawDeg: number } | null;
  readonly skipped: readonly RectifySkip[];
}

export const RECTIFY_AXIS_SNAP_DEG = 8;
export const RECTIFY_JOIN_MAX_GAP_M = 0.3;
export const RECTIFY_CORNER_M = 0.5;

const QUARTER_TURN_DEG = 90;
const BIN_DEG = 1;
const BIN_COUNT = QUARTER_TURN_DEG / BIN_DEG;
const WINDOW_DEG = 1.5;
const COLLINEAR = 1e-9;
const MIN_RING_AREA = 1e-9;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const wrap = (value: number, period: number): number => ((value % period) + period) % period;

export const rectifyPoint = (transform: RectifyTransform, point: HomeMapVec): HomeMapVec => {
  const x = transform.mirrored ? -point.x : point.x;
  const cos = Math.cos(toRad(transform.rotationDeg));
  const sin = Math.sin(toRad(transform.rotationDeg));
  return { x: cos * x - sin * point.y + transform.tx, y: sin * x + cos * point.y + transform.ty };
};

export const rectifyYawDeg = (transform: RectifyTransform, yawRad: number): number => {
  const x = transform.mirrored ? -Math.cos(yawRad) : Math.cos(yawRad);
  const turn = toRad(transform.rotationDeg);
  return toDeg(
    Math.atan2(
      Math.sin(turn) * x + Math.cos(turn) * Math.sin(yawRad),
      Math.cos(turn) * x - Math.sin(turn) * Math.sin(yawRad),
    ),
  );
};

interface WeightedAngle {
  readonly angle: number;
  readonly weight: number;
}

const ringPairs = (ring: HomeMapRingShape): readonly (readonly [HomeMapVec, HomeMapVec])[] =>
  ring.map((point, index) => [point, ring[(index + 1) % ring.length] ?? point] as const);

const geometryRings = (geometry: HomeMapSourceGeometry): readonly HomeMapRingShape[] => [
  ...geometry.rooms.flatMap((room) => [
    room.ring,
    ...room.holes,
    ...room.extraParts.flatMap((part) => [part.ring, ...part.holes]),
  ]),
  ...geometry.carpets,
  ...geometry.furniture.map((item) => item.ring),
];

const edgeAngles = (geometry: HomeMapSourceGeometry): readonly WeightedAngle[] =>
  [
    ...geometryRings(geometry).flatMap(ringPairs),
    ...geometry.walls.map((wall) => [wall.from, wall.to] as const),
  ].flatMap(([a, b]) => {
    const weight = Math.hypot(b.x - a.x, b.y - a.y);
    return weight > 0
      ? [{ angle: wrap(toDeg(Math.atan2(b.y - a.y, b.x - a.x)), QUARTER_TURN_DEG), weight }]
      : [];
  });

const offsetFrom = (angle: number, centre: number): number =>
  wrap(angle - centre + QUARTER_TURN_DEG / 2, QUARTER_TURN_DEG) - QUARTER_TURN_DEG / 2;

export function dominantWallAngleDeg(geometry: HomeMapSourceGeometry): number {
  const angles = edgeAngles(geometry);
  const bins = Array.from({ length: BIN_COUNT }, () => 0);
  for (const { angle, weight } of angles) {
    const bin = Math.floor(angle / BIN_DEG) % BIN_COUNT;
    bins[bin] = (bins[bin] ?? 0) + weight;
  }
  const windowTotal = (bin: number): number =>
    [-1, 0, 1].reduce((sum, step) => sum + (bins[(bin + step + BIN_COUNT) % BIN_COUNT] ?? 0), 0);
  const peak = bins.reduce(
    (best, _, bin) => (windowTotal(bin) > windowTotal(best) ? bin : best),
    0,
  );
  const centre = (peak + 0.5) * BIN_DEG;
  const near = angles.filter(({ angle }) => Math.abs(offsetFrom(angle, centre)) <= WINDOW_DEG);
  const weight = near.reduce((sum, entry) => sum + entry.weight, 0);
  if (weight === 0) return 0;
  const mean =
    centre + near.reduce((sum, e) => sum + e.weight * offsetFrom(e.angle, centre), 0) / weight;
  return mean > QUARTER_TURN_DEG / 2 ? mean - QUARTER_TURN_DEG : mean;
}

export function estimateRectifyTransform(geometry: HomeMapSourceGeometry): RectifyTransform {
  const turn: RectifyTransform = {
    rotationDeg: 0 - dominantWallAngleDeg(geometry),
    tx: 0,
    ty: 0,
    mirrored: false,
  };
  const points = [
    ...geometryRings(geometry).flat(),
    ...geometry.walls.flatMap((wall) => [wall.from, wall.to]),
  ].map((point) => rectifyPoint(turn, point));
  if (points.length === 0) return turn;
  return {
    ...turn,
    tx: RECTIFY_CORNER_M - Math.min(...points.map((point) => point.x)),
    ty: RECTIFY_CORNER_M - Math.min(...points.map((point) => point.y)),
  };
}

type Axis = 'h' | 'v' | null;

const axisOf = (a: HomeMapVec, b: HomeMapVec): Axis => {
  const angle = toDeg(Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)));
  if (a.x === b.x && a.y === b.y) return null;
  if (angle <= RECTIFY_AXIS_SNAP_DEG) return 'h';
  return angle >= QUARTER_TURN_DEG - RECTIFY_AXIS_SNAP_DEG ? 'v' : null;
};

const runsOf = (axes: readonly Axis[]): readonly (readonly number[])[] => {
  const count = axes.length;
  const found = axes.findIndex((axis, index) => axis !== axes[(index + count - 1) % count]);
  const start = Math.max(found, 0);
  const runs: number[][] = [];
  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count;
    const axis = axes[index];
    if (axis === null || axis === undefined) continue;
    const last = runs.at(-1);
    if (step > 0 && last && axes[(index + count - 1) % count] === axis) last.push(index);
    else runs.push([index]);
  }
  return runs;
};

const runCoordinate = (
  pairs: readonly (readonly [HomeMapVec, HomeMapVec])[],
  run: readonly number[],
  horizontal: boolean,
): number => {
  let length = 0;
  let sum = 0;
  for (const index of run) {
    const [a, b] = pairs[index] ?? [];
    if (!a || !b) continue;
    const size = Math.hypot(b.x - a.x, b.y - a.y);
    length += size;
    sum += size * (horizontal ? (a.y + b.y) / 2 : (a.x + b.x) / 2);
  }
  return sum / length;
};

export function snapRingToAxes(ring: HomeMapRingShape): HomeMapRingShape {
  const pairs = ringPairs(ring);
  const axes = pairs.map(([a, b]) => axisOf(a, b));
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  for (const run of runsOf(axes)) {
    const horizontal = axes[run[0] ?? 0] === 'h';
    const value = runCoordinate(pairs, run, horizontal);
    const target = horizontal ? ys : xs;
    for (const index of run) {
      target[index] = value;
      target[(index + 1) % ring.length] = value;
    }
  }
  return ring.map((_, index) => ({ x: xs[index] ?? 0, y: ys[index] ?? 0 }));
}

const collinear = (a: HomeMapVec, b: HomeMapVec, c: HomeMapVec): boolean =>
  Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) <=
  COLLINEAR * Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);

export function cleanRing(ring: HomeMapRingShape): HomeMapRingShape {
  let points = ring.filter(
    (point, index) =>
      index === 0 || point.x !== ring[index - 1]?.x || point.y !== ring[index - 1]?.y,
  );
  for (;;) {
    const count = points.length;
    const kept = points.filter((point, index) => {
      const before = points[(index + count - 1) % count];
      const after = points[(index + 1) % count];
      return !before || !after || !collinear(before, point, after);
    });
    if (kept.length === count) return kept;
    points = kept;
  }
}

const usable = (ring: HomeMapRingShape): boolean =>
  ring.length >= 3 && homeMapRingArea(ring) > MIN_RING_AREA;

export function rectifyRing(transform: RectifyTransform, ring: HomeMapRingShape): HomeMapRingShape {
  return cleanRing(snapRingToAxes(ring.map((point) => rectifyPoint(transform, point))));
}

const doorKind = (kind: string): RectifyOpeningKind =>
  HOME_MAP_OPENING_KINDS.find((known) => known === kind) ?? 'opening';

const unit = (a: HomeMapVec, b: HomeMapVec): HomeMapVec | null => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length === 0 ? null : { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};

type SceneDoor = HomeMapSourceGeometry['doors'][number];

function openingOf(
  transform: RectifyTransform,
  door: SceneDoor,
  index: number,
  walls: readonly RectifiedWall[],
): RectifiedOpening | RectifySkip {
  const ref = `d${String(index)}`;
  const from = rectifyPoint(transform, door.from);
  const to = rectifyPoint(transform, door.to);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const heading = unit(from, to);
  const ranked = walls
    .flatMap((wall) => {
      const hit = homeMapProjectOnSegment(wall, mid);
      const wallHeading = unit(wall.from, wall.to);
      const aligned =
        heading !== null &&
        wallHeading !== null &&
        Math.abs(heading.x * wallHeading.x + heading.y * wallHeading.y) >= Math.SQRT1_2;
      return hit.distance <= RECTIFY_JOIN_MAX_GAP_M ? [{ wall, hit, aligned }] : [];
    })
    .sort((p, q) => Number(q.aligned) - Number(p.aligned) || p.hit.distance - q.hit.distance);
  const best = ranked[0];
  if (!best) return { kind: 'door', ref, reason: 'the door crosses no wall' };
  const start = homeMapProjectOnSegment(best.wall, from).offset;
  const end = homeMapProjectOnSegment(best.wall, to).offset;
  const width = Math.abs(end - start);
  if (width <= 0) return { kind: 'door', ref, reason: 'the door has no extent along its wall' };
  return {
    ref,
    wallRef: best.wall.ref,
    offset: Math.min(start, end),
    width,
    kind: doorKind(door.kind),
  };
}

const isSkip = (entry: RectifiedOpening | RectifySkip): entry is RectifySkip => 'reason' in entry;

const isOpening = (entry: RectifiedOpening | RectifySkip): entry is RectifiedOpening =>
  !isSkip(entry);

function roomsOf(
  transform: RectifyTransform,
  geometry: HomeMapSourceGeometry,
): { readonly rooms: RectifiedRoom[]; readonly skipped: RectifySkip[] } {
  const rooms: RectifiedRoom[] = [];
  const skipped: RectifySkip[] = [];
  for (const room of geometry.rooms) {
    const outer = rectifyRing(transform, room.ring);
    for (const _part of room.extraParts) {
      skipped.push({ kind: 'room_part', ref: room.ref, reason: 'a room keeps one outline' });
    }
    if (!usable(outer)) {
      skipped.push({ kind: 'room', ref: room.ref, reason: 'the outline collapsed' });
      continue;
    }
    rooms.push({
      ref: room.ref,
      name: room.name,
      polygon: {
        outer,
        holes: room.holes.map((hole) => rectifyRing(transform, hole)).filter(usable),
      },
      labelAt: rectifyPoint(transform, room.labelAt),
      floorCode: room.floorCode,
    });
  }
  return { rooms, skipped };
}

function wallsOf(rooms: readonly RectifiedRoom[]): readonly RectifiedWall[] {
  return homeMapWallsFromRings(
    rooms.map((room) => room.polygon),
    { maxGap: RECTIFY_JOIN_MAX_GAP_M, ...HOME_MAP_WALL_THICKNESS },
  ).map((wall, index) => ({
    ref: `w${String(index)}`,
    from: wall.from,
    to: wall.to,
    thickness: wall.thickness,
    kind: 'solid',
  }));
}

const collapsedOutlines = (
  kind: 'carpet' | 'furniture',
  rings: readonly HomeMapRingShape[],
): readonly RectifySkip[] =>
  rings.flatMap((ring, index) =>
    usable(ring)
      ? []
      : [{ kind, ref: `${kind}:${String(index)}`, reason: 'the outline collapsed' }],
  );

export function rectifyScene(
  geometry: HomeMapSourceGeometry,
  transform: RectifyTransform,
): RectifiedScene {
  const { rooms, skipped } = roomsOf(transform, geometry);
  const walls = wallsOf(rooms);
  const doors = geometry.doors.map((door, index) => openingOf(transform, door, index, walls));
  const carpets = geometry.carpets.map((ring) => rectifyRing(transform, ring));
  const furniture = geometry.furniture.map((item) => ({
    ...item,
    ring: rectifyRing(transform, item.ring),
  }));
  const dock = geometry.dock;
  return {
    rooms,
    walls,
    openings: doors.filter(isOpening),
    carpets: carpets.filter(usable),
    furniture: furniture.filter((item) => usable(item.ring)),
    dock: dock
      ? { at: rectifyPoint(transform, dock), yawDeg: rectifyYawDeg(transform, dock.yaw) }
      : null,
    skipped: [
      ...skipped,
      ...doors.filter(isSkip),
      ...collapsedOutlines('carpet', carpets),
      ...collapsedOutlines(
        'furniture',
        furniture.map((item) => item.ring),
      ),
    ],
  };
}
