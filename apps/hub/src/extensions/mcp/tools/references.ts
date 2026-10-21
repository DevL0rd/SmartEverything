import type { McpPartName } from '@smarteverything/domain';
import { z } from 'zod';
import { deviceScopeOfActor, type Limited } from './person-reach';
import { ToolError } from './registry';
import { placedDevices, resolveNamed } from './targets';

type Args = Readonly<Record<string, unknown>>;

type Kind = 'device' | 'room' | 'group' | 'person';

const KIND_OF_FIELD: Readonly<Record<string, Kind>> = {
  deviceId: 'device',
  deviceIds: 'device',
  roomId: 'room',
  groupId: 'group',
  personId: 'person',
};

const TEXTS: Readonly<Record<Kind, string>> = {
  device: 'name or id (device_find lists both)',
  room: 'name or id (home_read lists rooms)',
  group: 'name or id (home_read lists device groups)',
  person: 'name or id (person_read lists people)',
};

const SUBJECT: Readonly<Record<Kind, string>> = {
  device: 'The device',
  room: 'The room',
  group: 'The device group',
  person: 'The person',
};

export const REFERENCE_FIELDS: Readonly<Partial<Record<McpPartName, readonly string[]>>> = {
  update_room: ['roomId'],
  remove_room: ['roomId'],
  create_device_group: ['deviceIds'],
  update_device_group: ['groupId', 'deviceIds'],
  remove_device_group: ['groupId'],
  update_device: ['deviceId', 'roomId'],
  update_camera: ['deviceId'],
  read_phone_context: ['personId'],
  read_phone_detail: ['deviceId'],
  phone_control: ['deviceId'],
  read_watch_config: ['deviceId'],
  read_watch_workout: ['deviceId'],
  watch_control: ['deviceId'],
  person_notify: ['personId'],
  call: ['personId'],
  presence_read: ['personId'],
  list_conversations: ['personId'],
  list_wakes: ['personId'],
  show_camera_in_call: ['deviceId'],
};

const ID = z.uuid();

function kindOf(field: string): Kind {
  const kind = KIND_OF_FIELD[field];
  if (kind === undefined) {
    throw new ToolError(`${field} is not a reference field`, 'internal');
  }
  return kind;
}

export const DEVICE_REFERENCE = z
  .string()
  .min(1)
  .max(200)
  .describe(`${SUBJECT.device}, by ${TEXTS.device}`);

export const DEVICE_REFERENCES = z
  .array(z.string().min(1).max(200))
  .min(1)
  .describe(`${SUBJECT.device}s, each by ${TEXTS.device}`);

export function referenceField(field: string, optional: boolean, nullable: boolean): z.ZodType {
  const kind = kindOf(field);
  const one = z.string().min(1).max(200);
  const described = field.endsWith('s')
    ? z.array(one).min(1).describe(`${SUBJECT[kind]}s, each by ${TEXTS[kind]}`)
    : one.describe(`${SUBJECT[kind]}, by ${TEXTS[kind]}`);
  const nulled = nullable ? described.nullable() : described;
  return optional ? nulled.optional() : nulled;
}

function idOf(context: Limited, kind: Kind, wanted: string): string {
  if (ID.safeParse(wanted).success) {
    return wanted;
  }
  const { store } = context;
  switch (kind) {
    case 'device':
      return resolveNamed(
        placedDevices(store, deviceScopeOfActor(context)),
        wanted,
        'device',
        {
          names: ({ name, device }) => [name, device.name, device.display_name],
          label: ({ name }) => name,
          id: ({ device }) => device.id,
        },
        'device_find',
      ).device.id;
    case 'room':
      return resolveNamed(
        store.rooms.list(),
        wanted,
        'room',
        { names: (row) => [row.name], label: (row) => row.name, id: (row) => row.id },
        'home_read',
      ).id;
    case 'group':
      return resolveNamed(
        store.deviceGroups.list(),
        wanted,
        'device group',
        { names: (row) => [row.name], label: (row) => row.name, id: (row) => row.id },
        'home_read',
      ).id;
    case 'person':
      return resolveNamed(
        store.profiles.list(),
        wanted,
        'person',
        { names: (row) => [row.name], label: (row) => row.name, id: (row) => row.id },
        'person_read',
      ).id;
  }
}

function resolvedValue(context: Limited, field: string, value: unknown): unknown {
  const kind = kindOf(field);
  if (typeof value === 'string') {
    return idOf(context, kind, value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? idOf(context, kind, entry) : entry));
  }
  return value;
}

export function resolveReferences(
  context: Limited,
  fields: readonly string[] | undefined,
  args: Args,
): Args {
  if (fields === undefined) {
    return args;
  }
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => [
      field,
      fields.includes(field) ? resolvedValue(context, field, value) : value,
    ]),
  );
}
