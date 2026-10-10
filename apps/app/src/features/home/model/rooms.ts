import { deviceFamily, type DeviceFamily, type TableRow } from '@smarteverything/domain';
import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { deviceModelOf, isOffline, powerStateOf } from '../../devices';
import { orderedRooms } from '../../../store/table-rules';

type Room = TableRow<'rooms'>;

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly devices: number;
  readonly on: number;
  readonly offline: number;
  readonly members: readonly RoomMember[];
}

export interface RoomMember {
  readonly id: string;
  readonly family: DeviceFamily;
  readonly on: boolean;
}

const MEMBERS_SHOWN = 3;

function summaryOf(state: StoreState, room: Room, devices: readonly Device[]): RoomSummary {
  const powers = devices.map((device) =>
    powerStateOf(deviceModelOf(device), state.deviceValues[device.id] ?? {}),
  );
  return {
    id: room.id,
    name: room.name,
    devices: devices.length,
    on: powers.filter((power) => power === 'on').length,
    offline: devices.filter(isOffline).length,
    members: devices.slice(0, MEMBERS_SHOWN).map((device, index) => ({
      id: device.id,
      family: deviceFamily(device),
      on: powers[index] === 'on',
    })),
  };
}

export function roomSummaries(state: StoreState): readonly RoomSummary[] {
  const devices = rowsOf(state.tables.devices).filter((device) => !device.hidden);
  return orderedRooms(rowsOf(state.tables.rooms)).flatMap((room) => {
    const inRoom = devices.filter((device) => device.room_id === room.id);
    return inRoom.length === 0 ? [] : [summaryOf(state, room, inRoom)];
  });
}

const FIELDS: readonly (keyof RoomSummary)[] = ['id', 'name', 'devices', 'on', 'offline'];

function membersKey(room: RoomSummary): string {
  return room.members.map((member) => `${member.id}:${String(member.on)}`).join(',');
}

export function sameRooms(left: readonly RoomSummary[], right: readonly RoomSummary[]): boolean {
  return (
    left.length === right.length &&
    left.every((room, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        FIELDS.every((field) => other[field] === room[field]) &&
        membersKey(other) === membersKey(room)
      );
    })
  );
}
