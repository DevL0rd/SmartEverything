import { orderedRooms } from './table-rules';

interface OrderedRoom {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export interface RoomGroup<T> {
  readonly key: string;
  readonly title: string;
  readonly devices: readonly T[];
}

export function roomGroupsOf<T>(
  items: readonly T[],
  rooms: readonly OrderedRoom[],
  roomOf: (item: T) => string | null,
): readonly RoomGroup<T>[] {
  const known = new Set(rooms.map((room) => room.id));
  const groups: RoomGroup<T>[] = [
    ...orderedRooms(rooms).map((room) => ({
      key: room.id,
      title: room.name,
      devices: items.filter((item) => roomOf(item) === room.id),
    })),
    {
      key: 'none',
      title: 'No room',
      devices: items.filter((item) => {
        const room = roomOf(item);
        return room === null || !known.has(room);
      }),
    },
  ];
  return groups.filter((group) => group.devices.length > 0);
}
