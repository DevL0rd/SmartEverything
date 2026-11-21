import type { TableRow } from '@smarteverything/domain';
import { removeRoom, renameRoom } from '../api/settings';
import type { EntityStore } from './entity-store';
import { liveRowEdit, writeOptimistically } from './optimistic';

type Room = TableRow<'rooms'>;

export function renameRoomShown(store: EntityStore, room: Room, name: string): Promise<void> {
  return writeOptimistically(store, {
    event: 'room.rename',
    edits: [liveRowEdit('rooms', room.id, room, { ...room, name })],
    send: () => renameRoom(room.id, name),
    fields: { roomId: room.id },
  });
}

export function removeRoomShown(store: EntityStore, room: Room, devices: number): Promise<void> {
  return writeOptimistically(store, {
    event: 'room.delete',
    edits: [liveRowEdit('rooms', room.id, room, null)],
    send: () => removeRoom(room.id),
    fields: { roomId: room.id, devices },
  });
}
