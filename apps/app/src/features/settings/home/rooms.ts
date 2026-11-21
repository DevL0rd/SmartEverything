import type { TableRow } from '@smarteverything/domain';
import { createRoom, placeRoom } from '../../../api/settings';
import { ValueStore } from '../../../design/external-store';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import type { EntityStore } from '../../../store/entity-store';
import { composed, liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { renameRoomShown } from '../../../store/room-writes';
import { orderedRooms } from '../../../store/table-rules';
import { trackSetting } from '../settings-log';

type Room = TableRow<'rooms'>;

const ROOM_NAME_LENGTH = 60;

export const roomEditor = new ValueStore<TextEditRequest | null>(null);

export function openAddRoom(count: number): void {
  roomEditor.set({
    title: 'Add a room',
    label: 'Room name',
    initial: '',
    placeholder: 'Room name',
    confirmLabel: 'Add',
    maxLength: ROOM_NAME_LENGTH,
    save: async (name) => {
      await trackSetting('room.create', { rooms: count }, () => createRoom(name, count));
    },
  });
}

export function openRenameRoom(store: EntityStore, room: Room): void {
  roomEditor.set({
    title: 'Rename room',
    label: 'Room name',
    initial: room.name,
    placeholder: 'Room name',
    confirmLabel: 'Save',
    maxLength: ROOM_NAME_LENGTH,
    save: (name) => renameRoomShown(store, room, name),
  });
}

function placed(
  rooms: readonly Room[],
  keys: readonly string[],
): readonly (readonly [Room, number])[] {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  return [...keys.entries()].flatMap(([position, roomId]) => {
    const room = byId.get(roomId);
    return room === undefined || room.position === position ? [] : [[room, position] as const];
  });
}

export async function reorderRooms(
  store: EntityStore,
  rooms: readonly Room[],
  keys: readonly string[],
): Promise<void> {
  const moves = placed(rooms, keys);
  const edits = moves.map(([room, position]) =>
    liveRowEdit('rooms', room.id, room, { ...room, position }),
  );
  store.update(composed(edits).apply);
  for (const [index, [room, position]] of moves.entries()) {
    try {
      await writeOptimistically(store, {
        event: 'room.place',
        edits: [],
        send: () => placeRoom(room.id, position),
        fields: {
          roomId: room.id,
          position,
        },
      });
    } catch (error) {
      store.update(composed(edits.slice(index)).revert);
      throw error;
    }
  }
}

export function moveRoom(
  store: EntityStore,
  rooms: readonly Room[],
  roomId: string,
  offset: -1 | 1,
): Promise<void> {
  const keys = orderedRooms(rooms).map((room) => room.id);
  const from = keys.indexOf(roomId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= keys.length) {
    return Promise.resolve();
  }
  keys.splice(from, 1);
  keys.splice(to, 0, roomId);
  return reorderRooms(store, rooms, keys);
}
