import type { RenderPoint } from '../render-scene';

export const WALL_STYLES = ['cutaway', 'low', 'full'] as const;

export type WallStyle = (typeof WALL_STYLES)[number];

export const CUT_HEIGHT_METRES = 0.3;

export const LOW_WALL_HEIGHT_METRES = 1.2;

export const CUT_ENTER_FACING = 0.3;

export const CUT_EXIT_FACING = 0.2;

export const OVERHEAD_ENTER_POLAR = 0.35;

export const OVERHEAD_EXIT_POLAR = 0.45;

const PROBE_METRES = 0.2;

export interface WallSpan {
  readonly wallId: string;
  readonly firstVertex: number;
  readonly vertexCount: number;
  readonly base: number;
  readonly normal: RenderPoint;
  readonly roomOnNormalSide: boolean;
  readonly roomOnOtherSide: boolean;
}

export interface CutView {
  readonly azimuth: number;
  readonly polar: number;
}

export type InsideRoom = (point: RenderPoint) => boolean;

export interface WallLine {
  readonly from: RenderPoint;
  readonly to: RenderPoint;
}

export function wallNormal(wall: WallLine): RenderPoint | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length === 0) return null;
  return { x: -(wall.to.y - wall.from.y) / length, y: (wall.to.x - wall.from.x) / length };
}

export function roomSides(
  insideRoom: InsideRoom,
  wall: WallLine,
): { readonly normalSide: boolean; readonly otherSide: boolean } {
  const normal = wallNormal(wall);
  if (normal === null) return { normalSide: false, otherSide: false };
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const along = { x: normal.y, y: -normal.x };
  const stations = [-PROBE_METRES, length / 2, length + PROBE_METRES];
  const roomOnSide = (sign: number): boolean =>
    stations.some((station) =>
      insideRoom({
        x: wall.from.x + along.x * station + normal.x * PROBE_METRES * sign,
        y: wall.from.y + along.y * station + normal.y * PROBE_METRES * sign,
      }),
    );
  return { normalSide: roomOnSide(1), otherSide: roomOnSide(-1) };
}

export function wallSpan(
  wall: WallLine & { readonly id: string },
  sides: { readonly normalSide: boolean; readonly otherSide: boolean },
  vertices: { readonly first: number; readonly count: number; readonly base: number },
): WallSpan | null {
  const normal = wallNormal(wall);
  if (normal === null || vertices.count === 0) return null;
  return {
    wallId: wall.id,
    firstVertex: vertices.first,
    vertexCount: vertices.count,
    base: vertices.base,
    normal,
    roomOnNormalSide: sides.normalSide,
    roomOnOtherSide: sides.otherSide,
  };
}

export const wallStyleCuts = (style: WallStyle): boolean => style !== 'full';

export const styledWallHeight = (style: WallStyle, height: number, lowHeight: number): number =>
  style === 'low' ? Math.min(height, lowHeight) : height;

export function viewDirection(view: CutView): RenderPoint {
  const lean = Math.sin(view.polar);
  return { x: -Math.sin(view.azimuth) * lean, y: Math.cos(view.azimuth) * lean };
}

function hidesRoom(span: WallSpan, view: RenderPoint, threshold: number): boolean {
  const facing = span.normal.x * view.x + span.normal.y * view.y;
  return (
    (span.roomOnNormalSide && facing > threshold) || (span.roomOnOtherSide && -facing > threshold)
  );
}

export function cutWalls(
  spans: readonly WallSpan[],
  view: CutView,
  previous: readonly boolean[],
  full: ReadonlySet<string>,
): readonly boolean[] {
  const direction = viewDirection(view);
  return spans.map((span, index) => {
    if (full.has(span.wallId)) return false;
    const wasCut = previous[index] === true;
    const overhead = view.polar < (wasCut ? OVERHEAD_EXIT_POLAR : OVERHEAD_ENTER_POLAR);
    return overhead || hidesRoom(span, direction, wasCut ? CUT_EXIT_FACING : CUT_ENTER_FACING);
  });
}

export function sameCut(left: readonly boolean[], right: readonly boolean[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function cutPositions(
  source: Float32Array,
  spans: readonly WallSpan[],
  cut: { readonly walls: readonly boolean[]; readonly height: number },
): Float32Array {
  const positions = Float32Array.from(source);
  spans.forEach((span, index) => {
    if (cut.walls[index] !== true) return;
    const anchor = span.firstVertex * 3;
    const gone = span.base >= cut.height;
    for (let vertex = span.firstVertex; vertex < span.firstVertex + span.vertexCount; vertex += 1) {
      const at = vertex * 3;
      positions[at] = gone ? Number(source[anchor]) : Number(source[at]);
      positions[at + 1] = gone ? 0 : Math.min(Number(source[at + 1]), cut.height);
      positions[at + 2] = gone ? Number(source[anchor + 2]) : Number(source[at + 2]);
    }
  });
  return positions;
}
