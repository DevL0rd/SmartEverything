import {
  roomLightsTarget,
  type DeviceFamily,
  type DeviceTarget,
  type TableRow,
} from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf } from '../../../store/state';
import { isOffline, powerStateOf, type DeviceModel, type PowerState } from '../../devices';
import { DeviceFold, type Fold } from './device-fold';
import { homeDeviceModels } from './devices';
import { orderedRooms } from '../../../store/table-rules';

type Room = TableRow<'rooms'>;

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly devices: number;
  readonly on: number;
  readonly offline: number;
  readonly lights: number;
  readonly lightsOn: number;
  readonly members: readonly RoomMember[];
}

export interface RoomMember {
  readonly id: string;
  readonly family: DeviceFamily;
  readonly on: boolean;
}

const MEMBERS_SHOWN = 3;

interface RoomDevices {
  readonly room: Room;
  readonly models: readonly DeviceModel[];
}

interface RoomLayout {
  readonly groups: readonly RoomDevices[];
  readonly groupOf: ReadonlyMap<string, number>;
}

const roomLayout = memoOnInputs(
  (state) => [state.tables.devices, state.tables.rooms],
  (state): RoomLayout => {
    const models = homeDeviceModels(state);
    const groups = orderedRooms(rowsOf(state.tables.rooms)).flatMap((room) => {
      const members = models.filter((model) => model.device.room_id === room.id);
      return members.length === 0 ? [] : [{ room, models: members }];
    });
    const groupOf = new Map<string, number>();
    groups.forEach((group, index) => {
      group.models.forEach((model) => groupOf.set(model.device.id, index));
    });
    return { groups, groupOf };
  },
);

const powers = new DeviceFold<PowerState>({
  models: (state): readonly DeviceModel[] => homeDeviceModels(state),
  includes: (): boolean => true,
  usesValues: (model): boolean => model.power !== null,
  projected: true,
  contribution: powerStateOf,
});

function summaryOf({ room, models }: RoomDevices, powerOf: Fold<PowerState>): RoomSummary {
  const states = models.map((model) => powerOf.valueOf(model.device.id));
  const lightPowers = models.flatMap((model, index) =>
    model.family === 'light' ? [states[index]] : [],
  );
  return {
    id: room.id,
    name: room.name,
    devices: models.length,
    on: states.filter((power) => power === 'on').length,
    offline: models.filter((model) => isOffline(model.device)).length,
    lights: lightPowers.length,
    lightsOn: lightPowers.filter((power) => power === 'on').length,
    members: models.slice(0, MEMBERS_SHOWN).map((model, index) => ({
      id: model.device.id,
      family: model.family,
      on: states[index] === 'on',
    })),
  };
}

function dirtyGroups(layout: RoomLayout, changed: ReadonlySet<string>): ReadonlySet<number> {
  const dirty = new Set<number>();
  for (const id of changed) {
    const group = layout.groupOf.get(id);
    if (group !== undefined) dirty.add(group);
  }
  return dirty;
}

interface Summarised {
  readonly layout: RoomLayout;
  readonly summaries: readonly RoomSummary[];
}

function summarise(
  layout: RoomLayout,
  powerOf: Fold<PowerState>,
  previous: Summarised | null,
): Summarised {
  const dirty =
    previous?.layout === layout && powerOf.changed !== null
      ? dirtyGroups(layout, powerOf.changed)
      : null;
  const summaries = layout.groups.map((group, index) => {
    const old = previous?.summaries[index];
    if (old !== undefined && dirty !== null && !dirty.has(index)) return old;
    const next = summaryOf(group, powerOf);
    return old !== undefined && sameRoom(old, next) ? old : next;
  });
  const kept =
    previous !== null &&
    summaries.length === previous.summaries.length &&
    summaries.every((summary, index) => summary === previous.summaries[index]);
  return { layout, summaries: kept ? previous.summaries : summaries };
}

let summarised: Summarised | null = null;

export const roomSummaries = memoOnInputs(
  (state) => [roomLayout(state), powers.read(state)],
  (state): readonly RoomSummary[] => {
    summarised = summarise(roomLayout(state), powers.read(state), summarised);
    return summarised.summaries;
  },
);

const FIELDS: readonly (keyof RoomSummary)[] = [
  'id',
  'name',
  'devices',
  'on',
  'offline',
  'lights',
  'lightsOn',
];

function sameMembers(left: readonly RoomMember[], right: readonly RoomMember[]): boolean {
  return (
    left.length === right.length &&
    left.every((member, index) => {
      const other = right[index];
      return member.id === other?.id && member.on === other.on;
    })
  );
}

export function sameRoom(left: RoomSummary, right: RoomSummary): boolean {
  return (
    FIELDS.every((field) => left[field] === right[field]) &&
    sameMembers(left.members, right.members)
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

export interface LightsToggle {
  readonly label: string;
  readonly failure: string;
  readonly target: DeviceTarget;
  readonly on: boolean;
}

export function lightsToggleOf(room: RoomSummary): LightsToggle | null {
  if (room.lights === 0) {
    return null;
  }
  const on = room.lightsOn === 0;
  return {
    label: `${on ? 'Turn on' : 'Turn off'} lights in ${room.name}`,
    target: roomLightsTarget(room.id),
    failure: `The lights in ${room.name} weren’t changed`,
    on,
  };
}
