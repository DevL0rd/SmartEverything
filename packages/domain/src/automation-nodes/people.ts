import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type NodeKind } from './define';
import { DEVICE_REF } from './devices';

const PERSON = { t: 'ref', of: 'person' } as const;
const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const INTEGER: FlowType = { t: 'number', integer: true };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };

const deviceQuery = defineNodeKind({
  id: 'device.query',
  name: 'Find devices',
  category: 'devices',
  icon: 'scan-search',
  class: 'read',
  description:
    'Lists the devices that match a room, group, family, role, label or control test. New devices are included automatically.',
  inputs: [
    {
      name: 'room',
      type: { t: 'optional', of: { t: 'ref', of: 'room' } },
      required: false,
      description: 'Limit to a room.',
      summary: true,
    },
    {
      name: 'group',
      type: { t: 'optional', of: { t: 'ref', of: 'group' } },
      required: false,
      description: 'Limit to a group.',
    },
    {
      name: 'families',
      type: { t: 'list', of: TEXT },
      required: false,
      static: true,
      description: 'Device families to include.',
    },
    {
      name: 'roles',
      type: { t: 'list', of: TEXT },
      required: false,
      static: true,
      description: 'Device roles to include.',
    },
    {
      name: 'labels',
      type: { t: 'list', of: TEXT },
      required: false,
      static: true,
      description: 'Labels the device must have.',
    },
    {
      name: 'where',
      type: BOOLEAN,
      required: false,
      live: true,
      description: 'A control test each device must pass.',
    },
    {
      name: 'availableOnly',
      type: BOOLEAN,
      required: false,
      default: false,
      static: true,
      description: 'Leave out unreachable devices.',
    },
  ],
  outputs: [
    { name: 'devices', type: DEVICE_LIST, description: 'The matching devices.' },
    { name: 'count', type: INTEGER, description: 'How many matched.' },
  ],
  exits: [],
  summary: 'Devices in {room}',
  keywords: ['list', 'search', 'lights', 'filter'],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1',
});

const deviceHealth = defineNodeKind({
  id: 'device.health',
  name: 'Device status',
  category: 'devices',
  icon: 'battery-medium',
  class: 'read',
  description:
    'Reads whether a device is online, its battery level, when it was last seen and its provider.',
  inputs: [
    {
      name: 'device',
      type: DEVICE_REF,
      required: true,
      description: 'Which device.',
      summary: true,
    },
  ],
  outputs: [
    { name: 'online', type: BOOLEAN, description: 'Whether the device is reachable.' },
    {
      name: 'battery',
      type: { t: 'number', min: 0, max: 100, unit: '%' },
      optional: true,
      description: 'Battery percentage, when the device has one.',
    },
    {
      name: 'lastSeen',
      type: { t: 'instant' },
      optional: true,
      description: 'When the hub last heard from it.',
    },
    { name: 'provider', type: TEXT, description: 'Which provider runs the device.' },
  ],
  exits: [],
  summary: 'Status of {device}',
  keywords: ['battery', 'online', 'offline', 'reachable', 'health'],
  reads: () => ['device:status'],
  access: 'member',
  tier: 'v1',
});

const roomInfo = defineNodeKind({
  id: 'room.info',
  name: 'Room',
  category: 'devices',
  icon: 'house',
  class: 'read',
  description:
    'Reads a room: its devices, whether it is occupied, temperature, humidity and how many lights are on.',
  inputs: [
    {
      name: 'room',
      type: { t: 'ref', of: 'room' },
      required: true,
      description: 'Which room.',
      summary: true,
    },
  ],
  outputs: [
    { name: 'devices', type: DEVICE_LIST, description: 'Devices in the room.' },
    {
      name: 'occupied',
      type: BOOLEAN,
      optional: true,
      description: 'Whether anyone is in the room.',
    },
    {
      name: 'temperature',
      type: { t: 'number', unit: 'C' },
      optional: true,
      description: 'Room temperature.',
    },
    {
      name: 'humidity',
      type: { t: 'number', unit: '%' },
      optional: true,
      description: 'Room humidity.',
    },
    { name: 'lightsOn', type: INTEGER, description: 'How many lights are on.' },
  ],
  exits: [],
  summary: 'Info about {room}',
  keywords: ['room', 'occupied', 'humidity', 'temperature', 'lights'],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1',
});

const groupMembers = defineNodeKind({
  id: 'group.members',
  name: 'Group members',
  category: 'devices',
  icon: 'boxes',
  class: 'read',
  description: 'Lists the devices in a group.',
  inputs: [
    {
      name: 'group',
      type: { t: 'ref', of: 'group' },
      required: true,
      description: 'Which group.',
      summary: true,
    },
  ],
  outputs: [{ name: 'devices', type: DEVICE_LIST, description: 'The devices in the group.' }],
  exits: [],
  summary: 'Members of {group}',
  keywords: ['group', 'members', 'devices'],
  reads: () => ['group'],
  access: 'member',
  tier: 'v1',
});

const presencePerson = defineNodeKind({
  id: 'presence.person',
  name: 'Person',
  category: 'people',
  icon: 'user-round',
  class: 'read',
  description:
    'Reads whether a person is home, the place they are at and since when, from place and router signals.',
  inputs: [
    { name: 'person', type: PERSON, required: true, description: 'Which person.', summary: true },
  ],
  outputs: [
    { name: 'isHome', type: { t: 'boolean' }, description: 'Whether the person is home.' },
    {
      name: 'place',
      type: { t: 'optional', of: { t: 'text' } },
      optional: true,
      description: 'The place they are at.',
    },
    {
      name: 'since',
      type: { t: 'instant' },
      optional: true,
      description: 'Since when they have been there.',
    },
  ],
  exits: [],
  summary: 'Is {person} home',
  keywords: ['home', 'away', 'presence', 'arrive', 'leave', 'person'],
  reads: () => ['presence'],
  access: 'member',
  tier: 'v1',
});

const presenceWhoHome = defineNodeKind({
  id: 'presence.who_home',
  name: 'Who is home',
  category: 'people',
  icon: 'users-round',
  class: 'read',
  description: 'Lists the people who are home, how many, and whether anyone is.',
  inputs: [
    {
      name: 'includeGuests',
      type: { t: 'boolean' },
      required: false,
      default: false,
      static: true,
      description: 'Count guests as well.',
      summary: true,
    },
  ],
  outputs: [
    { name: 'people', type: { t: 'list', of: PERSON }, description: 'The people at home.' },
    { name: 'count', type: { t: 'number', integer: true }, description: 'How many are home.' },
    { name: 'anyone', type: { t: 'boolean' }, description: 'Whether at least one person is home.' },
  ],
  exits: [],
  summary: 'Who is home',
  keywords: ['nobody', 'anyone', 'everyone', 'home', 'presence', 'guests'],
  reads: () => ['presence'],
  access: 'member',
  tier: 'v1',
});

export const PEOPLE_NODE_KINDS: readonly NodeKind[] = [presencePerson, presenceWhoHome];

export const HOME_STRUCTURE_NODE_KINDS: readonly NodeKind[] = [
  deviceQuery,
  deviceHealth,
  roomInfo,
  groupMembers,
];
