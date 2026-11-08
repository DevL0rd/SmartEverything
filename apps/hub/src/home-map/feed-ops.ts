import {
  appendTo,
  type HomeMap,
  type HomeMapFeed,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapOrigin,
  type HomeMapSource,
} from '@smarteverything/domain';
import type { HomeMapSourceLocation } from '../store/repositories/home-maps';
import type { RobotMapIdentity, RobotMapInfo } from './sources/xiaomi-vacuum';

export type OpBatches = Map<HomeMapId, HomeMapOp[]>;

interface Owned {
  readonly kind: 'room' | 'wall' | 'opening' | 'object';
  readonly floorId: string;
  readonly id: string;
}

interface Originated {
  readonly id: string;
  readonly origin: HomeMapOrigin;
}

export const newRobotMapNoticeId = (deviceId: string, robotMapId: number): string =>
  `robot-map:${deviceId}:${String(robotMapId)}`;

export function addToBatch(batches: OpBatches, mapId: HomeMapId, ops: readonly HomeMapOp[]): void {
  for (const op of ops) appendTo(batches, mapId, op);
}

export function withRobotMap(
  ops: readonly HomeMapOp[],
  identity: RobotMapIdentity | null,
): readonly HomeMapOp[] {
  if (identity === null) return ops;
  const named = identity.name === null ? {} : { robotMapName: identity.name };
  return ops.map((op): HomeMapOp =>
    op.op === 'add' && op.kind === 'source'
      ? { ...op, element: { ...op.element, robotMapId: identity.robotMapId, ...named } }
      : op,
  );
}

export function withoutPlacedDevice(
  ops: readonly HomeMapOp[],
  deviceId: string,
): readonly HomeMapOp[] {
  return ops.filter(
    (op) => !(op.op === 'add' && op.kind === 'placement' && op.element['deviceId'] === deviceId),
  );
}

export const placedAnywhere = (map: HomeMap, deviceId: string): boolean =>
  map.floors.some((floor) => floor.placements.some((placement) => placement.deviceId === deviceId));

function ownedOf(map: HomeMap, sourceId: string): readonly Owned[] {
  return map.floors.flatMap((floor) => {
    const mine = (kind: Owned['kind'], items: readonly Originated[]): Owned[] =>
      items
        .filter((item) => item.origin.kind === 'source' && item.origin.sourceId === sourceId)
        .map((item) => ({ kind, floorId: floor.id, id: item.id }));
    return [
      ...mine('room', floor.rooms),
      ...mine('wall', floor.walls),
      ...mine('opening', floor.openings),
      ...mine('object', floor.objects),
    ];
  });
}

export function detachOps(map: HomeMap, source: HomeMapSource): readonly HomeMapOp[] {
  const owned = ownedOf(map, source.id);
  const ids = new Set([source.id, ...owned.map((item) => item.id)]);
  return [
    ...owned.map((item): HomeMapOp => ({
      op: 'update',
      kind: item.kind,
      floorId: item.floorId,
      id: item.id,
      patch: { origin: { kind: 'hand' } },
    })),
    ...map.notices
      .filter((notice) => ids.has(notice.elementId))
      .map((notice): HomeMapOp => ({ op: 'remove', kind: 'notice', id: notice.id })),
    { op: 'remove', kind: 'source', id: source.id },
  ];
}

export const awaitsAlignment = (map: HomeMap, source: HomeMapSource): boolean =>
  source.base.rooms.length === 0 &&
  map.notices.some((notice) => notice.kind === 'source_moved' && notice.elementId === source.id);

export function noticeClearOps(map: HomeMap, elementId: string): readonly HomeMapOp[] {
  return map.notices
    .filter((notice) => notice.kind === 'source_new_robot_map' && notice.elementId === elementId)
    .map((notice): HomeMapOp => ({ op: 'remove', kind: 'notice', id: notice.id }));
}

export function locationFor(
  held: readonly HomeMapSourceLocation[],
  robotMapId: number,
  isCurrent: boolean,
): HomeMapSourceLocation | undefined {
  return (
    held.find((entry) => entry.source.robotMapId === robotMapId) ??
    (isCurrent ? held.find((entry) => entry.source.robotMapId === undefined) : undefined)
  );
}

export function identityPatch(
  source: HomeMapSource,
  robotMapId: number,
  name: string | undefined,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (source.robotMapId !== robotMapId) patch['robotMapId'] = robotMapId;
  if (name !== undefined && name !== '' && source.robotMapName !== name) {
    patch['robotMapName'] = name;
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

const targetOf = (held: HomeMapSourceLocation | undefined): HomeMapFeed['target'] =>
  held === undefined ? null : { mapId: held.mapId, floorId: held.source.floorId };

export function feedsFor(
  deviceId: string,
  infos: readonly RobotMapInfo[],
  locations: readonly HomeMapSourceLocation[],
): HomeMapFeed[] {
  const listed = infos.map((info): HomeMapFeed => ({
    deviceId,
    robotMapId: info.robotMapId,
    robotMapName: info.name === '' ? null : info.name,
    isCurrent: info.isCurrent,
    target: targetOf(locationFor(locations, info.robotMapId, info.isCurrent)),
  }));
  const gone = locations.flatMap((held): HomeMapFeed[] => {
    const { robotMapId } = held.source;
    if (robotMapId === undefined || infos.some((info) => info.robotMapId === robotMapId)) {
      return [];
    }
    return [
      {
        deviceId,
        robotMapId,
        robotMapName: held.source.robotMapName ?? null,
        isCurrent: false,
        target: targetOf(held),
      },
    ];
  });
  return [...listed, ...gone];
}
