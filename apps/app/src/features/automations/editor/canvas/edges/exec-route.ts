export interface WireBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface WireEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

export const WIRE_SIDE = 10;
export const WIRE_CLEAR = 16;

function across(y: number, from: number, to: number, box: WireBox): boolean {
  const left = Math.min(from, to);
  const right = Math.max(from, to);
  return box.y < y && y < box.y + box.h && box.x < right && left < box.x + box.w;
}

function down(x: number, from: number, to: number, box: WireBox): boolean {
  const top = Math.min(from, to);
  const bottom = Math.max(from, to);
  return box.x < x && x < box.x + box.w && box.y < bottom && top < box.y + box.h;
}

export function wireHits(points: readonly RoutePoint[], around: readonly WireBox[]): boolean {
  return points.slice(1).some((point, index) => {
    const from = points[index] ?? point;
    return around.some((box) =>
      from.y === point.y
        ? across(point.y, from.x, point.x, box)
        : down(point.x, from.y, point.y, box),
    );
  });
}

export function cleaned(points: readonly RoutePoint[]): readonly RoutePoint[] {
  const distinct = points.filter((point, index) => {
    const before = points[index - 1];
    return !(before?.x === point.x && before.y === point.y);
  });
  return distinct.filter((point, index) => {
    const before = distinct[index - 1];
    const after = distinct[index + 1];
    if (before === undefined || after === undefined) return true;
    const level = before.y === point.y && point.y === after.y;
    const plumb = before.x === point.x && point.x === after.x;
    return !level && !plumb;
  });
}

export function plainLegs(ends: WireEnds): readonly RoutePoint[] {
  const { sourceX, sourceY, targetX, targetY } = ends;
  const middle = (sourceX + targetX) / 2;
  return [
    { x: sourceX, y: sourceY },
    { x: middle, y: sourceY },
    { x: middle, y: targetY },
    { x: targetX, y: targetY },
  ];
}

function channelLegs(ends: WireEnds, channel: number): readonly RoutePoint[] {
  const { sourceX, sourceY, targetX, targetY } = ends;
  const out = sourceX + WIRE_SIDE;
  const back = targetX - WIRE_SIDE;
  return [
    { x: sourceX, y: sourceY },
    { x: out, y: sourceY },
    { x: out, y: channel },
    { x: back, y: channel },
    { x: back, y: targetY },
    { x: targetX, y: targetY },
  ];
}

function channelsOf(ends: WireEnds, around: readonly WireBox[]): readonly number[] {
  const edges = around.flatMap((box) => [box.y - WIRE_CLEAR, box.y + box.h + WIRE_CLEAR]);
  const cost = (y: number): number => Math.abs(y - ends.sourceY) + Math.abs(y - ends.targetY);
  return [ends.sourceY, ends.targetY, ...edges].sort((a, b) => cost(a) - cost(b) || a - b);
}

export interface WireRoute {
  readonly points: readonly RoutePoint[];
  readonly label: RoutePoint;
}

export type WirePoints = readonly RoutePoint[];

function between(value: number, from: number, to: number): boolean {
  return Math.min(from, to) < value && value < Math.max(from, to);
}

function spansOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.max(Math.min(...a), Math.min(...b)) < Math.min(Math.max(...a), Math.max(...b));
}

function segmentsShare(
  a: readonly [RoutePoint, RoutePoint],
  b: readonly [RoutePoint, RoutePoint],
  level: boolean,
): boolean {
  if (level) return a[0].y === b[0].y && spansOverlap([a[0].x, a[1].x], [b[0].x, b[1].x]);
  return a[0].x === b[0].x && spansOverlap([a[0].y, a[1].y], [b[0].y, b[1].y]);
}

function segmentsCross(
  a: readonly [RoutePoint, RoutePoint],
  b: readonly [RoutePoint, RoutePoint],
): boolean {
  const aLevel = a[0].y === a[1].y;
  if (aLevel === (b[0].y === b[1].y)) return false;
  const [level, plumb] = aLevel ? [a, b] : [b, a];
  return between(plumb[0].x, level[0].x, level[1].x) && between(level[0].y, plumb[0].y, plumb[1].y);
}

function segmentsOf(points: WirePoints): readonly (readonly [RoutePoint, RoutePoint])[] {
  return points.slice(1).map((point, index) => [points[index] ?? point, point] as const);
}

export function wireOverlaps(points: WirePoints, wires: readonly WirePoints[]): number {
  const own = segmentsOf(points);
  return wires
    .flatMap(segmentsOf)
    .reduce(
      (count, other) =>
        count +
        own.filter(
          (leg) =>
            (leg[0].y === leg[1].y) === (other[0].y === other[1].y) &&
            segmentsShare(leg, other, leg[0].y === leg[1].y),
        ).length,
      0,
    );
}

export function wireCrossings(points: WirePoints, wires: readonly WirePoints[]): number {
  const own = segmentsOf(points);
  return wires
    .flatMap(segmentsOf)
    .reduce((count, other) => count + own.filter((leg) => segmentsCross(leg, other)).length, 0);
}

function fewestCrossings(
  routes: readonly WirePoints[],
  wires: readonly WirePoints[],
): WirePoints | undefined {
  const scored = routes.map((points) => ({ points, crossings: wireCrossings(points, wires) }));
  return scored.reduce<(typeof scored)[number] | undefined>(
    (best, next) => (best === undefined || next.crossings < best.crossings ? next : best),
    undefined,
  )?.points;
}

export function routeAround(
  ends: WireEnds,
  around: readonly WireBox[],
  wires: readonly WirePoints[] = [],
): WireRoute | undefined {
  if (ends.targetX - ends.sourceX < WIRE_SIDE * 2) return undefined;
  const plain = plainLegs(ends);
  const channels = channelsOf(ends, around).map((y) => channelLegs(ends, y));
  const clear = [plain, ...channels].filter((points) => !wireHits(points, around));
  const best = fewestCrossings(clear, wires);
  if (best === undefined || best === plain) return undefined;
  const label = { x: (ends.sourceX + ends.targetX) / 2, y: best[2]?.y ?? ends.sourceY };
  return { points: best, label };
}

export function boxesAround(
  boxes: readonly (WireBox & { readonly id: string })[],
  sourceId: string,
  targetId: string,
): readonly WireBox[] {
  const source = boxes.find((box) => box.id === sourceId);
  const target = boxes.find((box) => box.id === targetId);
  if (source === undefined || target === undefined) return [];
  const left = source.x + source.w;
  return boxes
    .filter((box) => box.id !== sourceId && box.id !== targetId)
    .filter((box) => box.x < target.x && box.x + box.w > left)
    .map(({ x, y, w, h }) => ({ x, y, w, h }));
}
