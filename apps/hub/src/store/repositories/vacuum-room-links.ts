import { z } from 'zod';
import type { StoreContext } from '../context';

const STORED_ROOM_LINK = z.object({
  mapRoomId: z.number().int(),
  mapRoomName: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  linkedAt: z.string(),
  missingSince: z.string().nullable(),
});

export type StoredRoomLink = z.infer<typeof STORED_ROOM_LINK>;

export interface RoomLinkDraft {
  readonly mapRoomId: number;
  readonly mapRoomName: string;
  readonly roomId: string;
}

export interface MapRoomName {
  readonly id: number;
  readonly name: string;
}

const LIST = `select l.map_room_id as mapRoomId, l.map_room_name as mapRoomName,
    l.room_id as roomId, r.name as roomName, l.linked_at as linkedAt,
    l.missing_since as missingSince
  from vacuum_room_links l join rooms r on r.id = l.room_id
  where l.device_id = $deviceId order by l.map_room_id`;

const RELEASE = `delete from vacuum_room_links
  where device_id = $deviceId and room_id = $roomId and map_room_id != $mapRoomId`;

const LINK = `insert into vacuum_room_links
    (device_id, map_room_id, room_id, map_room_name, linked_at, missing_since)
  values ($deviceId, $mapRoomId, $roomId, $mapRoomName, $at, null)
  on conflict (device_id, map_room_id) do update
  set room_id = excluded.room_id, map_room_name = excluded.map_room_name,
    linked_at = excluded.linked_at, missing_since = null`;

const RETURNED = `update vacuum_room_links set missing_since = null, map_room_name = $name
  where device_id = $deviceId and map_room_id = $id
    and (missing_since is not null or map_room_name != $name)`;

const MISSING = `update vacuum_room_links set missing_since = $at
  where device_id = $deviceId and missing_since is null
    and map_room_id not in (select value from json_each($ids))`;

export class VacuumRoomLinksRepository {
  constructor(private readonly context: StoreContext) {}

  list(deviceId: string): StoredRoomLink[] {
    return this.context.sql.all(STORED_ROOM_LINK, LIST, { deviceId });
  }

  link(deviceId: string, draft: RoomLinkDraft): void {
    this.context.write(() => {
      const keys = { deviceId, mapRoomId: draft.mapRoomId, roomId: draft.roomId };
      this.context.sql.run('free the home room from another map room', RELEASE, keys);
      this.context.sql.run('link the map room to the home room', LINK, {
        ...keys,
        mapRoomName: draft.mapRoomName,
        at: this.context.now(),
      });
    });
  }

  unlink(deviceId: string, mapRoomId: number): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'unlink the map room',
          'delete from vacuum_room_links where device_id = $deviceId and map_room_id = $mapRoomId',
          { deviceId, mapRoomId },
        ) > 0,
    );
  }

  reconcile(deviceId: string, rooms: readonly MapRoomName[], at: string): number {
    return this.context.write(() => {
      const returned = rooms.reduce(
        (changes, room) =>
          changes +
          this.context.sql.run('mark the map room link present', RETURNED, {
            deviceId,
            id: room.id,
            name: room.name,
          }),
        0,
      );
      const missing = this.context.sql.run('mark the map room links stale', MISSING, {
        deviceId,
        at,
        ids: JSON.stringify(rooms.map((room) => room.id)),
      });
      return returned + missing;
    });
  }
}
