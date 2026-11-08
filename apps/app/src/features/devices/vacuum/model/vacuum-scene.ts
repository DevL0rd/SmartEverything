import type { VacuumPose, VacuumScene } from '@smarteverything/domain';
import { vacuumRenderScene } from '../../../../components/house-map/adapters/vacuum-scene';
import type { ScenePick } from '../../../../components/house-map/3d/render-core-pick';
import {
  radiansToDegrees,
  type RenderFloor,
  type RenderPose,
} from '../../../../components/house-map/render-scene';

type RoomPick = Extract<ScenePick, { readonly kind: 'room' }>;

export interface VacuumHit {
  readonly kind: RoomPick['kind'];
  readonly id: number;
}

export function vacuumFloor(scene: VacuumScene): RenderFloor {
  const [floor] = vacuumRenderScene({ scene }).floors;
  if (floor === undefined) throw new Error('The vacuum render scene has no floor');
  return floor;
}

export const vacuumRenderPose = (pose: VacuumPose | null): RenderPose | null =>
  pose === null ? null : { x: pose.x, y: pose.y, yawDeg: radiansToDegrees(pose.yaw) };

export function vacuumRoomRenderId(
  scene: Pick<VacuumScene, 'rooms'>,
  floor: Pick<RenderFloor, 'rooms'>,
  roomId: number | null,
): string | null {
  const index = scene.rooms.findIndex((room) => room.id === roomId);
  return floor.rooms[index]?.id ?? null;
}

export function vacuumHit(
  scene: Pick<VacuumScene, 'rooms'>,
  floor: Pick<RenderFloor, 'rooms'>,
  pick: ScenePick,
): VacuumHit | null {
  if (pick.kind !== 'room') return null;
  const room = scene.rooms[floor.rooms.findIndex((candidate) => candidate.id === pick.id)];
  return room === undefined ? null : { kind: 'room', id: room.id };
}

export const roomPick = (roomId: string | null): ScenePick =>
  roomId === null ? { kind: 'none' } : { kind: 'room', id: roomId };
