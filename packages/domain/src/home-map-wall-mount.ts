import {
  homeMapRoomAt,
  homeMapWallLength,
  homeMapWallPointAt,
  homeMapNearestWall,
  type HomeMapPolygonShape,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from './home-map-geometry';
import type { HomeMapWallAttachment, HomeMapWallId } from './home-map-elements';
import { homeMapSnapRotation } from './home-map-snap';

const EPS = 1e-9;
const PROBE_M = 0.05;

export interface HomeMapMountWall extends HomeMapSegmentShape {
  readonly id: HomeMapWallId;
  readonly thickness: number;
}

export interface HomeMapMountRoom {
  readonly polygon: HomeMapPolygonShape;
}

export interface HomeMapWallPose {
  readonly at: HomeMapVec;
  readonly normal: HomeMapVec;
  readonly rotation: number;
}

export interface HomeMapWallMount<
  W extends HomeMapMountWall,
  R extends HomeMapMountRoom,
> extends HomeMapWallPose {
  readonly wall: W;
  readonly room: R | null;
  readonly attachment: HomeMapWallAttachment;
  readonly distance: number;
}

const direction = (wall: HomeMapSegmentShape): HomeMapVec | null => {
  const length = homeMapWallLength(wall);
  if (length < EPS) return null;
  return { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
};

const sideNormal = (dir: HomeMapVec, side: HomeMapWallAttachment['side']): HomeMapVec =>
  side === 'left' ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };

const probeAt = (foot: HomeMapVec, normal: HomeMapVec): HomeMapVec => ({
  x: foot.x + normal.x * PROBE_M,
  y: foot.y + normal.y * PROBE_M,
});

const sideOf = (
  dir: HomeMapVec,
  foot: HomeMapVec,
  point: HomeMapVec,
  rooms: readonly HomeMapMountRoom[],
): HomeMapWallAttachment['side'] => {
  const cross = dir.x * (point.y - foot.y) - dir.y * (point.x - foot.x);
  if (Math.abs(cross) > EPS) return cross > 0 ? 'left' : 'right';
  const leftRoom = homeMapRoomAt(rooms, probeAt(foot, sideNormal(dir, 'left')));
  const rightRoom = homeMapRoomAt(rooms, probeAt(foot, sideNormal(dir, 'right')));
  return leftRoom === null && rightRoom !== null ? 'right' : 'left';
};

export const homeMapWallPose = (
  wall: HomeMapMountWall,
  attachment: Pick<HomeMapWallAttachment, 'offset' | 'side'>,
): HomeMapWallPose | null => {
  const dir = direction(wall);
  if (!dir) return null;
  const normal = sideNormal(dir, attachment.side);
  const foot = homeMapWallPointAt(wall, attachment.offset);
  const half = wall.thickness / 2;
  return {
    at: { x: foot.x + normal.x * half, y: foot.y + normal.y * half },
    normal,
    rotation: homeMapSnapRotation((Math.atan2(normal.y, normal.x) * 180) / Math.PI, null),
  };
};

export const homeMapMountOnWall = <W extends HomeMapMountWall, R extends HomeMapMountRoom>(
  walls: readonly W[],
  rooms: readonly R[],
  point: HomeMapVec,
): HomeMapWallMount<W, R> | null => {
  const hit = homeMapNearestWall(
    walls.filter((wall) => direction(wall) !== null),
    point,
  );
  const dir = hit ? direction(hit.wall) : null;
  if (!hit || !dir) return null;
  const foot = homeMapWallPointAt(hit.wall, hit.offset);
  const side = sideOf(dir, foot, point, rooms);
  const attachment = { wallId: hit.wall.id, offset: hit.offset, side };
  const pose = homeMapWallPose(hit.wall, attachment);
  if (!pose) return null;
  const room =
    homeMapRoomAt(rooms, point) ?? homeMapRoomAt(rooms, probeAt(foot, sideNormal(dir, side)));
  return { ...pose, wall: hit.wall, room, attachment, distance: hit.distance };
};

export const homeMapFollowWall = (
  attachment: HomeMapWallAttachment,
  before: HomeMapSegmentShape,
  after: HomeMapSegmentShape,
): HomeMapWallAttachment => {
  const oldLength = homeMapWallLength(before);
  const ratio = oldLength < EPS ? 0 : Math.min(1, Math.max(0, attachment.offset / oldLength));
  return { ...attachment, offset: ratio * homeMapWallLength(after) };
};
