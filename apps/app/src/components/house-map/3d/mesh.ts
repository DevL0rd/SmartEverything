import { ShapeUtils, Vector2 } from 'three';
import type { RenderPoint } from '../render-scene';

export type Rgb = readonly [number, number, number];

export type Vec3 = readonly [number, number, number];

export const LAYER_IDS = [
  'floor',
  'walls',
  'carpets',
  'no-go',
  'no-mop',
  'virtual-walls',
  'dock',
  'trail-sweep',
  'trail-mop',
  'robot-body',
  'robot-turret',
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export interface MeshLayer {
  readonly id: LayerId;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colours: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly opacity: number;
  readonly triangles: number;
}

export interface Collector {
  readonly positions: number[];
  readonly normals: number[];
  readonly colours: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

export interface FlatStyle {
  readonly y: number;
  readonly colour: Rgb;
}

export interface PrismStyle {
  readonly base: number;
  readonly height: number;
  readonly colour: Rgb;
  readonly top?: Rgb;
}

const UP: Vec3 = [0, 1, 0];

const UV_PER_METRE = 2;

const MINIMUM_RING_POINTS = 3;

const TRIANGLE_CORNERS = 3;

const COINCIDENT_METRES = 1e-6;

export function createCollector(): Collector {
  return { positions: [], normals: [], colours: [], uvs: [], indices: [] };
}

export function triangleCount(collector: Collector): number {
  return collector.indices.length / 3;
}

export function groundPosition(point: RenderPoint, height: number): Vec3 {
  return [point.x, height, -point.y];
}

function pushVertex(collector: Collector, position: Vec3, normal: Vec3, colour: Rgb): number {
  const index = collector.positions.length / 3;
  collector.positions.push(...position);
  collector.normals.push(...normal);
  collector.colours.push(...colour);
  collector.uvs.push(position[0] * UV_PER_METRE, position[2] * UV_PER_METRE);
  return index;
}

export function signedArea(ring: readonly RenderPoint[]): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    return sum + (point.x * next.y - next.x * point.y) / 2;
  }, 0);
}

export function cleanRing(ring: readonly RenderPoint[]): readonly RenderPoint[] {
  const kept = ring.filter((point, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    return (
      previous === undefined ||
      Math.hypot(point.x - previous.x, point.y - previous.y) > COINCIDENT_METRES
    );
  });
  return kept.length < MINIMUM_RING_POINTS ? [] : kept;
}

export function counterClockwise(ring: readonly RenderPoint[]): readonly RenderPoint[] {
  const cleaned = cleanRing(ring);
  return signedArea(cleaned) < 0 ? [...cleaned].reverse() : cleaned;
}

function faceArea(ring: readonly RenderPoint[], face: readonly number[]): number {
  const corners = face.flatMap((index) => {
    const corner = ring[index];
    return corner === undefined ? [] : [corner];
  });
  return corners.length === TRIANGLE_CORNERS ? signedArea(corners) : 0;
}

export function addFlat(
  collector: Collector,
  ring: readonly RenderPoint[],
  style: FlatStyle,
): void {
  const outline = counterClockwise(ring);
  if (outline.length < MINIMUM_RING_POINTS) return;
  const first = collector.positions.length / 3;
  for (const point of outline) {
    pushVertex(collector, groundPosition(point, style.y), UP, style.colour);
  }
  for (const face of ShapeUtils.triangulateShape(
    outline.map((point) => new Vector2(point.x, point.y)),
    [],
  )) {
    const [a = 0, b = 0, c = 0] = face;
    const ordered = faceArea(outline, face) < 0 ? [a, c, b] : [a, b, c];
    collector.indices.push(...ordered.map((index) => first + index));
  }
}

export function addPolygonFlat(
  collector: Collector,
  polygon: {
    readonly outer: readonly RenderPoint[];
    readonly holes: readonly (readonly RenderPoint[])[];
  },
  style: FlatStyle,
): void {
  const outline = counterClockwise(polygon.outer);
  if (outline.length < MINIMUM_RING_POINTS) return;
  const holes = polygon.holes.map(cleanRing).filter((hole) => hole.length >= MINIMUM_RING_POINTS);
  const corners = [...outline, ...holes.flat()];
  const first = collector.positions.length / 3;
  for (const point of corners) {
    pushVertex(collector, groundPosition(point, style.y), UP, style.colour);
  }
  const vector = (point: RenderPoint): Vector2 => new Vector2(point.x, point.y);
  for (const face of ShapeUtils.triangulateShape(
    outline.map(vector),
    holes.map((hole) => hole.map(vector)),
  )) {
    const [a = 0, b = 0, c = 0] = face;
    const ordered = faceArea(corners, face) < 0 ? [a, c, b] : [a, b, c];
    collector.indices.push(...ordered.map((index) => first + index));
  }
}

export function addSide(
  collector: Collector,
  edge: readonly [RenderPoint, RenderPoint],
  style: PrismStyle,
): void {
  const [from, to] = edge;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return;
  const normal: Vec3 = [(to.y - from.y) / length, 0, (to.x - from.x) / length];
  const top = style.base + style.height;
  const first = pushVertex(collector, groundPosition(from, style.base), normal, style.colour);
  pushVertex(collector, groundPosition(to, style.base), normal, style.colour);
  pushVertex(collector, groundPosition(to, top), normal, style.colour);
  pushVertex(collector, groundPosition(from, top), normal, style.colour);
  collector.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

export function addPrism(
  collector: Collector,
  ring: readonly RenderPoint[],
  style: PrismStyle,
): void {
  const outline = counterClockwise(ring);
  if (outline.length < MINIMUM_RING_POINTS) return;
  addFlat(collector, outline, { y: style.base + style.height, colour: style.top ?? style.colour });
  outline.forEach((from, index) => {
    addSide(collector, [from, outline[(index + 1) % outline.length] ?? from], style);
  });
}

export function finishLayer(id: LayerId, collector: Collector, opacity: number): MeshLayer | null {
  if (collector.indices.length === 0) return null;
  return {
    id,
    positions: Float32Array.from(collector.positions),
    normals: Float32Array.from(collector.normals),
    colours: Float32Array.from(collector.colours),
    uvs: Float32Array.from(collector.uvs),
    indices: Uint32Array.from(collector.indices),
    opacity,
    triangles: triangleCount(collector),
  };
}

export function segmentRing(
  from: RenderPoint,
  to: RenderPoint,
  halfWidth: number,
): readonly RenderPoint[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return [];
  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const start = { x: from.x - along.x * halfWidth, y: from.y - along.y * halfWidth };
  const end = { x: to.x + along.x * halfWidth, y: to.y + along.y * halfWidth };
  const side = { x: -along.y * halfWidth, y: along.x * halfWidth };
  return [
    { x: start.x - side.x, y: start.y - side.y },
    { x: end.x - side.x, y: end.y - side.y },
    { x: end.x + side.x, y: end.y + side.y },
    { x: start.x + side.x, y: start.y + side.y },
  ];
}
