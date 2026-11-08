import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };
const TV_REF: FlowType = { t: 'ref', of: 'device', families: ['television'] };

export const TV_ACTION_CHOICES = [
  { id: 'power_on', label: 'Turn on' },
  { id: 'power_off', label: 'Turn off' },
  { id: 'volume_set', label: 'Set the volume' },
  { id: 'volume_up', label: 'Volume up' },
  { id: 'volume_down', label: 'Volume down' },
  { id: 'mute', label: 'Mute' },
  { id: 'unmute', label: 'Unmute' },
  { id: 'input', label: 'Switch input' },
  { id: 'channel', label: 'Change channel' },
  { id: 'open_app', label: 'Open an app' },
  { id: 'press_key', label: 'Press a remote button' },
  { id: 'art_mode_on', label: 'Turn art mode on' },
  { id: 'art_mode_off', label: 'Turn art mode off' },
  { id: 'playback', label: 'Control playback' },
  { id: 'picture_mode', label: 'Change picture mode' },
  { id: 'sound_mode', label: 'Change sound mode' },
] as const;

export const TV_PLAYBACK_CHOICES = [
  { id: 'play', label: 'Play' },
  { id: 'pause', label: 'Pause' },
  { id: 'stop', label: 'Stop' },
  { id: 'fast_forward', label: 'Fast forward' },
  { id: 'rewind', label: 'Rewind' },
] as const;

const INPUTS: readonly InputPortDecl[] = [
  {
    name: 'tv',
    type: TV_REF,
    required: true,
    description: 'Which TV.',
    summary: true,
  },
  {
    name: 'action',
    type: { t: 'choice', options: [...TV_ACTION_CHOICES] },
    required: true,
    static: true,
    description: 'What the TV should do.',
    summary: true,
    ui: { label: 'Action' },
  },
  {
    name: 'volume',
    type: NUMBER,
    required: false,
    live: true,
    description: 'The volume to set, within the range the TV offers. Used by Set the volume.',
    ui: { label: 'Volume', min: 0, max: 100, step: 1, unit: '%' },
  },
  {
    name: 'input',
    type: TEXT,
    required: false,
    static: true,
    description: 'The input to switch to. Used by Switch input.',
    ui: { label: 'Input', optionsFrom: 'tv.inputs' },
  },
  {
    name: 'channel',
    type: NUMBER,
    required: false,
    live: true,
    description: 'The channel number to change to. Used by Change channel.',
    ui: { label: 'Channel', min: 0, step: 1 },
  },
  {
    name: 'app',
    type: TEXT,
    required: false,
    static: true,
    description: 'The app to open. Used by Open an app.',
    ui: { label: 'App', optionsFrom: 'tv.apps' },
  },
  {
    name: 'key',
    type: TEXT,
    required: false,
    static: true,
    description: 'The remote button to press. Used by Press a remote button.',
    ui: { label: 'Remote button', optionsFrom: 'tv.keys' },
  },
  {
    name: 'playback',
    type: { t: 'choice', options: [...TV_PLAYBACK_CHOICES] },
    required: false,
    static: true,
    description: 'What the playing media should do. Used by Control playback.',
    ui: { label: 'Playback' },
  },
  {
    name: 'pictureMode',
    type: TEXT,
    required: false,
    static: true,
    description: 'The picture mode the TV offers. Used by Change picture mode.',
    ui: { label: 'Picture mode', optionsFrom: 'tv.picture_modes' },
  },
  {
    name: 'soundMode',
    type: TEXT,
    required: false,
    static: true,
    description: 'The sound mode the TV offers. Used by Change sound mode.',
    ui: { label: 'Sound mode', optionsFrom: 'tv.sound_modes' },
  },
];

const OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'ok', type: BOOLEAN, description: 'Whether the command was sent to the TV.' },
  ERROR_OUT,
];

const tvControl = defineNodeKind({
  id: 'tv.control',
  name: 'Control TV',
  category: 'devices',
  icon: 'tv',
  class: 'effect',
  description:
    'Controls a TV: turns it on (waking it over the network when it is off) or off, sets the volume or steps it up and down, mutes it, switches input, changes channel, opens an app, presses a remote button, turns art mode on or off, controls playback, or changes the picture or sound mode. Inputs, apps and buttons are picked from what the TV offers. Turning a TV on that is off can take up to a minute to be confirmed.',
  inputs: INPUTS,
  outputs: OUTPUTS,
  exits: ['next'],
  effect: { retry: 'relative', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Tell {tv} to {action}',
  keywords: [
    'tv',
    'television',
    'samsung',
    'screen',
    'power',
    'volume',
    'mute',
    'input',
    'hdmi',
    'channel',
    'app',
    'netflix',
    'remote',
    'key',
    'button',
    'art mode',
    'frame',
    'play',
    'pause',
    'picture',
    'sound',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const TELEVISION_KINDS: readonly NodeKind[] = [tvControl];
