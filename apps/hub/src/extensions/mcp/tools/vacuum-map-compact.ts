import type { VacuumSceneAnswer } from '@smarteverything/domain';

type SceneRoom = VacuumSceneAnswer['rooms'][number];

const CENTIMETRE = 100;
export const DECIMETRE = 10;

export const roundTo = (value: number, scale: number): number => Math.round(value * scale) / scale;

const metres = (value: number): number => roundTo(value, CENTIMETRE);

export function pointOf(point: { readonly x: number; readonly y: number }): {
  x: number;
  y: number;
} {
  return { x: metres(point.x), y: metres(point.y) };
}

export function poseOf(
  pose: { readonly x: number; readonly y: number; readonly yaw: number } | null,
): Record<string, number> | null {
  return pose === null ? null : { ...pointOf(pose), yaw: roundTo(pose.yaw, CENTIMETRE) };
}

interface Bounds {
  readonly min: { x: number; y: number };
  readonly max: { x: number; y: number };
}

export interface CompactMap {
  readonly version: string;
  readonly name: string | null;
  readonly fetched_at: string;
  readonly unit: 'metres, y up';
  readonly bounds: Bounds;
  readonly dock: Record<string, number> | null;
  readonly robot: Record<string, number> | null;
  readonly rooms: readonly Record<string, unknown>[];
  readonly unlinked_rooms: number | null;
  readonly zones: readonly Record<string, unknown>[];
}

function boundsOf(points: readonly { readonly x: number; readonly y: number }[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    min: pointOf({ x: Math.min(...xs), y: Math.min(...ys) }),
    max: pointOf({ x: Math.max(...xs), y: Math.max(...ys) }),
  };
}

export function compactRoom(room: SceneRoom): Record<string, unknown> {
  return {
    id: room.id,
    name: room.name,
    home_room: room.homeRoom?.name ?? null,
    area_m2: roundTo(room.areaM2, DECIMETRE),
    hidden: room.hidden,
    ...boundsOf(room.rings.flat()),
  };
}

export function compactVacuumMap(scene: VacuumSceneAnswer): CompactMap {
  return {
    version: `${String(scene.index)}:${scene.slot}`,
    name: scene.name,
    fetched_at: scene.fetchedAt,
    unit: 'metres, y up',
    bounds: {
      min: pointOf({ x: scene.bounds.minX, y: scene.bounds.minY }),
      max: pointOf({ x: scene.bounds.maxX, y: scene.bounds.maxY }),
    },
    dock: poseOf(scene.dock),
    robot: poseOf(scene.robot),
    rooms: scene.rooms.map(compactRoom),
    unlinked_rooms: scene.unlinkedRooms ?? null,
    zones: scene.zones.map((zone) => ({
      id: zone.id,
      kind: zone.kind,
      ...boundsOf(zone.points),
    })),
  };
}
