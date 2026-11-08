import {
  homeMapDistance,
  homeMapPointInPolygon,
  homeMapPolygonArea,
  homeMapRingArea,
  type HomeMapRoom,
  type HomeMapSnapGuide,
  type HomeMapVec,
} from '@smarteverything/domain';
import type {
  EditGhost,
  EditOverlay,
  EditShape,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderBounds } from '../../../../components/house-map/render-scene';

export type DrawRing = readonly HomeMapVec[];

type EditHandle = EditOverlay['handles'][number];

type EditLabel = EditOverlay['labels'][number];

const EPS = 1e-9;

export const COLOUR_SLOT_COUNT = 8;

export const DRAFT_SHAPE_ID = 'room-draft';

export const WALL_LINE_TEXT = 'On wall line';

export const EXAMPLE_TEXT = 'Tap here';

export const EXAMPLE_ROOM_M = { width: 5, depth: 4 } as const;

export function rectRing(from: HomeMapVec, to: HomeMapVec): DrawRing {
  return [from, { x: to.x, y: from.y }, to, { x: from.x, y: to.y }];
}

const cross = (o: HomeMapVec, a: HomeMapVec, b: HomeMapVec): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsCross(a: HomeMapVec, b: HomeMapVec, c: HomeMapVec, d: HomeMapVec): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < -EPS && d3 * d4 < -EPS;
}

function edgeAt(ring: DrawRing, index: number): readonly [HomeMapVec, HomeMapVec] | null {
  const from = ring[index];
  const to = ring[(index + 1) % ring.length];
  return from === undefined || to === undefined ? null : [from, to];
}

function selfCrossing(ring: DrawRing): boolean {
  const count = ring.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue;
      const first = edgeAt(ring, i);
      const second = edgeAt(ring, j);
      if (first && second && segmentsCross(first[0], first[1], second[0], second[1])) return true;
    }
  }
  return false;
}

export function cleanRing(ring: DrawRing): DrawRing {
  return ring.filter((point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    return ring.length === 1 || homeMapDistance(point, next) > EPS;
  });
}

export function validRing(ring: DrawRing): boolean {
  return ring.length >= 3 && homeMapRingArea(ring) > EPS && !selfCrossing(ring);
}

function centroid(ring: DrawRing): HomeMapVec {
  let area = 0;
  let x = 0;
  let y = 0;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    const step = a.x * b.y - b.x * a.y;
    area += step;
    x += (a.x + b.x) * step;
    y += (a.y + b.y) * step;
  });
  return Math.abs(area) < EPS
    ? (ring[0] ?? { x: 0, y: 0 })
    : { x: x / (3 * area), y: y / (3 * area) };
}

function widestSpanMid(ring: DrawRing, y: number): HomeMapVec | null {
  const xs = ring
    .flatMap((a, index) => {
      const b = ring[(index + 1) % ring.length] ?? a;
      if (a.y > y === b.y > y) return [];
      return [a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)];
    })
    .sort((p, q) => p - q);
  let best: HomeMapVec | null = null;
  let width = 0;
  for (let index = 0; index + 1 < xs.length; index += 2) {
    const from = xs[index] ?? 0;
    const to = xs[index + 1] ?? 0;
    if (to - from > width) {
      width = to - from;
      best = { x: (from + to) / 2, y };
    }
  }
  return best;
}

export function labelPoint(ring: DrawRing): HomeMapVec {
  const middle = centroid(ring);
  if (homeMapPointInPolygon({ outer: ring, holes: [] }, middle)) return middle;
  return widestSpanMid(ring, middle.y) ?? middle;
}

export function nextColourSlot(rooms: readonly Pick<HomeMapRoom, 'colourSlot'>[]): number {
  const used = Array.from({ length: COLOUR_SLOT_COUNT }, (_, index) =>
    rooms.reduce((sum, room) => sum + (room.colourSlot === index + 1 ? 1 : 0), 0),
  );
  const fewest = Math.min(...used);
  return used.indexOf(fewest) + 1;
}

export interface EdgeLabel {
  readonly at: HomeMapVec;
  readonly metres: number;
}

export function edgeLabels(ring: DrawRing, closed: boolean): readonly EdgeLabel[] {
  const count = closed ? ring.length : ring.length - 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) => edgeAt(ring, index))
    .flatMap((edge) => (edge === null ? [] : [edge]))
    .map(([a, b]) => ({
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      metres: homeMapDistance(a, b),
    }))
    .filter((label) => label.metres > EPS);
}

export function metresText(metres: number): string {
  return `${metres.toFixed(2)} m`;
}

export function areaText(ring: DrawRing): string {
  return `${homeMapPolygonArea({ outer: ring, holes: [] }).toFixed(1)} m²`;
}

const onGround = (point: HomeMapVec): EditHandle['at'] => ({ x: point.x, y: point.y, height: 0 });

export interface DraftCorner {
  readonly index: number;
  readonly handle: EditHandle;
}

function corner(index: number, point: HomeMapVec, target: EditHandle['target']): DraftCorner {
  const handle: EditHandle = {
    id: `${DRAFT_SHAPE_ID}:${String(index)}`,
    kind: 'point',
    at: onGround(point),
    surface: { kind: 'ground' },
    target,
  };
  return { index, handle };
}

function lineCorners(points: DrawRing): readonly DraftCorner[] {
  return points.map((point, index) =>
    corner(index, point, {
      kind: 'line-end',
      lineId: DRAFT_SHAPE_ID,
      end: index === 0 && points.length > 1 ? 'from' : 'to',
    }),
  );
}

export function draftCorners(points: DrawRing): readonly DraftCorner[] {
  if (points.length < 3) return lineCorners(points);
  return points.map((point, index) =>
    corner(index, point, { kind: 'shape-corner', shapeId: DRAFT_SHAPE_ID, index }),
  );
}

export function draftShapes(points: DrawRing): readonly EditShape[] {
  const [first, second] = points;
  if (first === undefined) return [];
  if (points.length >= 3) return [{ kind: 'ring', id: DRAFT_SHAPE_ID, points: [...points] }];
  return [{ kind: 'line', id: DRAFT_SHAPE_ID, from: first, to: second ?? first }];
}

function path(shape: 'polyline' | 'polygon', points: DrawRing, tone: EditGhost['tone']): EditGhost {
  return { shape, points: points.map(onGround), tone };
}

function label(at: HomeMapVec, text: string, tone: EditLabel['tone']): EditLabel {
  return { at: onGround(at), text, tone };
}

export function draftGhosts(points: DrawRing): readonly EditGhost[] {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined || points.length < 2) return [];
  const placed = path('polyline', points, 'accent');
  if (points.length < 3) return [placed];
  return [path('polygon', points, 'neutral'), placed, path('polyline', [last, first], 'snap')];
}

export function draftLabels(points: DrawRing): readonly EditLabel[] {
  const sides = edgeLabels(points, false).map((side) =>
    label(side.at, metresText(side.metres), 'neutral'),
  );
  if (!validRing(points)) return sides;
  return [...sides, label(labelPoint(points), areaText(points), 'neutral')];
}

export function guideGhosts(guides: readonly HomeMapSnapGuide[]): readonly EditGhost[] {
  return guides.map((guide) => path('polyline', [guide.from, guide.to], 'snap'));
}

export function guideLabels(guides: readonly HomeMapSnapGuide[]): readonly EditLabel[] {
  return guides
    .filter((guide) => guide.kind === 'extension')
    .map((guide) => label(guide.to, WALL_LINE_TEXT, 'snap'));
}

export function exampleRing(bounds: RenderBounds): DrawRing {
  const x = (bounds.minX + bounds.maxX - EXAMPLE_ROOM_M.width) / 2;
  const y = (bounds.minY + bounds.maxY + EXAMPLE_ROOM_M.depth) / 2;
  return rectRing({ x, y }, { x: x + EXAMPLE_ROOM_M.width, y: y - EXAMPLE_ROOM_M.depth });
}

export interface ExampleMarks {
  readonly ghosts: readonly EditGhost[];
  readonly labels: readonly EditLabel[];
}

export function exampleMarks(bounds: RenderBounds): ExampleMarks {
  const ring = exampleRing(bounds);
  const [first] = ring;
  if (first === undefined) return { ghosts: [], labels: [] };
  const size = `${EXAMPLE_ROOM_M.width.toFixed(2)} × ${metresText(EXAMPLE_ROOM_M.depth)}`;
  return {
    ghosts: [path('polyline', [...ring, first], 'snap')],
    labels: [label(first, EXAMPLE_TEXT, 'snap'), label(labelPoint(ring), size, 'neutral')],
  };
}
