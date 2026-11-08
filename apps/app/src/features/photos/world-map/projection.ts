export const GRID_PER_DEGREE = 10;
export const WORLD_WIDTH = 360 * GRID_PER_DEGREE;
export const WORLD_HEIGHT = 180 * GRID_PER_DEGREE;

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export interface MapFit {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

const NORTH_EDGE = 84;
const SOUTH_EDGE = -58;

export const WORLD_VIEW: MapBox = {
  x: 0,
  y: (90 - NORTH_EDGE) * GRID_PER_DEGREE,
  width: WORLD_WIDTH,
  height: (NORTH_EDGE - SOUTH_EDGE) * GRID_PER_DEGREE,
};

export function project({ lat, lon }: GeoPoint): MapPoint {
  return { x: (lon + 180) * GRID_PER_DEGREE, y: (90 - lat) * GRID_PER_DEGREE };
}

export function viewBoxText({ x, y, width, height }: MapBox): string {
  return `${String(x)} ${String(y)} ${String(width)} ${String(height)}`;
}

export function fitOf(view: MapBox, frame: FrameSize): MapFit {
  const scale = Math.min(frame.width / view.width, frame.height / view.height);
  return {
    scale,
    dx: (frame.width - view.width * scale) / 2 - view.x * scale,
    dy: (frame.height - view.height * scale) / 2 - view.y * scale,
  };
}

export function placeOf(point: GeoPoint, fit: MapFit): MapPoint {
  const at = project(point);
  return { x: at.x * fit.scale + fit.dx, y: at.y * fit.scale + fit.dy };
}

export function viewAround(point: GeoPoint, spanDegrees: number, frame: FrameSize): MapBox {
  const centre = project(point);
  const width = spanDegrees * GRID_PER_DEGREE;
  const height = (width * frame.height) / frame.width;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

export type BoxEdges = readonly [number, number, number, number];

export function boxMeets(edges: BoxEdges, view: MapBox): boolean {
  const [left, top, right, bottom] = edges;
  return (
    right >= view.x &&
    left <= view.x + view.width &&
    bottom >= view.y &&
    top <= view.y + view.height
  );
}
