import { randomUUID } from 'node:crypto';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';
import { roomKey } from '../repositories/rooms';

const ROOM = z.object({ id: z.string(), name: z.string() });
const UNPLACED = z.object({ id: z.string(), provider_room: z.string() });
const POSITION = z.object({ next: z.number().int() });

export function placeDevicesInProviderRooms(sql: Sql): LogPayload {
  const rooms = new Map(
    sql.all(ROOM, 'select id, name from rooms').map((room) => [roomKey(room.name), room.id]),
  );
  const unplaced = sql.all(
    UNPLACED,
    `select id, provider_room from devices
     where room_id is null and provider_room is not null and length(trim(provider_room)) between 1 and 60`,
  );
  let created = 0;
  let next =
    sql.get(POSITION, 'select coalesce(max(position), -1) + 1 as next from rooms')?.next ?? 0;
  for (const device of unplaced) {
    const name = device.provider_room.trim();
    let roomId = rooms.get(roomKey(name));
    if (roomId === undefined) {
      roomId = randomUUID();
      sql.run(
        'add the missing provider room',
        'insert into rooms (id, name, position) values ($id, $name, $position)',
        { id: roomId, name, position: next },
      );
      rooms.set(roomKey(name), roomId);
      next += 1;
      created += 1;
    }
    sql.run(
      'place the device in its provider room',
      'update devices set room_id = $roomId where id = $id',
      {
        roomId,
        id: device.id,
      },
    );
  }
  return { placed: unplaced.length, created };
}
