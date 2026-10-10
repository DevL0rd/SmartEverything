import type { TableRow } from '@smarteverything/domain';
import { createRoom, placeRoom, renameRoom } from '../../../api/settings';
import { ValueStore } from '../../../design/external-store';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import { orderedRooms } from '../../../store/table-rules';

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
    save: (name) => createRoom(name, count),
  });
}

export function openRenameRoom(room: Room): void {
  roomEditor.set({
    title: 'Rename room',
    label: 'Room name',
    initial: room.name,
    placeholder: 'Room name',
    confirmLabel: 'Save',
    maxLength: ROOM_NAME_LENGTH,
    save: (name) => renameRoom(room.id, name),
  });
}

export async function reorderRooms(rooms: readonly Room[], keys: readonly string[]): Promise<void> {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  await Promise.all(
    keys.flatMap((roomId, position) =>
      byId.get(roomId)?.position === position ? [] : [placeRoom(roomId, position)],
    ),
  );
}

export function moveRoom(rooms: readonly Room[], roomId: string, offset: -1 | 1): Promise<void> {
  const keys = orderedRooms(rooms).map((room) => room.id);
  const from = keys.indexOf(roomId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= keys.length) {
    return Promise.resolve();
  }
  keys.splice(from, 1);
  keys.splice(to, 0, roomId);
  return reorderRooms(rooms, keys);
}
