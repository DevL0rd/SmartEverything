import { z } from 'zod';
import { MapBlobError } from '../errors';
import { PATH_POINT, stage, type MapPaths, type PathPoint } from './map-document';

export const ROUTE_ACTION = { siid: 2, aiid: 47, piid: 24 } as const;

export const ROUTE_DELTA = z.object({
  points: z.array(PATH_POINT.extend({ pose_id: z.number().int() })),
});

const NO_POINTS = 'NULL';

export type RouteMode = 'sweep' | 'mop' | 'both';

export interface RoutePoint {
  readonly poseId: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number | null;
  readonly penDown: boolean;
  readonly mode: RouteMode;
}

export interface Route {
  readonly cursor: number;
  readonly points: readonly RoutePoint[];
}

export interface RouteMerge {
  readonly route: Route;
  readonly appended: number;
  readonly gap: boolean;
}

export interface ActionOutput {
  readonly piid: number;
  readonly value: unknown;
}

const MODES: Readonly<Record<number, RouteMode>> = { 1: 'sweep', 2: 'mop', 3: 'both' };
const DEFAULT_MODE = 1;
const PEN_UP = 0;
const PEN_DOWN = 1;

function decodePoint(point: PathPoint, poseId: number): RoutePoint {
  if (point.type !== PEN_UP && point.type !== PEN_DOWN) {
    throw new MapBlobError('route point', 'type 0 or 1', `type ${String(point.type)}`);
  }
  const code = point.sweep_mop_mode ?? DEFAULT_MODE;
  const mode = MODES[code];
  if (mode === undefined) {
    throw new MapBlobError('route point', 'sweep_mop_mode 1, 2 or 3', `mode ${String(code)}`);
  }
  return {
    poseId,
    x: point.x,
    y: point.y,
    yaw: point.yaw ?? null,
    penDown: point.type === PEN_DOWN,
    mode,
  };
}

export function decodeMapRoute(paths: MapPaths | undefined): Route | null {
  if (paths === undefined) return null;
  const first = paths.pose_id - paths.points.length;
  return {
    cursor: paths.pose_id,
    points: paths.points.map((point, index) => decodePoint(point, first + index)),
  };
}

export function routeDeltaInput(poseId: number): readonly ActionOutput[] {
  return [{ piid: ROUTE_ACTION.piid, value: JSON.stringify({ pose_id: poseId }) }];
}

export function parseRouteDelta(outputs: readonly ActionOutput[]): readonly RoutePoint[] {
  const output = outputs.find((item) => item.piid === ROUTE_ACTION.piid);
  if (output === undefined) return [];
  if (typeof output.value !== 'string') {
    throw new MapBlobError('route delta output', 'a JSON string', typeof output.value);
  }
  if (output.value === NO_POINTS) return [];
  const delta = parseDelta(output.value);
  return delta.points
    .toSorted((a, b) => a.pose_id - b.pose_id)
    .map((point) => decodePoint(point, point.pose_id));
}

function parseDelta(text: string): z.infer<typeof ROUTE_DELTA> {
  return stage('route delta', '{"points":[{"pose_id","x","y","type"}]} as JSON text', () =>
    ROUTE_DELTA.parse(JSON.parse(text)),
  );
}

export function mergeRouteDelta(route: Route, delta: readonly RoutePoint[]): RouteMerge {
  const fresh = delta.filter((point) => point.poseId >= route.cursor);
  const next = fresh[0];
  if (next === undefined) return { route, appended: 0, gap: false };
  if (next.poseId !== route.cursor) return { route, appended: 0, gap: true };
  const last = fresh[fresh.length - 1];
  return {
    route: { cursor: (last?.poseId ?? route.cursor - 1) + 1, points: [...route.points, ...fresh] },
    appended: fresh.length,
    gap: false,
  };
}
