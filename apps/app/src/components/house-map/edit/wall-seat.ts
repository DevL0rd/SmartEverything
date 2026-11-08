import { homeMapWallPose } from '@smarteverything/domain/home-map-edit-core';
import { homeMapWallLength, type HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapWall, HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';

export interface WallSize {
  readonly width: number;
  readonly depth: number;
}

export interface WallSpot {
  readonly at: HomeMapWall['from'];
  readonly rotation: number;
  readonly wall: HomeMapWallAttachment;
}

type SeatWall = Pick<HomeMapWall, 'id' | 'from' | 'to' | 'thickness'>;

export function offFace(at: HomeMapVec, normal: HomeMapVec, depth: number): HomeMapVec {
  return { x: at.x + (normal.x * depth) / 2, y: at.y + (normal.y * depth) / 2 };
}

export function keptOnWall(wall: SeatWall, offset: number, width: number): number {
  const length = homeMapWallLength(wall);
  const half = width / 2;
  if (length <= width) return length / 2;
  return Math.min(Math.max(offset, half), length - half);
}

export function wallSeat(
  wall: SeatWall,
  attachment: HomeMapWallAttachment,
  size: WallSize,
): WallSpot | null {
  const kept = { ...attachment, offset: keptOnWall(wall, attachment.offset, size.width) };
  const pose = homeMapWallPose(wall, kept);
  if (pose === null) return null;
  const at = offFace(pose.at, pose.normal, size.depth);
  return { at: { x: at.x, y: at.y }, rotation: pose.rotation, wall: kept };
}
