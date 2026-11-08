import type { FlowType } from '../automation-v3/types';
import {
  LAUNDRY_PHASES,
  LAUNDRY_PHASE_WORDS,
  LAUNDRY_STATUSES,
  LAUNDRY_STATUS_OPTIONS,
} from '../laundry';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };

const LAUNDRY_REF: FlowType = { t: 'ref', of: 'device', families: ['laundry'] };

const MILLISECONDS_PER_MINUTE = 60_000;

export const LAUNDRY_DELAY_MAX_MINUTES = 2880;

export const LAUNDRY_TEMPERATURE_CHOICES = [
  { id: '0', label: 'Cold' },
  { id: '20', label: '20 °C' },
  { id: '30', label: '30 °C' },
  { id: '40', label: '40 °C' },
  { id: '60', label: '60 °C' },
  { id: '90', label: '90 °C' },
] as const;

export const LAUNDRY_SPIN_CHOICES = [
  { id: '0', label: 'No spin' },
  { id: '400', label: '400 rpm' },
  { id: '600', label: '600 rpm' },
  { id: '800', label: '800 rpm' },
  { id: '1000', label: '1000 rpm' },
  { id: '1200', label: '1200 rpm' },
  { id: '1400', label: '1400 rpm' },
] as const;

export const LAUNDRY_DELAY_MODE_CHOICES = [
  { id: 'Start Wash', label: 'Start after the delay' },
  { id: 'Finish Wash', label: 'Finish after the delay' },
] as const;

export const LAUNDRY_CONTROL_CHOICES = [
  { id: 'pause', label: 'Pause' },
  { id: 'stop', label: 'Stop' },
] as const;

const STATUS_CHOICE: FlowType = {
  t: 'choice',
  options: LAUNDRY_STATUSES.map((id) => ({ id, label: LAUNDRY_STATUS_OPTIONS[id] ?? id })),
};

const PHASE_CHOICE: FlowType = {
  t: 'choice',
  options: LAUNDRY_PHASES.map((id) => ({ id, label: LAUNDRY_PHASE_WORDS[id] })),
};

const MACHINE_INPUT: InputPortDecl = {
  name: 'machine',
  type: LAUNDRY_REF,
  required: true,
  description: 'Which washing machine or dryer.',
  summary: true,
  ui: { label: 'Machine' },
};

const laundryStart = defineNodeKind({
  id: 'laundry.start',
  name: 'Start laundry',
  category: 'devices',
  icon: 'washer',
  class: 'effect',
  description:
    'Starts a wash or dry cycle on a washing machine or dryer: sets the program, optionally the temperature, spin speed and a delay, then presses start. The program is picked from the programs the machine offers; options a program does not use are listed in the ignored output instead of being sent. The machine must be online, switched on for remote control, have its door closed and report no fault, otherwise nothing is sent and the node fails with the reason. Each setting is confirmed by the machine before the next one, so the start is only pressed when everything before it was accepted.',
  inputs: [
    MACHINE_INPUT,
    {
      name: 'program',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which program to run.',
      summary: true,
      ui: { label: 'Program', optionsFrom: 'laundry.programs' },
    },
    {
      name: 'temperature',
      type: { t: 'choice', options: [...LAUNDRY_TEMPERATURE_CHOICES] },
      required: false,
      static: true,
      description: 'Wash temperature. Leave empty to keep what the machine has set.',
      ui: { label: 'Temperature' },
    },
    {
      name: 'spin',
      type: { t: 'choice', options: [...LAUNDRY_SPIN_CHOICES] },
      required: false,
      static: true,
      description: 'Spin speed. Leave empty to keep what the machine has set.',
      ui: { label: 'Spin speed' },
    },
    {
      name: 'delay',
      type: { t: 'duration' },
      required: false,
      live: true,
      description:
        'Delay in whole minutes, up to the 48 hours the machine allows. Leave empty to run now.',
      summary: true,
      ui: {
        label: 'Delay',
        unit: 'ms',
        min: MILLISECONDS_PER_MINUTE,
        max: LAUNDRY_DELAY_MAX_MINUTES * MILLISECONDS_PER_MINUTE,
      },
    },
    {
      name: 'delayMode',
      type: { t: 'choice', options: [...LAUNDRY_DELAY_MODE_CHOICES] },
      required: false,
      default: 'Start Wash',
      static: true,
      description: 'Whether the delay is the time until the cycle starts or until it finishes.',
      ui: { label: 'The delay is until' },
    },
  ],
  outputs: [
    { name: 'ok', type: BOOLEAN, description: 'Whether the cycle was started.' },
    {
      name: 'ignored',
      type: { t: 'list', of: TEXT },
      description: 'Options the program does not use, so they were not sent.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Start {program} on {machine}',
  keywords: [
    'laundry',
    'washer',
    'washing machine',
    'dryer',
    'wash',
    'dry',
    'cycle',
    'program',
    'start',
    'temperature',
    'spin',
    'delay',
    'clothes',
  ],
  access: 'member',
  tier: 'v1.1',
});

const laundryControl = defineNodeKind({
  id: 'laundry.control',
  name: 'Control laundry',
  category: 'devices',
  icon: 'washer',
  class: 'effect',
  description: 'Pauses or stops the cycle running on a washing machine or dryer.',
  inputs: [
    MACHINE_INPUT,
    {
      name: 'action',
      type: { t: 'choice', options: [...LAUNDRY_CONTROL_CHOICES] },
      required: true,
      static: true,
      description: 'What the machine should do.',
      summary: true,
      ui: { label: 'Action' },
    },
  ],
  outputs: [
    { name: 'ok', type: BOOLEAN, description: 'Whether the command was sent to the machine.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Tell {machine} to {action}',
  keywords: ['laundry', 'washer', 'washing machine', 'dryer', 'pause', 'stop', 'cancel', 'cycle'],
  access: 'member',
  tier: 'v1.1',
});

const READ_OUTPUTS: readonly OutputPortDecl[] = [
  {
    name: 'status',
    type: STATUS_CHOICE,
    optional: true,
    description: 'What the machine reports: off, ready, paused, running, delayed or done.',
  },
  {
    name: 'phase',
    type: PHASE_CHOICE,
    optional: true,
    description: 'Where the cycle is: washing, rinsing, spinning, drying and so on.',
  },
  {
    name: 'remaining',
    type: { t: 'duration' },
    optional: true,
    description: 'How long the cycle still has to run.',
  },
  {
    name: 'doorOpen',
    type: BOOLEAN,
    optional: true,
    description: 'Whether the door is open.',
  },
];

const laundryRead = defineNodeKind({
  id: 'laundry.read',
  name: 'Laundry status',
  category: 'devices',
  icon: 'washer',
  class: 'read',
  description:
    'Reads a washing machine or dryer: its status, the phase of the running cycle, the time left and whether the door is open. A value the machine has not reported is left empty.',
  inputs: [MACHINE_INPUT],
  outputs: READ_OUTPUTS,
  exits: [],
  summary: 'Status of {machine}',
  keywords: [
    'laundry',
    'washer',
    'washing machine',
    'dryer',
    'status',
    'phase',
    'time left',
    'remaining',
    'door',
    'finished',
  ],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1.1',
});

export const LAUNDRY_KINDS: readonly NodeKind[] = [laundryStart, laundryControl, laundryRead];
