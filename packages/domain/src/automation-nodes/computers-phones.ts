import { PHONE_RINGER_MODES } from '../phones';
import { POWER_ACTIONS } from '../node/node-requests';
import { defineNodeKind, type NodeKind, type OutputPortDecl } from './define';

function reading(name: string, type: OutputPortDecl['type'], description: string): OutputPortDecl {
  return { name, type, optional: true, description };
}

const CHANGE = { t: 'record', values: { t: 'any' } } as const;

export const COMPUTER_AUDIO = defineNodeKind({
  id: 'computer.audio',
  name: 'Computer sound',
  category: 'computers',
  icon: 'speaker',
  class: 'effect',
  description:
    'Changes the volume, mute, default device, or an app volume, mute or output on a computer.',
  inputs: [
    {
      name: 'computer',
      type: { t: 'ref', of: 'computer' },
      required: true,
      description: 'Which computer.',
      summary: true,
    },
    {
      name: 'change',
      type: CHANGE,
      required: true,
      static: true,
      description: 'What to change: an action with its options.',
      summary: true,
      ui: { editor: 'computer-audio-change' },
    },
  ],
  outputs: [{ name: 'ok', type: { t: 'boolean' }, description: 'Whether the change was made.' }],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Change the sound on {computer}',
  keywords: ['volume', 'mute', 'audio', 'speaker', 'output'],
  access: 'member',
  tier: 'v1',
});

export const COMPUTER_DISPLAY = defineNodeKind({
  id: 'computer.display',
  name: 'Computer screen',
  category: 'computers',
  icon: 'monitor',
  class: 'effect',
  description: 'Changes the mode, scale, position, brightness or night light of a computer screen.',
  inputs: [
    {
      name: 'computer',
      type: { t: 'ref', of: 'computer' },
      required: true,
      description: 'Which computer.',
      summary: true,
    },
    {
      name: 'change',
      type: CHANGE,
      required: true,
      static: true,
      description: 'What to change: an action with its options.',
      summary: true,
      ui: { editor: 'computer-display-change' },
    },
    {
      name: 'keep',
      type: { t: 'boolean' },
      required: false,
      default: false,
      static: true,
      description: 'Keep a mode, scale or position change instead of letting it revert.',
    },
  ],
  outputs: [{ name: 'ok', type: { t: 'boolean' }, description: 'Whether the change was made.' }],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Change the screen on {computer}',
  keywords: ['monitor', 'resolution', 'brightness', 'night light', 'scale', 'display'],
  access: 'member',
  tier: 'v1',
});

const COMPUTER_READ = defineNodeKind({
  id: 'computer.read',
  name: 'Computer status',
  category: 'computers',
  icon: 'cpu',
  class: 'read',
  description:
    'Reads what a computer reports now: locked, the focused app, who is signed in, charging, battery, processor and graphics load and network rates. A figure the computer does not report is left out.',
  inputs: [
    {
      name: 'computer',
      type: { t: 'ref', of: 'computer' },
      required: true,
      description: 'Which computer.',
      summary: true,
    },
  ],
  outputs: [
    reading('locked', { t: 'boolean' }, 'Whether the screen is locked.'),
    reading('focusedApp', { t: 'text' }, 'The app in front.'),
    reading('signedInUser', { t: 'text' }, 'Who is signed in.'),
    reading('charging', { t: 'boolean' }, 'Whether it is charging.'),
    reading('batteryLevel', { t: 'number', min: 0, max: 100, unit: '%' }, 'The battery level.'),
    reading('cpuLoad', { t: 'number', min: 0, max: 100, unit: '%' }, 'Processor load.'),
    reading('gpuLoad', { t: 'number', min: 0, max: 100, unit: '%' }, 'Graphics load.'),
    reading('downloadRate', { t: 'number', min: 0 }, 'Download rate.'),
    reading('uploadRate', { t: 'number', min: 0 }, 'Upload rate.'),
  ],
  exits: [],
  summary: 'Status of {computer}',
  keywords: ['computer', 'locked', 'focused', 'game', 'battery', 'load', 'pc'],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1.1',
});

const COMPUTER_POWER = defineNodeKind({
  id: 'computer.power',
  name: 'Computer power',
  category: 'computers',
  icon: 'power',
  class: 'effect',
  description: 'Locks, sleeps, hibernates, restarts, shuts down or signs out a computer.',
  inputs: [
    {
      name: 'computer',
      type: { t: 'ref', of: 'computer' },
      required: true,
      description: 'Which computer.',
      summary: true,
    },
    {
      name: 'action',
      type: {
        t: 'choice',
        options: POWER_ACTIONS.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
      },
      required: true,
      static: true,
      description: 'What to do.',
      summary: true,
    },
  ],
  outputs: [{ name: 'ok', type: { t: 'boolean' }, description: 'Whether the computer did it.' }],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: '{action} {computer}',
  keywords: ['lock', 'sleep', 'shut down', 'restart', 'sign out', 'power', 'hibernate'],
  access: 'member',
  tier: 'v1.1',
});

const PHONE_ACTION_NODE = defineNodeKind({
  id: 'phone.action',
  name: 'Phone action',
  category: 'computers',
  icon: 'smartphone',
  class: 'effect',
  description:
    'Asks a phone to do something: ring, flashlight, volume, ringer, do not disturb, media, open a link or app, brightness, lock or take a screenshot.',
  inputs: [
    {
      name: 'phone',
      type: { t: 'ref', of: 'phone' },
      required: true,
      description: 'Which phone.',
      summary: true,
    },
    {
      name: 'action',
      type: { t: 'record', values: { t: 'any' } },
      required: true,
      static: true,
      description: 'What to ask: a type with its options.',
      summary: true,
      ui: { editor: 'phone-action' },
    },
  ],
  outputs: [{ name: 'ok', type: { t: 'boolean' }, description: 'Whether the phone did it.' }],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Ask {phone} to {action}',
  keywords: ['phone', 'ring', 'flashlight', 'dnd', 'do not disturb', 'ringer', 'volume', 'lock'],
  access: 'member',
  tier: 'v1.1',
});

const PHONE_READ = defineNodeKind({
  id: 'phone.read',
  name: 'Phone status',
  category: 'computers',
  icon: 'smartphone-charging',
  class: 'read',
  description:
    'Reads what a phone reports now: battery, charging, ringer mode, do not disturb and whether the screen is on. A figure the phone does not report is left out.',
  inputs: [
    {
      name: 'phone',
      type: { t: 'ref', of: 'phone' },
      required: true,
      description: 'Which phone.',
      summary: true,
    },
  ],
  outputs: [
    reading('battery', { t: 'number', min: 0, max: 100, unit: '%' }, 'The battery level.'),
    reading('charging', { t: 'boolean' }, 'Whether it is charging.'),
    reading(
      'ringerMode',
      { t: 'choice', options: PHONE_RINGER_MODES.map((id) => ({ id, label: id })) },
      'The ringer mode.',
    ),
    reading('dnd', { t: 'boolean' }, 'Whether do not disturb is on.'),
    reading('screenOn', { t: 'boolean' }, 'Whether the screen is on.'),
  ],
  exits: [],
  summary: 'Status of {phone}',
  keywords: ['phone', 'battery', 'charging', 'ringer', 'dnd'],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1.1',
});

export const COMPUTERS_PHONES_KINDS: readonly NodeKind[] = [
  COMPUTER_AUDIO,
  COMPUTER_DISPLAY,
  COMPUTER_READ,
  COMPUTER_POWER,
  PHONE_ACTION_NODE,
  PHONE_READ,
];
