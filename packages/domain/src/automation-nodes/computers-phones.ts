import { PHONE_NETWORKS, PHONE_THERMAL_STATES } from '../phone-enums';
import { PHONE_CONTEXT_STATES, PHONE_RINGER_MODES } from '../phones';
import { POWER_MODES } from '../node/computer-system';
import { COMPUTER_ACTIONS } from '../node/node-requests';
import { AUDIO_INPUTS, DISPLAY_INPUTS } from './computer-ports';
import { defineNodeKind, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

function reading(name: string, type: OutputPortDecl['type'], description: string): OutputPortDecl {
  return { name, type, optional: true, description };
}

export const COMPUTER_AUDIO = defineNodeKind({
  id: 'computer.audio',
  name: 'Computer sound',
  category: 'computers',
  icon: 'speaker',
  class: 'effect',
  description:
    'Changes the sound of a computer: the volume or mute of a device, the default device, or the volume, mute or output of one app. The devices and apps are picked from what the computer reports.',
  inputs: AUDIO_INPUTS,
  outputs: [
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether the change was made.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Change the sound on {computer}',
  keywords: ['volume', 'mute', 'audio', 'speaker', 'output', 'microphone', 'headphones', 'default'],
  access: 'member',
  tier: 'v1',
});

export const COMPUTER_DISPLAY = defineNodeKind({
  id: 'computer.display',
  name: 'Computer screen',
  category: 'computers',
  icon: 'monitor',
  class: 'effect',
  description:
    'Changes a computer screen: turns it on or off, sets the resolution, scale, rotation, main screen, position, mirroring, brightness, HDR, variable refresh rate or night light, and keeps or undoes a change that is waiting. The screens are picked from what the computer reports.',
  inputs: DISPLAY_INPUTS,
  outputs: [
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether the change was made.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Change the screen on {computer}',
  keywords: [
    'monitor',
    'resolution',
    'brightness',
    'night light',
    'scale',
    'display',
    'hdr',
    'rotation',
    'mirror',
    'primary',
  ],
  access: 'member',
  tier: 'v1',
});

export const COMPUTER_READ_CAPABILITIES: Readonly<Record<string, string>> = {
  locked: 'locked',
  focusedApp: 'focused_app',
  signedInUser: 'signed_in_user',
  charging: 'charging',
  batteryLevel: 'battery_level',
  cpuLoad: 'cpu_load',
  gpuLoad: 'gpu_load',
  memoryUsed: 'memory_used',
  diskUsed: 'disk_used',
  cpuTemperature: 'cpu_temperature',
  gpuTemperature: 'gpu_temperature',
  cpuPower: 'cpu_power',
  gpuPower: 'gpu_power',
  downloadRate: 'download_rate',
  uploadRate: 'upload_rate',
  audioOutput: 'audio_output',
  micMuted: 'mic_mute',
  powerMode: 'power_mode',
  displaysOn: 'display_count_on',
};

const COMPUTER_READ = defineNodeKind({
  id: 'computer.read',
  name: 'Computer status',
  category: 'computers',
  icon: 'cpu',
  class: 'read',
  description:
    'Reads what a computer reports now: locked, the focused app, who is signed in, charging, battery, processor, graphics, memory and disk use, temperatures, power draw, network rates, the sound output, whether the microphone is muted, the power mode and how many screens are on. A figure the computer does not report is left out.',
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
    reading('memoryUsed', { t: 'number', min: 0, max: 100, unit: '%' }, 'Memory in use.'),
    reading('diskUsed', { t: 'number', min: 0, max: 100, unit: '%' }, 'The fullest disk.'),
    reading('cpuTemperature', { t: 'number', unit: '°C' }, 'Processor temperature.'),
    reading('gpuTemperature', { t: 'number', unit: '°C' }, 'Graphics temperature.'),
    reading('cpuPower', { t: 'number', min: 0, unit: 'W' }, 'Processor power draw.'),
    reading('gpuPower', { t: 'number', min: 0, unit: 'W' }, 'Graphics power draw.'),
    reading('downloadRate', { t: 'number', min: 0 }, 'Download rate.'),
    reading('uploadRate', { t: 'number', min: 0 }, 'Upload rate.'),
    reading('audioOutput', { t: 'text' }, 'The device the sound plays on.'),
    reading('micMuted', { t: 'boolean' }, 'Whether the microphone is muted.'),
    reading(
      'powerMode',
      { t: 'choice', options: POWER_MODES.map((id) => ({ id, label: id.replaceAll('_', ' ') })) },
      'The power mode.',
    ),
    reading('displaysOn', { t: 'number', integer: true, min: 0 }, 'How many screens are on.'),
  ],
  exits: [],
  summary: 'Status of {computer}',
  keywords: [
    'computer',
    'locked',
    'focused',
    'game',
    'battery',
    'load',
    'pc',
    'memory',
    'disk',
    'temperature',
    'power mode',
    'microphone',
    'screens',
  ],
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
  description:
    'Locks, sleeps, hibernates, restarts, shuts down or signs out a computer, or wakes a sleeping or switched off one over the network.',
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
        options: COMPUTER_ACTIONS.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
      },
      required: true,
      static: true,
      description: 'What to do.',
      summary: true,
    },
  ],
  outputs: [
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether the computer did it.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'fire_and_forget' },
  summary: '{action} {computer}',
  keywords: ['lock', 'sleep', 'shut down', 'restart', 'sign out', 'power', 'hibernate', 'wake'],
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
  effect: { retry: 'external', budget: 'effects', mode: 'fire_and_forget' },
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
    'Reads what a phone reports now: battery, charging, ringer mode, do not disturb, whether the screen is on, what its owner is doing and where, the network, whether Wi-Fi, Bluetooth, location and airplane mode are on, the notification count, the next alarm, what is playing, the screen time today, whether it is in a call or ringing, battery saver and how hot it is. A figure the phone does not report, or that the viewer may not see, is left out.',
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
    reading(
      'context',
      { t: 'choice', options: PHONE_CONTEXT_STATES.map((id) => ({ id, label: id })) },
      'What the person is doing: still, walking, driving and so on.',
    ),
    reading('place', { t: 'text' }, 'The named place the phone is at.'),
    reading(
      'network',
      { t: 'choice', options: PHONE_NETWORKS.map((id) => ({ id, label: id })) },
      'The connection the phone uses.',
    ),
    reading('wifiOn', { t: 'boolean' }, 'Whether Wi-Fi is on.'),
    reading('bluetoothOn', { t: 'boolean' }, 'Whether Bluetooth is on.'),
    reading('locationOn', { t: 'boolean' }, 'Whether location is on.'),
    reading('airplane', { t: 'boolean' }, 'Whether airplane mode is on.'),
    reading(
      'notificationCount',
      { t: 'number', integer: true, min: 0 },
      'How many notifications are waiting.',
    ),
    reading('nextAlarm', { t: 'instant' }, 'When the next alarm goes off.'),
    reading('nowPlaying', { t: 'text' }, 'What is playing.'),
    reading(
      'screenTimeToday',
      { t: 'number', integer: true, min: 0, unit: 'min' },
      'Minutes of screen time today.',
    ),
    reading('inCall', { t: 'boolean' }, 'Whether a call is going on.'),
    reading('ringing', { t: 'boolean' }, 'Whether the phone is ringing.'),
    reading('powerSave', { t: 'boolean' }, 'Whether battery saver is on.'),
    reading(
      'thermal',
      { t: 'choice', options: PHONE_THERMAL_STATES.map((id) => ({ id, label: id })) },
      'How hot the phone is.',
    ),
  ],
  exits: [],
  summary: 'Status of {phone}',
  keywords: [
    'phone',
    'battery',
    'charging',
    'ringer',
    'dnd',
    'network',
    'wifi',
    'bluetooth',
    'location',
    'airplane',
    'notifications',
    'alarm',
    'playing',
    'screen time',
    'call',
    'power saver',
    'hot',
  ],
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
