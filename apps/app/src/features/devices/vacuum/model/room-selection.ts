import type { VacuumRoom } from '@smarteverything/domain';

export type RoomSelection = readonly number[];

export type SelectableRoom = Pick<
  VacuumRoom,
  'id' | 'name' | 'colour' | 'floor' | 'areaM2' | 'hidden'
>;

export interface RoomChip {
  readonly id: number;
  readonly name: string;
  readonly colour: number;
  readonly floor: number;
  readonly areaM2: number;
  readonly selected: boolean;
  readonly order: number | null;
  readonly now: boolean;
  readonly label: string;
}

export const NO_SELECTION: RoomSelection = [];

export function toggleRoom(selection: RoomSelection, id: number): RoomSelection {
  return selection.includes(id) ? selection.filter((chosen) => chosen !== id) : [...selection, id];
}

export function orderOf(selection: RoomSelection, id: number): number | null {
  const index = selection.indexOf(id);
  return index < 0 ? null : index + 1;
}

export function pruneSelection(
  selection: RoomSelection,
  rooms: readonly SelectableRoom[],
): RoomSelection {
  const available = new Set(rooms.filter((room) => !room.hidden).map((room) => room.id));
  const kept = selection.filter((id) => available.has(id));
  return kept.length === selection.length ? selection : kept;
}

const SUFFIXES = ['th', 'st', 'nd', 'rd'] as const;

export function ordinal(order: number): string {
  const rest = order % 100;
  const suffix = rest >= 11 && rest <= 13 ? 'th' : (SUFFIXES[order % 10] ?? 'th');
  return `${String(order)}${suffix}`;
}

function chipLabel(room: SelectableRoom, order: number | null, now: boolean): string {
  const parts = [
    room.name,
    `${String(Math.round(room.areaM2))} square metres`,
    ...(order === null ? [] : ['selected', ordinal(order)]),
    ...(now ? ['robot is here'] : []),
  ];
  return parts.join(', ');
}

export function roomChips(
  rooms: readonly SelectableRoom[],
  selection: RoomSelection,
  currentRoomId: number | null,
): readonly RoomChip[] {
  return rooms
    .filter((room) => !room.hidden)
    .sort((left, right) => left.id - right.id)
    .map((room) => {
      const order = orderOf(selection, room.id);
      const now = room.id === currentRoomId;
      return {
        id: room.id,
        name: room.name,
        colour: room.colour,
        floor: room.floor,
        areaM2: room.areaM2,
        selected: order !== null,
        order,
        now,
        label: chipLabel(room, order, now),
      };
    });
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function startLabel(selectedRooms: number, drawnZones: number): string {
  if (drawnZones > 0) {
    return drawnZones === 1 ? 'Clean zone' : `Clean ${countOf(drawnZones, 'zone')}`;
  }
  return selectedRooms > 0 ? `Clean ${countOf(selectedRooms, 'room')}` : 'Start';
}
