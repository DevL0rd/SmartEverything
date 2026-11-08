import type { VacuumPoint, VacuumTrailRun } from '@smarteverything/domain';
import type { ShownTrail } from '../../../../components/house-map/3d/map-3d-protocol';

export type { ShownTrail };

export interface LivePosePoint extends VacuumPoint {
  readonly cursor: number;
}

export interface LiveTrail {
  readonly base: readonly VacuumTrailRun[];
  readonly anchor: number;
  readonly cursor: number;
  readonly cleared: boolean;
  readonly points: readonly LivePosePoint[];
}

const NO_CURSOR = -1;

const NO_RUNS: readonly VacuumTrailRun[] = [];

export function startLiveTrail(
  base: readonly VacuumTrailRun[],
  latest: LivePosePoint | null,
): LiveTrail {
  const cursor = latest?.cursor ?? NO_CURSOR;
  return { base, anchor: cursor, cursor, cleared: false, points: [] };
}

export function rebaseLiveTrail(trail: LiveTrail, base: readonly VacuumTrailRun[]): LiveTrail {
  return trail.base === base
    ? trail
    : { base, anchor: trail.cursor, cursor: trail.cursor, cleared: false, points: [] };
}

function sceneEnd(trail: LiveTrail): VacuumPoint | null {
  if (trail.cleared) return null;
  const run = trail.base[trail.base.length - 1];
  return run?.points[run.points.length - 1] ?? null;
}

function samePlace(left: VacuumPoint | null, right: VacuumPoint): boolean {
  return left !== null && left.x === right.x && left.y === right.y;
}

function cleared(pose: LivePosePoint | null, trail: LiveTrail): LiveTrail {
  return {
    base: trail.base,
    anchor: NO_CURSOR,
    cursor: pose?.cursor ?? NO_CURSOR,
    cleared: true,
    points: pose === null ? [] : [{ x: pose.x, y: pose.y, cursor: pose.cursor }],
  };
}

function restarted(trail: LiveTrail, pose: LivePosePoint | null): LiveTrail | null {
  if (pose !== null) return pose.cursor < trail.cursor ? cleared(pose, trail) : null;
  return trail.cursor === NO_CURSOR ? trail : cleared(null, trail);
}

export function withLivePose(trail: LiveTrail, pose: LivePosePoint | null): LiveTrail {
  const restart = restarted(trail, pose);
  if (restart !== null || pose === null) return restart ?? trail;
  if (pose.cursor === trail.cursor) return trail;
  const point = { x: pose.x, y: pose.y, cursor: pose.cursor };
  if (samePlace(sceneEnd(trail), point)) {
    return { ...trail, anchor: pose.cursor, cursor: pose.cursor, points: [] };
  }
  if (pose.cursor <= trail.anchor) return { ...trail, cursor: pose.cursor };
  const last = trail.points[trail.points.length - 1] ?? null;
  const points = samePlace(last, point) ? trail.points : [...trail.points, point];
  return { ...trail, cursor: pose.cursor, points };
}

function liveRun(trail: LiveTrail): VacuumTrailRun | null {
  const run = trail.cleared ? undefined : trail.base[trail.base.length - 1];
  const end = sceneEnd(trail);
  const points = [
    ...(end === null ? [] : [end]),
    ...trail.points.map((point) => ({ x: point.x, y: point.y })),
  ];
  return points.length < 2 ? null : { mopping: run?.mopping ?? false, points };
}

export function shownTrailOf(trail: LiveTrail): ShownTrail {
  const run = liveRun(trail);
  return { base: trail.cleared ? NO_RUNS : trail.base, live: run === null ? NO_RUNS : [run] };
}
