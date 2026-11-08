import type { FlowType } from '../automation-v3/types';
import {
  PHONE_FLASHLIGHT_MODES,
  PHONE_MEDIA_KEYS,
  PHONE_RINGER_MODES,
  PHONE_SCREEN_TIMEOUTS,
  PHONE_SETTINGS_PAGES,
  PHONE_SYSTEM_TOGGLES,
  PHONE_VOLUME_STREAMS,
} from '../phones';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const PHONE_REF: FlowType = { t: 'ref', of: 'phone' };
const PERCENT: FlowType = { t: 'number', integer: true, min: 0, max: 100, unit: '%' };

const SENT: readonly OutputPortDecl[] = [
  { name: 'ok', type: BOOLEAN, description: 'Whether the phone did it.' },
  ERROR_OUT,
];

const SEND_EFFECT = { retry: 'external', budget: 'effects', mode: 'fire_and_forget' } as const;

const PHONE_PORT: InputPortDecl = {
  name: 'phone',
  type: PHONE_REF,
  required: true,
  description: 'Which phone.',
  summary: true,
};

function labelOf(id: string): string {
  const words = id.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function choicesOf(ids: readonly string[]): FlowType {
  return { t: 'choice', options: ids.map((id) => ({ id, label: labelOf(id) })) };
}

export const PHONE_MEDIA_CHOICES = [...PHONE_MEDIA_KEYS, 'seek'] as const;

export const PHONE_OPEN_CHOICES = [
  { id: 'url', label: 'A link' },
  { id: 'app', label: 'An app' },
  { id: 'settings', label: 'A settings page' },
] as const;

export const PHONE_SCREEN_CHOICES = [
  { id: 'lock', label: 'Lock the screen' },
  { id: 'show_unlock', label: 'Show the unlock screen' },
  { id: 'brightness', label: 'Set the brightness' },
  { id: 'auto_brightness', label: 'Turn auto brightness on or off' },
  { id: 'timeout', label: 'Set the screen timeout' },
] as const;

const SECONDS_PER_MINUTE = 60;

function timeoutLabel(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${String(seconds)} seconds`;
  const minutes = seconds / SECONDS_PER_MINUTE;
  return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`;
}

export const PHONE_TIMEOUT_CHOICES = PHONE_SCREEN_TIMEOUTS.map((seconds) => ({
  id: String(seconds),
  label: timeoutLabel(seconds),
}));

const phoneRing = defineNodeKind({
  id: 'phone.ring',
  name: 'Ring phone',
  category: 'computers',
  icon: 'bell',
  class: 'effect',
  description:
    'Makes a phone ring loudly so it can be found, or stops it ringing. Pick the phone, or a person to ring every phone of theirs.',
  inputs: [
    {
      name: 'phone',
      type: PHONE_REF,
      required: false,
      description: 'Which phone. Give a phone or a person.',
      summary: true,
    },
    {
      name: 'person',
      type: { t: 'ref', of: 'person' },
      required: false,
      description: 'Whose phones to ring. Give a phone or a person.',
      summary: true,
    },
    {
      name: 'on',
      type: BOOLEAN,
      required: false,
      default: true,
      static: true,
      description: 'Ring the phone, or stop it ringing.',
      ui: { label: 'Ringing' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Ring {phone} or {person}',
  keywords: ['phone', 'ring', 'find', 'locate', 'stop ringing', 'alarm'],
  access: 'member',
  tier: 'v1.1',
});

const phoneSound = defineNodeKind({
  id: 'phone.sound',
  name: 'Phone sound',
  category: 'computers',
  icon: 'volume',
  class: 'effect',
  description:
    'Changes the ringer mode, do not disturb or the volume of one sound stream on a phone. Whatever is left empty stays as it is.',
  inputs: [
    PHONE_PORT,
    {
      name: 'ringer',
      type: choicesOf(PHONE_RINGER_MODES),
      required: false,
      static: true,
      description: 'The ringer mode: normal, vibrate or silent.',
      summary: true,
      ui: { label: 'Ringer' },
    },
    {
      name: 'dnd',
      type: BOOLEAN,
      required: false,
      static: true,
      description: 'Turn do not disturb on or off.',
      ui: { label: 'Do not disturb' },
    },
    {
      name: 'stream',
      type: choicesOf(PHONE_VOLUME_STREAMS),
      required: false,
      static: true,
      description: 'Which volume to change. Used together with the volume.',
      ui: { label: 'Sound' },
    },
    {
      name: 'volume',
      type: PERCENT,
      required: false,
      live: true,
      description: 'The volume of the chosen sound, as a percentage.',
      ui: { label: 'Volume', min: 0, max: 100, step: 1, unit: '%' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Change the sound on {phone}',
  keywords: ['phone', 'ringer', 'silent', 'vibrate', 'dnd', 'do not disturb', 'volume', 'mute'],
  access: 'member',
  tier: 'v1.1',
});

const phoneMedia = defineNodeKind({
  id: 'phone.media',
  name: 'Phone media',
  category: 'computers',
  icon: 'play',
  class: 'effect',
  description:
    'Presses a media key on a phone: play, pause, next or previous, or jumps to a position in what is playing.',
  inputs: [
    PHONE_PORT,
    {
      name: 'key',
      type: choicesOf(PHONE_MEDIA_CHOICES),
      required: true,
      static: true,
      description: 'The media key to press.',
      summary: true,
      ui: { label: 'Key' },
    },
    {
      name: 'position',
      type: { t: 'duration' },
      required: false,
      live: true,
      description: 'Where to jump to in what is playing. Used by Seek.',
      ui: { label: 'Jump to' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Press {key} on {phone}',
  keywords: ['phone', 'media', 'play', 'pause', 'next', 'previous', 'skip', 'seek', 'music'],
  access: 'member',
  tier: 'v1.1',
});

const phoneOpen = defineNodeKind({
  id: 'phone.open',
  name: 'Open on phone',
  category: 'computers',
  icon: 'globe',
  class: 'effect',
  description:
    'Opens a link, an installed app or a system settings page on a phone. Apps are picked from what the phone has installed.',
  inputs: [
    PHONE_PORT,
    {
      name: 'what',
      type: { t: 'choice', options: [...PHONE_OPEN_CHOICES] },
      required: true,
      static: true,
      description: 'What to open.',
      summary: true,
      ui: { label: 'Open' },
    },
    {
      name: 'url',
      type: TEXT,
      required: false,
      live: true,
      description: 'The link to open: a web address, a map, a phone number or an email address.',
      ui: { label: 'Link' },
    },
    {
      name: 'label',
      type: TEXT,
      required: false,
      live: true,
      description: 'The name the phone shows for the link. The address is used when empty.',
      ui: { label: 'Name shown' },
    },
    {
      name: 'app',
      type: TEXT,
      required: false,
      static: true,
      description: 'The app to open. Used by An app.',
      ui: { label: 'App', optionsFrom: 'phone.apps' },
    },
    {
      name: 'page',
      type: choicesOf(PHONE_SETTINGS_PAGES),
      required: false,
      static: true,
      description: 'The settings page to open. Used by A settings page.',
      ui: { label: 'Settings page' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Open {what} on {phone}',
  keywords: ['phone', 'open', 'link', 'url', 'app', 'launch', 'settings', 'website'],
  access: 'member',
  tier: 'v1.1',
});

const phoneFlashlight = defineNodeKind({
  id: 'phone.flashlight',
  name: 'Phone flashlight',
  category: 'computers',
  icon: 'bulb',
  class: 'effect',
  description:
    'Turns the flashlight of a phone on, off or toggles it, and sets how bright it shines when it is turned on.',
  inputs: [
    PHONE_PORT,
    {
      name: 'mode',
      type: choicesOf(PHONE_FLASHLIGHT_MODES),
      required: true,
      static: true,
      description: 'Turn the flashlight on, off or toggle it.',
      summary: true,
      ui: { label: 'Flashlight' },
    },
    {
      name: 'level',
      type: { t: 'number', integer: true, min: 1, max: 100, unit: '%' },
      required: false,
      live: true,
      description: 'How bright, as a percentage. Used when the mode is On.',
      ui: { label: 'Brightness', min: 1, max: 100, step: 1, unit: '%' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Flashlight {mode} on {phone}',
  keywords: ['phone', 'flashlight', 'torch', 'light', 'brightness'],
  access: 'member',
  tier: 'v1.1',
});

const phoneScreen = defineNodeKind({
  id: 'phone.screen',
  name: 'Phone screen',
  category: 'computers',
  icon: 'smartphone',
  class: 'effect',
  description:
    'Locks a phone, shows its unlock screen, sets the brightness, turns auto brightness on or off, or sets how long the screen stays on.',
  inputs: [
    PHONE_PORT,
    {
      name: 'action',
      type: { t: 'choice', options: [...PHONE_SCREEN_CHOICES] },
      required: true,
      static: true,
      description: 'What to do with the screen.',
      summary: true,
      ui: { label: 'Action' },
    },
    {
      name: 'brightness',
      type: PERCENT,
      required: false,
      live: true,
      description: 'The brightness, as a percentage. Used by Set the brightness.',
      ui: { label: 'Brightness', min: 0, max: 100, step: 1, unit: '%' },
    },
    {
      name: 'auto',
      type: BOOLEAN,
      required: false,
      static: true,
      description: 'Whether auto brightness is on. Used by Turn auto brightness on or off.',
      ui: { label: 'Auto brightness' },
    },
    {
      name: 'timeout',
      type: { t: 'choice', options: PHONE_TIMEOUT_CHOICES },
      required: false,
      static: true,
      description: 'How long the screen stays on. Used by Set the screen timeout.',
      ui: { label: 'Screen timeout' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: '{action} on {phone}',
  keywords: ['phone', 'screen', 'lock', 'unlock', 'brightness', 'timeout', 'display'],
  access: 'member',
  tier: 'v1.1',
});

const phoneToggle = defineNodeKind({
  id: 'phone.toggle',
  name: 'Phone setting',
  category: 'computers',
  icon: 'settings',
  class: 'effect',
  description:
    'Turns a system setting of a phone on or off: auto rotate, touch vibration or touch sounds. Android does not let an app switch Wi-Fi, Bluetooth, location or airplane mode, so use Open on phone to reach those pages.',
  inputs: [
    PHONE_PORT,
    {
      name: 'setting',
      type: choicesOf(PHONE_SYSTEM_TOGGLES),
      required: true,
      static: true,
      description: 'Which setting.',
      summary: true,
      ui: { label: 'Setting' },
    },
    {
      name: 'on',
      type: BOOLEAN,
      required: false,
      default: true,
      static: true,
      description: 'Turn the setting on or off.',
      summary: true,
      ui: { label: 'On' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Set {setting} on {phone}',
  keywords: ['phone', 'setting', 'rotate', 'vibration', 'haptic', 'touch sounds', 'toggle'],
  access: 'member',
  tier: 'v1.1',
});

export const PHONE_ACTION_KINDS: readonly NodeKind[] = [
  phoneRing,
  phoneSound,
  phoneMedia,
  phoneOpen,
  phoneFlashlight,
  phoneScreen,
  phoneToggle,
];
