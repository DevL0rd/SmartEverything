import {
  homeMapRobotFloor,
  homeMapRobotFloorCode,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSource,
  type VacuumPose,
} from '@smarteverything/domain';
import {
  homeMapRenderScene,
  type HomeMapSceneLive,
  type HomeMapSceneRoomLink,
} from '../../../../components/house-map/adapters/home-map-scene';
import { sourcePoseToHouse, sourceToHouse } from '../../../../components/house-map/overlays/model';
import type { OverlayTransform } from '../../../../components/house-map/overlays/model-types';
import type { ScenePick } from '../../../../components/house-map/3d/render-core-pick';
import type {
  RenderFloor,
  RenderPose,
  RenderScene,
  RenderTrailRun,
} from '../../../../components/house-map/render-scene';
import type { ShownTrail } from './live-trail';
import type { ShownScene } from './room-names';
import { vacuumRenderPose, type VacuumHit } from './vacuum-scene';

export interface UnifiedPlace {
  readonly map: HomeMap;
  readonly floor: HomeMapFloor;
  readonly source: HomeMapSource;
}

export interface UnifiedRooms {
  readonly toHouse: ReadonlyMap<number, string>;
  readonly toRobot: ReadonlyMap<string, number>;
}

export interface UnifiedMap {
  readonly place: UnifiedPlace;
  readonly rooms: UnifiedRooms;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly transform: OverlayTransform;
}

export interface UnifiedMaterial {
  readonly code: number | null;
  readonly label: string;
}

export const ROBOT_REACH = {
  sends: ['Floor materials the robot knows', 'Cleaning zones and no-go areas'],
  hub: ['Room links: the robot’s rooms show their home room names'],
  never: [
    'Room shapes, splits and merges',
    'Walls, doors and windows',
    'Furniture and devices',
    'Paint and notes',
  ],
} as const;

export function unifiedPlaceOf(map: HomeMap | null, deviceId: string): UnifiedPlace | null {
  if (map === null) return null;
  for (const source of map.sources) {
    if (source.deviceId !== deviceId) continue;
    const floor = map.floors.find((candidate) => candidate.id === source.floorId);
    if (floor !== undefined) return { map, floor, source };
  }
  return null;
}

function robotRef(room: HomeMapRoom, sourceId: string): number | null {
  if (room.origin.kind !== 'source' || room.origin.sourceId !== sourceId) return null;
  const ref = Number(room.origin.ref);
  return Number.isInteger(ref) ? ref : null;
}

export function unifiedRoomsOf(place: UnifiedPlace): UnifiedRooms {
  const toHouse = new Map<number, string>();
  const toRobot = new Map<string, number>();
  for (const room of place.floor.rooms) {
    const ref = robotRef(room, place.source.id);
    if (ref === null) continue;
    toHouse.set(ref, room.id);
    toRobot.set(room.id, ref);
  }
  return { toHouse, toRobot };
}

export function unifiedTransform(source: HomeMapSource): OverlayTransform {
  const { rotationDeg, tx, ty, mirrored } = source.transform;
  return { rotationDeg, tx, ty, mirrored };
}

export function robotLive(scene: ShownScene | null, sourceId: string): HomeMapSceneLive {
  return {
    sourceRoom: (id: string, ref: string): HomeMapSceneRoomLink | null => {
      if (scene === null || id !== sourceId) return null;
      const room = scene.rooms.find((candidate) => String(candidate.id) === ref);
      return room === undefined ? null : { homeRoomId: room.homeRoomId, name: room.name };
    },
  };
}

export function unifiedMapOf(
  place: UnifiedPlace,
  scene: ShownScene | null,
  live: HomeMapSceneLive,
): UnifiedMap | null {
  const robot = robotLive(scene, place.source.id);
  const rendered = homeMapRenderScene({ map: place.map, live: { ...live, ...robot } });
  const found = rendered.floors.find((candidate) => candidate.id === place.floor.id);
  if (found === undefined) return null;
  const transform = unifiedTransform(place.source);
  const dock = vacuumRenderPose(scene?.dock ?? null);
  const floor: RenderFloor = {
    ...found,
    vacuum: {
      dock: dock === null ? null : sourcePoseToHouse(transform, dock),
      robot: null,
      trail: [],
      zones: [],
    },
  };
  const shown = rendered.floors.map((candidate) => (candidate === found ? floor : candidate));
  return {
    place,
    rooms: unifiedRoomsOf(place),
    scene: { ...rendered, floors: shown },
    floor,
    transform,
  };
}

export function houseRobotPose(
  transform: OverlayTransform,
  pose: VacuumPose | null,
): RenderPose | null {
  const rendered = vacuumRenderPose(pose);
  return rendered === null ? null : sourcePoseToHouse(transform, rendered);
}

function runsToHouse(
  transform: OverlayTransform,
  runs: ShownTrail['base'],
): readonly RenderTrailRun[] {
  return runs.map((run) => ({
    mopping: run.mopping,
    points: run.points.map((point) => sourceToHouse(transform, point)),
  }));
}

export function houseTrail(
  transform: OverlayTransform,
  trail: ShownTrail,
): { readonly base: readonly RenderTrailRun[]; readonly live: readonly RenderTrailRun[] } {
  return { base: runsToHouse(transform, trail.base), live: runsToHouse(transform, trail.live) };
}

export function houseSelection(rooms: UnifiedRooms, robotIds: readonly number[]): string[] {
  return robotIds.flatMap((id) => rooms.toHouse.get(id) ?? []);
}

export function unifiedPick(rooms: UnifiedRooms, pick: ScenePick): VacuumHit | null {
  if (pick.kind !== 'room') return null;
  const id = rooms.toRobot.get(pick.id);
  return id === undefined ? null : { kind: 'room', id };
}

const MATERIAL_WORDS: Readonly<Record<string, string>> = {
  carpet: 'Carpet',
  concrete: 'Concrete',
  laminate: 'Laminate',
  vinyl: 'Vinyl',
};

function materialWords(kind: string): string {
  const named = MATERIAL_WORDS[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return `${named.replaceAll('_', ' ')} on the home map`;
}

export function unifiedMaterialOf(
  map: UnifiedMap,
  robotRoomId: number,
  labelOf: (code: number) => string,
): UnifiedMaterial | null {
  const roomId = map.rooms.toHouse.get(robotRoomId);
  const room = map.place.floor.rooms.find((candidate) => candidate.id === roomId);
  if (room === undefined) return null;
  const code = homeMapRobotFloorCode(room.floorMaterial);
  return { code, label: code === null ? materialWords(room.floorMaterial.kind) : labelOf(code) };
}

export function unifiedMaterialOp(
  map: UnifiedMap,
  robotRoomId: number,
  code: number,
): HomeMapOp | null {
  const roomId = map.rooms.toHouse.get(robotRoomId);
  const room = map.place.floor.rooms.find((candidate) => candidate.id === roomId);
  const floor = homeMapRobotFloor(code);
  if (room === undefined || floor.status !== 'known') return null;
  return {
    op: 'update',
    kind: 'room',
    floorId: map.place.floor.id,
    id: room.id,
    patch: {
      floorMaterial: { kind: floor.kind, variant: floor.variant, tint: room.floorMaterial.tint },
    },
  };
}
