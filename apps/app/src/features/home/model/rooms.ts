import type { DeviceFamily, TableRow } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { deviceValuesOf, rowsOf, type StoreState } from '../../../store/state';
import { isOffline, powerStateOf, type DeviceModel } from '../../devices';
import { homeDeviceModels } from './devices';
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

function summaryOf(state: StoreState, room: Room, models: readonly DeviceModel[]): RoomSummary {
  const powers = models.map((model) => powerStateOf(model, deviceValuesOf(state, model.device.id)));
  return {
    id: room.id,
    name: room.name,
    devices: models.length,
    on: powers.filter((power) => power === 'on').length,
    offline: models.filter((model) => isOffline(model.device)).length,
    members: models.slice(0, MEMBERS_SHOWN).map((model, index) => ({
      id: model.device.id,
      family: model.family,
      on: powers[index] === 'on',
    })),
  };
}

interface RoomDevices {
  readonly room: Room;
  readonly models: readonly DeviceModel[];
}

const roomDevices = memoOnInputs(
  (state) => [state.tables.devices, state.tables.rooms],
  (state): readonly RoomDevices[] => {
    const models = homeDeviceModels(state);
    return orderedRooms(rowsOf(state.tables.rooms)).flatMap((room) => {
      const members = models.filter((model) => model.device.room_id === room.id);
      return members.length === 0 ? [] : [{ room, models: members }];
    });
  },
);

export const roomSummaries = memoOnInputs(
  (state) => [state.tables.devices, state.tables.rooms, state.deviceValues, state.ledger],
  (state): readonly RoomSummary[] =>
    roomDevices(state).map(({ room, models }) => summaryOf(state, room, models)),
);

const FIELDS: readonly (keyof RoomSummary)[] = ['id', 'name', 'devices', 'on', 'offline'];

function membersKey(room: RoomSummary): string {
  return room.members.map((member) => `${member.id}:${String(member.on)}`).join(',');
}

export function sameRoom(left: RoomSummary, right: RoomSummary): boolean {
  return (
    FIELDS.every((field) => left[field] === right[field]) && membersKey(left) === membersKey(right)
  );
}

export function sameRooms(left: readonly RoomSummary[], right: readonly RoomSummary[]): boolean {
  return (
    left.length === right.length &&
    left.every((room, index) => {
      const other = right[index];
      return other !== undefined && sameRoom(other, room);
    })
  );
}
