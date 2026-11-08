import type {
  VacuumPoint,
  VacuumPose,
  VacuumRoom,
  VacuumScene,
  VacuumTrailRun,
} from '@smarteverything/domain';
import type { Route, RoutePoint } from './route';

const MILLIMETRES_PER_METRE = 1000;
const MILLIRADIANS_PER_RADIAN = 1000;

export const TRAIL_GAP_MILLIMETRES = 500;

interface OpenRun {
  readonly mopping: boolean;
  readonly points: readonly RoutePoint[];
}

function isMopping(point: RoutePoint): boolean {
  return point.mode !== 'sweep';
}

function distance(a: RoutePoint, b: RoutePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toMetres(point: RoutePoint): VacuumPoint {
  return { x: point.x / MILLIMETRES_PER_METRE, y: point.y / MILLIMETRES_PER_METRE };
}

function startRun(point: RoutePoint): OpenRun {
  return { mopping: isMopping(point), points: [point] };
}

function continueRun(run: OpenRun, point: RoutePoint): OpenRun {
  return { mopping: run.mopping, points: [...run.points, point] };
}

function changesMode(run: OpenRun, point: RoutePoint): boolean {
  return isMopping(point) !== run.mopping;
}

function startsNewPolyline(previous: RoutePoint, point: RoutePoint): boolean {
  return !point.penDown || distance(previous, point) > TRAIL_GAP_MILLIMETRES;
}

function closeRun(run: OpenRun): VacuumTrailRun {
  return { mopping: run.mopping, points: run.points.map(toMetres) };
}

interface TrailState {
  readonly closed: readonly OpenRun[];
  readonly open: OpenRun | null;
}

function advance(state: TrailState, point: RoutePoint): TrailState {
  const run = state.open;
  const previous = run?.points[run.points.length - 1];
  if (run === null || previous === undefined || startsNewPolyline(previous, point)) {
    return { closed: run === null ? state.closed : [...state.closed, run], open: startRun(point) };
  }
  if (changesMode(run, point)) {
    return {
      closed: [...state.closed, run],
      open: { mopping: isMopping(point), points: [previous, point] },
    };
  }
  return { closed: state.closed, open: continueRun(run, point) };
}

export function buildTrail(route: Route | null): VacuumTrailRun[] {
  if (route === null) return [];
  const { closed, open } = route.points.reduce<TrailState>(advance, { closed: [], open: null });
  const runs = open === null ? closed : [...closed, open];
  return runs.filter((run) => run.points.length > 1).map(closeRun);
}

export function routePose(route: Route | null, known: VacuumPose | null): VacuumPose | null {
  const last = route?.points[route.points.length - 1];
  if (last === undefined) return known;
  const yaw = last.yaw === null ? (known?.yaw ?? 0) : last.yaw / MILLIRADIANS_PER_RADIAN;
  return { ...toMetres(last), yaw };
}

export function applyRoute(scene: VacuumScene, route: Route | null): VacuumScene {
  if (route === null) return scene;
  return { ...scene, robot: routePose(route, scene.robot), trail: buildTrail(route) };
}

function crossings(point: VacuumPoint, ring: readonly VacuumPoint[]): number {
  return ring.reduce((count, from, index) => {
    const to = ring[(index + 1) % ring.length];
    if (to === undefined || from.y > point.y === to.y > point.y) return count;
    const meets = ((to.x - from.x) * (point.y - from.y)) / (to.y - from.y) + from.x;
    return point.x < meets ? count + 1 : count;
  }, 0);
}

function roomHolds(room: VacuumRoom, point: VacuumPoint): boolean {
  const total = room.rings.reduce((sum, ring) => sum + crossings(point, ring), 0);
  return total % 2 === 1;
}

export function roomAt(rooms: readonly VacuumRoom[], point: VacuumPoint | null): number | null {
  if (point === null) return null;
  return rooms.find((room) => roomHolds(room, point))?.id ?? null;
}

export function currentRoomId(scene: Pick<VacuumScene, 'rooms' | 'robot'>): number | null {
  return roomAt(scene.rooms, scene.robot);
}
