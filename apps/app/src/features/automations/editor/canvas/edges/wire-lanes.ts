import { appendTo } from '@smarteverything/domain';
import {
  WIRE_CLEAR,
  wireCrossings,
  wireHits,
  wireOverlaps,
  type RoutePoint,
  type WireBox,
  type WirePoints,
} from './exec-route';

export interface LaneWire {
  readonly id: string;
  readonly points: WirePoints;
  readonly around: readonly WireBox[];
  readonly bundle: string;
}

interface Leg {
  readonly wire: number;
  readonly at: number;
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly lo: number;
  readonly hi: number;
}

interface Lane {
  readonly legs: readonly Leg[];
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly lo: number;
  readonly hi: number;
  readonly start: number;
}

interface Span {
  readonly lo: number;
  readonly hi: number;
}

function overlaps(top: number, bottom: number, box: WireBox): boolean {
  return box.y < bottom && top < box.y + box.h;
}

type Quad = readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint];

function legQuad(points: WirePoints, at: number): Quad | undefined {
  const [before, from, to, after] = points.slice(at - 1, at + 3);
  if (at < 1 || before === undefined || from === undefined || to === undefined) return undefined;
  if (after === undefined || from.x !== to.x || from.y === to.y) return undefined;
  return before.x === from.x || after.x === from.x ? undefined : [before, from, to, after];
}

function sideRoom(x: number, ends: readonly RoutePoint[]): Span {
  const left = ends.filter((end) => end.x < x).map((end) => end.x + WIRE_CLEAR);
  const right = ends.filter((end) => end.x > x).map((end) => end.x - WIRE_CLEAR);
  return { lo: Math.max(-Infinity, ...left), hi: Math.min(Infinity, ...right) };
}

function roomOf(x: number, start: Span, around: readonly WireBox[]): Span | undefined {
  let { lo, hi } = start;
  for (const box of around) {
    if (box.x + box.w <= x) lo = Math.max(lo, box.x + box.w + WIRE_CLEAR);
    else if (box.x >= x) hi = Math.min(hi, box.x - WIRE_CLEAR);
    else return undefined;
  }
  return { lo, hi };
}

function legAt(
  points: WirePoints,
  at: number,
  wire: number,
  boxes: readonly WireBox[],
): Leg | undefined {
  const quad = legQuad(points, at);
  if (quad === undefined) return undefined;
  const [before, from, to, after] = quad;
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);
  const start = sideRoom(from.x, [before, after]);
  const level = boxes.filter((box) => overlaps(top, bottom, box));
  const room = roomOf(from.x, start, level);
  return room === undefined ? undefined : { wire, at, x: from.x, top, bottom, ...room };
}

function legsOf(wires: readonly LaneWire[], boxes: readonly WireBox[]): readonly Leg[] {
  return wires.flatMap((wire, index) =>
    wire.points.flatMap((_, at) => legAt(wire.points, at, index, boxes) ?? []),
  );
}

function lanesOf(wires: readonly LaneWire[], legs: readonly Leg[]): readonly Lane[] {
  const lanes = new Map<string, Leg[]>();
  for (const leg of legs) {
    const key = `${wires[leg.wire]?.bundle ?? String(leg.wire)}@${String(leg.x)}`;
    appendTo(lanes, key, leg);
  }
  return [...lanes.values()].map((group) => ({
    legs: group,
    x: group[0]?.x ?? 0,
    top: Math.min(...group.map((leg) => leg.top)),
    bottom: Math.max(...group.map((leg) => leg.bottom)),
    lo: Math.max(...group.map((leg) => leg.lo)),
    hi: Math.min(...group.map((leg) => leg.hi)),
    start: Math.min(...group.map((leg) => wires[leg.wire]?.points[leg.at]?.y ?? leg.top)),
  }));
}

function near(a: Lane, b: Lane): boolean {
  return Math.abs(a.x - b.x) < WIRE_CLEAR && a.top < b.bottom && b.top < a.bottom;
}

function groupsOf(lanes: readonly Lane[]): readonly (readonly Lane[])[] {
  const groups: Lane[][] = [];
  for (const lane of lanes) {
    const joined = groups.filter((group) => group.some((other) => near(lane, other)));
    const merged = [...joined.flat(), lane];
    groups.splice(0, groups.length, ...groups.filter((group) => !joined.includes(group)), merged);
  }
  return groups;
}

function blockedIn(group: readonly Lane[], values: readonly WireBox[]): readonly Span[] {
  const top = Math.min(...group.map((lane) => lane.top));
  const bottom = Math.max(...group.map((lane) => lane.bottom));
  return values
    .filter((box) => overlaps(top, bottom, box))
    .map((box) => ({ lo: box.x, hi: box.x + box.w }));
}

function freeSpans(room: Span, blocked: readonly Span[]): readonly Span[] {
  return blocked.reduce<readonly Span[]>(
    (spans, cut) =>
      spans.flatMap((span) =>
        [
          { lo: span.lo, hi: Math.min(span.hi, cut.lo) },
          { lo: Math.max(span.lo, cut.hi), hi: span.hi },
        ].filter((part) => part.lo <= part.hi && (part.lo < cut.lo || part.hi > cut.hi)),
      ),
    [room],
  );
}

function inside(x: number, span: Span): boolean {
  return span.lo <= x && x <= span.hi;
}

interface Spot {
  readonly span: Span;
  readonly anchor: number | undefined;
}

function spotFor(group: readonly Lane[], values: readonly WireBox[]): Spot | undefined {
  const room = {
    lo: Math.max(...group.map((lane) => lane.lo)),
    hi: Math.min(...group.map((lane) => lane.hi)),
  };
  if (room.lo > room.hi) return undefined;
  const blocked = blockedIn(group, values);
  const crowded = group.length > 1;
  if (!crowded && !blocked.some((span) => inside(group[0]?.x ?? 0, span))) return undefined;
  const free = freeSpans(room, blocked);
  const mean = group.reduce((sum, lane) => sum + lane.x, 0) / group.length;
  const anchor = Math.min(Math.max(mean, room.lo), room.hi);
  const home = free.find((span) => inside(anchor, span));
  if (home !== undefined) return { span: home, anchor };
  const widest = [...free].sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0];
  const span = widest ?? (crowded ? room : undefined);
  return span === undefined || !Number.isFinite(span.hi - span.lo)
    ? undefined
    : { span, anchor: undefined };
}

function placesFor(group: readonly Lane[], values: readonly WireBox[]): readonly number[] {
  const spot = spotFor(group, values);
  if (spot === undefined) return [];
  const { span, anchor } = spot;
  const gaps = group.length - 1;
  const pitch = gaps > 0 ? Math.min(WIRE_CLEAR, (span.hi - span.lo) / gaps) : 0;
  const width = pitch * gaps;
  const first =
    anchor === undefined
      ? span.lo + (span.hi - span.lo - width) / 2
      : Math.min(Math.max(anchor - width / 2, span.lo), span.hi - width);
  return group.map((_, index) => first + index * pitch);
}

type Order = (a: Lane, b: Lane) => number;

const ORDERS: readonly Order[] = [
  (a: Lane, b: Lane): number => a.x - b.x || a.start - b.start,
  (a: Lane, b: Lane): number => a.x - b.x || b.start - a.start,
  (a: Lane, b: Lane): number => a.x - b.x || a.bottom - b.bottom,
  (a: Lane, b: Lane): number => a.x - b.x || b.bottom - a.bottom,
];

function moved(
  wires: readonly LaneWire[],
  order: readonly Lane[],
  places: readonly number[],
): RoutePoint[][] {
  const next = wires.map((wire) => [...wire.points]);
  order.forEach((lane, index) => {
    const x = places[index] ?? lane.x;
    for (const leg of lane.legs) {
      const points = next[leg.wire];
      const from = points?.[leg.at];
      const to = points?.[leg.at + 1];
      if (points === undefined || from === undefined || to === undefined) continue;
      points[leg.at] = { x, y: from.y };
      points[leg.at + 1] = { x, y: to.y };
    }
  });
  return next;
}

function totalCrossings(wires: readonly LaneWire[], points: readonly WirePoints[]): number {
  return points.reduce(
    (sum, own, index) =>
      sum +
      points
        .slice(index + 1)
        .filter((_, offset) => wires[index + 1 + offset]?.bundle !== wires[index]?.bundle)
        .reduce(
          (count, other) => count + wireCrossings(own, [other]) + wireOverlaps(own, [other]),
          0,
        ),
    0,
  );
}

function clear(wires: readonly LaneWire[], points: readonly WirePoints[]): boolean {
  return points.every((own, index) => !wireHits(own, wires[index]?.around ?? []));
}

function spreadGroup(
  wires: readonly LaneWire[],
  current: readonly (readonly RoutePoint[])[],
  group: readonly Lane[],
  values: readonly WireBox[],
): readonly (readonly RoutePoint[])[] {
  const placed = wires.map((wire, index) => ({ ...wire, points: current[index] ?? wire.points }));
  const before = totalCrossings(placed, current);
  const tried = ORDERS.map((order) => {
    const lanes = [...group].sort(order);
    const places = placesFor(lanes, values);
    if (places.length === 0) return undefined;
    const points = moved(placed, lanes, places);
    return clear(placed, points)
      ? { points, crossings: totalCrossings(placed, points) }
      : undefined;
  }).filter((option) => option !== undefined);
  const best = tried.reduce<(typeof tried)[number] | undefined>(
    (found, option) => (found === undefined || option.crossings < found.crossings ? option : found),
    undefined,
  );
  return best === undefined || best.crossings > before ? current : best.points;
}

function spreadAxis(
  wires: readonly LaneWire[],
  boxes: readonly WireBox[],
  values: readonly WireBox[],
): readonly LaneWire[] {
  const groups = groupsOf(lanesOf(wires, legsOf(wires, boxes)));
  const points = groups.reduce<readonly (readonly RoutePoint[])[]>(
    (current, group) => spreadGroup(wires, current, group, values),
    wires.map((wire) => wire.points),
  );
  return wires.map((wire, index) => ({ ...wire, points: points[index] ?? wire.points }));
}

function flipPoint(point: RoutePoint): RoutePoint {
  return { x: point.y, y: point.x };
}

function flipBox(box: WireBox): WireBox {
  return { x: box.y, y: box.x, w: box.h, h: box.w };
}

function flipWire(wire: LaneWire): LaneWire {
  return { ...wire, points: wire.points.map(flipPoint), around: wire.around.map(flipBox) };
}

export function spreadLanes(
  wires: readonly LaneWire[],
  boxes: readonly WireBox[],
  values: readonly WireBox[],
): ReadonlyMap<string, WirePoints> {
  const level = spreadAxis(wires.map(flipWire), boxes.map(flipBox), []).map(flipWire);
  const upright = spreadAxis(level, boxes, values);
  return new Map(upright.map((wire) => [wire.id, wire.points]));
}
