import {
  HOME_MAP_NOTICE_WRITE,
  homeMapActorKind,
  homeMapRobotFloorCode,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFloor,
  type HomeMapNotice,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSource,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HomeMapApplied } from '../store/repositories/home-maps';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
import type { HomeMapService } from './service';

export interface RoomLinksPorts {
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly links: { readonly list: (deviceId: string) => readonly StoredRoomLink[] };
  readonly setRoomFloor: (deviceId: string, mapRoomId: number, floor: number) => Promise<void>;
  readonly newId: () => string;
  readonly now: () => string;
  readonly log: Logger;
}

export type FloorWriteOutcome =
  | { readonly roomId: string; readonly status: 'sent'; readonly floor: number }
  | {
      readonly roomId: string;
      readonly status: 'unchanged' | 'unknown_to_robot' | 'not_a_robot_room';
    }
  | { readonly roomId: string; readonly status: 'failed'; readonly error: string };

export interface DerivedLinks {
  readonly ops: readonly HomeMapOp[];
  readonly taken: readonly string[];
}

interface DerivationInput {
  readonly floor: HomeMapFloor;
  readonly source: HomeMapSource;
  readonly notices: readonly HomeMapNotice[];
  readonly links: readonly StoredRoomLink[];
  readonly createdAt: string;
  readonly newId: () => string;
}

const MAP_ROOM_REF = /^\d+$/u;

const BASE_FLOOR_CODE = z.looseObject({ ref: z.string(), floorCode: z.number().int().nullable() });

export const staleLinkText = (link: StoredRoomLink): string =>
  `The robot's map no longer has ${link.mapRoomName}. It was linked to ${link.roomName}.`;

export const linksByRef = (links: readonly StoredRoomLink[]): ReadonlyMap<string, StoredRoomLink> =>
  new Map(links.map((link) => [String(link.mapRoomId), link]));

const isSourceRoom =
  (source: HomeMapSource) =>
  (room: HomeMapRoom): boolean =>
    room.origin.kind === 'source' && room.origin.sourceId === source.id;

const refOf = (room: HomeMapRoom): string | null =>
  room.origin.kind === 'source' ? room.origin.ref : null;

function homeRoomOps(
  input: DerivationInput,
  byRef: ReadonlyMap<string, StoredRoomLink>,
): DerivedLinks {
  const { floor, source } = input;
  const own = floor.rooms.filter(isSourceRoom(source));
  const claimed = new Set(
    floor.rooms
      .filter((room) => !isSourceRoom(source)(room))
      .flatMap((room) => room.homeRoomId ?? []),
  );
  const ops: HomeMapOp[] = [];
  const taken: string[] = [];
  for (const room of own) {
    const ref = refOf(room);
    const wanted = ref === null ? null : (byRef.get(ref)?.roomId ?? null);
    if (wanted === room.homeRoomId) continue;
    if (wanted !== null && claimed.has(wanted)) {
      taken.push(room.id);
      continue;
    }
    ops.push({
      op: 'update',
      kind: 'room',
      floorId: floor.id,
      id: room.id,
      patch: { homeRoomId: wanted },
    });
  }
  return { ops, taken };
}

function staleNoticeOps(
  input: DerivationInput,
  byRef: ReadonlyMap<string, StoredRoomLink>,
): readonly HomeMapOp[] {
  return input.floor.rooms.filter(isSourceRoom(input.source)).flatMap((room): HomeMapOp[] => {
    const ref = refOf(room);
    const link = ref === null ? undefined : byRef.get(ref);
    const stale = link !== undefined && link.missingSince !== null;
    const held = input.notices.find((n) => n.kind === 'link_stale' && n.elementId === room.id);
    if (!stale) return held === undefined ? [] : [{ op: 'remove', kind: 'notice', id: held.id }];
    const detail = staleLinkText(link);
    if (held === undefined) {
      const element = HOME_MAP_NOTICE_WRITE.parse({
        id: input.newId(),
        kind: 'link_stale',
        elementId: room.id,
        detail,
        createdAt: input.createdAt,
      });
      return [{ op: 'add', kind: 'notice', element }];
    }
    return held.detail === detail
      ? []
      : [{ op: 'update', kind: 'notice', id: held.id, patch: { detail } }];
  });
}

export function deriveRoomLinks(input: DerivationInput): DerivedLinks {
  const byRef = linksByRef(input.links);
  const rooms = homeRoomOps(input, byRef);
  return { ops: [...rooms.ops, ...staleNoticeOps(input, byRef)], taken: rooms.taken };
}

const ADDED_ROOM_ORIGIN = z.looseObject({
  origin: z.looseObject({ kind: z.literal('source'), ref: z.string() }),
});

export function withLinkedRooms(
  ops: readonly HomeMapOp[],
  links: readonly StoredRoomLink[],
): readonly HomeMapOp[] {
  const byRef = linksByRef(links);
  const claimed = new Set<string>();
  return ops.map((op): HomeMapOp => {
    if (op.op !== 'add' || op.kind !== 'room') return op;
    const origin = ADDED_ROOM_ORIGIN.safeParse(op.element);
    const link = origin.success ? byRef.get(origin.data.origin.ref) : undefined;
    if (link === undefined || claimed.has(link.roomId)) return op;
    claimed.add(link.roomId);
    return { ...op, element: { ...op.element, homeRoomId: link.roomId } };
  });
}

interface RobotRoom {
  readonly room: HomeMapRoom;
  readonly source: HomeMapSource;
  readonly ref: string;
}

function robotRoomOf(map: HomeMap, roomId: string): RobotRoom | null {
  const room = map.floors.flatMap((floor) => floor.rooms).find((entry) => entry.id === roomId);
  if (room?.origin.kind !== 'source') return null;
  const { sourceId, ref } = room.origin;
  const source = map.sources.find((candidate) => candidate.id === sourceId);
  return source === undefined || !MAP_ROOM_REF.test(ref) ? null : { room, source, ref };
}

function heldFloorCode(source: HomeMapSource, ref: string): number | null {
  for (const entry of source.base.rooms) {
    const parsed = BASE_FLOOR_CODE.safeParse(entry);
    if (parsed.success && parsed.data.ref === ref) return parsed.data.floorCode;
  }
  return null;
}

const actorOf = (source: HomeMapSource): HomeMapActor => `source:${source.id}`;

export class HomeMapRoomLinks {
  constructor(private readonly ports: RoomLinksPorts) {}

  sync(deviceId: string): number {
    const links = this.ports.links.list(deviceId);
    let revisions = 0;
    for (const { id } of this.ports.maps.get().sources.filter((s) => s.deviceId === deviceId)) {
      revisions += this.syncSource(id, links);
    }
    return revisions;
  }

  async writeThrough(result: HomeMapApplied, actor: HomeMapActor): Promise<FloorWriteOutcome[]> {
    if (homeMapActorKind(actor) === 'source') return [];
    const outcomes: FloorWriteOutcome[] = [];
    for (const roomId of this.recoloured(result)) {
      outcomes.push(await this.writeRoom(result.map, roomId));
    }
    return outcomes;
  }

  private syncSource(sourceId: string, links: readonly StoredRoomLink[]): number {
    const map = this.ports.maps.get();
    const source = map.sources.find((candidate) => candidate.id === sourceId);
    const floor =
      source === undefined ? undefined : map.floors.find((f) => f.id === source.floorId);
    if (source === undefined || floor === undefined) return 0;
    const derived = deriveRoomLinks({
      floor,
      source,
      notices: map.notices,
      links,
      createdAt: this.ports.now(),
      newId: this.ports.newId,
    });
    for (const roomId of derived.taken) {
      this.ports.log.warn('home_map.room_link_taken', { sourceId, roomId });
    }
    if (derived.ops.length === 0) return 0;
    const applied = this.ports.maps.apply(derived.ops, actorOf(source));
    if (applied.conflicts.length > 0) {
      this.ports.log.warn('home_map.room_link_conflicts', {
        sourceId,
        conflicts: applied.conflicts.length,
      });
    }
    return applied.applied.length > 0 ? 1 : 0;
  }

  private recoloured(result: HomeMapApplied): ReadonlySet<string> {
    return new Set(
      result.applied.flatMap((op) =>
        op.op === 'update' && op.kind === 'room' && 'floorMaterial' in op.patch ? [op.id] : [],
      ),
    );
  }

  private async writeRoom(map: HomeMap, roomId: string): Promise<FloorWriteOutcome> {
    const robot = robotRoomOf(map, roomId);
    if (robot === null) return { roomId, status: 'not_a_robot_room' };
    const floor = homeMapRobotFloorCode(robot.room.floorMaterial);
    if (floor === null) return { roomId, status: 'unknown_to_robot' };
    if (heldFloorCode(robot.source, robot.ref) === floor) return { roomId, status: 'unchanged' };
    return this.send(robot.source.deviceId, roomId, Number(robot.ref), floor);
  }

  private async send(
    deviceId: string,
    roomId: string,
    mapRoomId: number,
    floor: number,
  ): Promise<FloorWriteOutcome> {
    try {
      await this.ports.setRoomFloor(deviceId, mapRoomId, floor);
      this.ports.log.info('home_map.robot_floor_written', { deviceId, mapRoomId, floor });
      return { roomId, status: 'sent', floor };
    } catch (error) {
      this.ports.log.error('home_map.robot_floor_write_failed', {
        deviceId,
        mapRoomId,
        floor,
        error: String(error),
      });
      return { roomId, status: 'failed', error: String(error) };
    }
  }
}
