import type { FlowType } from '../automation-v3/types';
import { humanizeEnum } from '../presentation/humanize';
import { VACUUM_CLEANING_READINGS } from '../vacuum-status';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';
import { VACUUM_REF, VACUUM_TRIGGER_KINDS } from './triggers-vacuum';

const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const ROOM_LIST: FlowType = { t: 'list', of: { t: 'ref', of: 'room' } };
const PERCENT: FlowType = { t: 'number', min: 0, max: 100, unit: '%' };

const STATE_CHOICE: FlowType = {
  t: 'choice',
  options: VACUUM_CLEANING_READINGS.map((id) => ({ id, label: humanizeEnum(id) })),
};

export const VACUUM_COMMAND_CHOICES = [
  { id: 'start', label: 'Start cleaning' },
  { id: 'pause', label: 'Pause' },
  { id: 'resume', label: 'Resume' },
  { id: 'stop', label: 'Stop' },
  { id: 'dock', label: 'Return to the dock' },
  { id: 'spot', label: 'Spot clean' },
] as const;

export const VACUUM_STATION_CHOICES = [
  { id: 'empty_dust', label: 'Empty the dust bin' },
  { id: 'wash_mop', label: 'Wash the mop' },
  { id: 'stop_wash', label: 'Stop washing the mop' },
  { id: 'back_wash', label: 'Go back to wash the mop' },
  { id: 'dry_mop', label: 'Dry the mop' },
  { id: 'stop_dry', label: 'Stop drying the mop' },
  { id: 'eject', label: 'Eject the mop' },
  { id: 'clean_station', label: 'Clean the station' },
  { id: 'empty_station_tank', label: 'Empty the station water tank' },
  { id: 'empty_host_tank', label: 'Empty the robot water tank' },
  { id: 'start_roller_wash', label: 'Wash the roller mop' },
  { id: 'stop_roller_wash', label: 'Stop washing the roller mop' },
  { id: 'start_water_check', label: 'Check the water' },
  { id: 'cancel_water_check', label: 'Cancel the water check' },
] as const;

export const VACUUM_CLEAN_MODE_CHOICES = [
  { id: 'sweep', label: 'Vacuum only' },
  { id: 'sweep_mop', label: 'Vacuum and mop together' },
  { id: 'sweep_then_mop', label: 'Vacuum, then mop' },
] as const;

export const VACUUM_SUCTION_CHOICES = [
  { id: 'silent', label: 'Quiet' },
  { id: 'standard', label: 'Standard' },
  { id: 'strong', label: 'Strong' },
  { id: 'turbo', label: 'Turbo' },
] as const;

export const VACUUM_WATER_CHOICES = [
  { id: 'off', label: 'No water' },
  { id: 'level_1', label: 'Low' },
  { id: 'level_2', label: 'Medium' },
  { id: 'level_3', label: 'High' },
] as const;

export const VACUUM_PASSES_MAX = 3;

const VACUUM_INPUT: InputPortDecl = {
  name: 'vacuum',
  type: VACUUM_REF,
  required: true,
  description: 'Which robot vacuum.',
  summary: true,
};

const SENT_OUTPUT: OutputPortDecl = {
  name: 'ok',
  type: BOOLEAN,
  description: 'Whether the command was sent to the robot.',
};

const vacuumCommand = defineNodeKind({
  id: 'vacuum.command',
  name: 'Control vacuum',
  category: 'devices',
  icon: 'vacuum',
  class: 'effect',
  description:
    'Starts, pauses, resumes or stops a robot vacuum, sends it back to its dock, or starts a spot clean.',
  inputs: [
    VACUUM_INPUT,
    {
      name: 'action',
      type: { t: 'choice', options: [...VACUUM_COMMAND_CHOICES] },
      required: true,
      static: true,
      description: 'What the robot should do.',
      summary: true,
      ui: { label: 'Action' },
    },
  ],
  outputs: [SENT_OUTPUT, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Tell {vacuum} to {action}',
  keywords: [
    'vacuum',
    'robot',
    'clean',
    'start',
    'pause',
    'resume',
    'stop',
    'dock',
    'charge',
    'spot',
    'hoover',
  ],
  access: 'member',
  tier: 'v1.1',
});

const vacuumStation = defineNodeKind({
  id: 'vacuum.station',
  name: 'Use vacuum station',
  category: 'devices',
  icon: 'droplet',
  class: 'effect',
  description:
    'Runs a job of the dock station of a robot vacuum, such as emptying the dust bin, washing or drying the mop, cleaning the station or emptying its water tanks.',
  inputs: [
    VACUUM_INPUT,
    {
      name: 'action',
      type: { t: 'choice', options: [...VACUUM_STATION_CHOICES] },
      required: true,
      static: true,
      description: 'Which station job to run.',
      summary: true,
      ui: { label: 'Station job' },
    },
  ],
  outputs: [SENT_OUTPUT, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Station of {vacuum}: {action}',
  keywords: [
    'vacuum',
    'robot',
    'station',
    'dock',
    'dust',
    'bin',
    'mop',
    'wash',
    'dry',
    'tank',
    'roller',
    'water',
  ],
  access: 'member',
  tier: 'v1.1',
});

const vacuumCleanRooms = defineNodeKind({
  id: 'vacuum.clean_rooms',
  name: 'Clean rooms',
  category: 'devices',
  icon: 'vacuum',
  class: 'effect',
  description:
    'Sends a robot vacuum to clean the chosen rooms of the home. Each home room is matched to the room of the robot map it is linked to on the vacuum page. Rooms that are not linked are left out and listed, never guessed. Cleaning mode, suction, mop water and passes are optional; what is left empty stays as the robot has it.',
  inputs: [
    VACUUM_INPUT,
    {
      name: 'rooms',
      type: ROOM_LIST,
      required: true,
      static: true,
      description: 'The rooms of the home to clean.',
      summary: true,
      ui: { label: 'Rooms', optionsFrom: 'vacuum.rooms', multiple: true },
    },
    {
      name: 'mode',
      type: { t: 'choice', options: [...VACUUM_CLEAN_MODE_CHOICES] },
      required: false,
      static: true,
      description: 'Whether to vacuum, mop or both.',
      ui: { label: 'Cleaning mode' },
    },
    {
      name: 'suction',
      type: { t: 'choice', options: [...VACUUM_SUCTION_CHOICES] },
      required: false,
      static: true,
      description: 'How strongly the robot sucks.',
      ui: { label: 'Suction' },
    },
    {
      name: 'water',
      type: { t: 'choice', options: [...VACUUM_WATER_CHOICES] },
      required: false,
      static: true,
      description: 'How much water the mop gets.',
      ui: { label: 'Mop water' },
    },
    {
      name: 'passes',
      type: { t: 'number', integer: true, min: 1, max: VACUUM_PASSES_MAX },
      required: false,
      live: true,
      description: 'How many times each room is cleaned.',
      ui: { label: 'Passes', min: 1, max: VACUUM_PASSES_MAX, step: 1 },
    },
  ],
  outputs: [
    { name: 'started', type: BOOLEAN, description: 'Whether the robot was sent to clean.' },
    {
      name: 'rooms',
      type: ROOM_LIST,
      description: 'The rooms the robot was sent to.',
    },
    {
      name: 'unlinkedRooms',
      type: ROOM_LIST,
      description: 'Rooms left out because they are not linked to a room of the robot map.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Clean {rooms} with {vacuum}',
  keywords: [
    'vacuum',
    'robot',
    'clean',
    'rooms',
    'room',
    'mop',
    'suction',
    'water',
    'passes',
    'sweep',
    'hoover',
  ],
  access: 'member',
  tier: 'v1.1',
});

const vacuumRead = defineNodeKind({
  id: 'vacuum.read',
  name: 'Vacuum status',
  category: 'devices',
  icon: 'vacuum',
  class: 'read',
  description:
    'Reads a robot vacuum: what it is doing, the rooms of the home it is cleaning right now, its battery, the problem it reports, whether it sits on its dock and how much life is left in each part. Rooms of the robot map that are not linked to a room of the home are left out. A value the robot has not reported is left empty.',
  inputs: [VACUUM_INPUT],
  outputs: [
    {
      name: 'state',
      type: STATE_CHOICE,
      optional: true,
      description: 'What the robot is doing: cleaning, returning, charging, in error and so on.',
    },
    {
      name: 'cleaningRooms',
      type: ROOM_LIST,
      optional: true,
      description:
        'The rooms of the home the robot is cleaning right now. Empty when it is not on a job.',
    },
    {
      name: 'battery',
      type: PERCENT,
      optional: true,
      description: 'How much charge is left.',
    },
    {
      name: 'fault',
      type: TEXT,
      optional: true,
      description: 'The problem the robot reports. Empty when it reports none.',
    },
    {
      name: 'docked',
      type: BOOLEAN,
      optional: true,
      description: 'Whether the robot sits on its dock.',
    },
    {
      name: 'consumables',
      type: { t: 'record', values: PERCENT },
      optional: true,
      description:
        'How much life is left in each part, in percent, by part: main_brush, side_brush, filter, mop, roller, detergent and dust_bag. Parts the robot does not report are left out.',
    },
  ],
  exits: [],
  summary: 'Status of {vacuum}',
  keywords: [
    'vacuum',
    'robot',
    'hoover',
    'status',
    'state',
    'battery',
    'fault',
    'error',
    'docked',
    'dock',
    'cleaning',
    'rooms',
    'consumables',
    'brush',
    'filter',
    'mop',
  ],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1.1',
});

export const VACUUM_KINDS: readonly NodeKind[] = [
  vacuumCommand,
  vacuumStation,
  vacuumCleanRooms,
  vacuumRead,
  ...VACUUM_TRIGGER_KINDS,
];
