import type { FlowType } from '../automation-v3/types';
import {
  DISPLAY_ROTATIONS,
  DISPLAY_SIDES,
  DISPLAY_VRR_POLICIES,
  NIGHT_LIGHT_MODES,
} from '../node/computer-displays';
import type { InputPortDecl } from './define';

const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };
const BOOLEAN: FlowType = { t: 'boolean' };

export const AUDIO_ACTION_CHOICES = [
  { id: 'volume', label: 'Set the volume' },
  { id: 'mute', label: 'Mute or unmute' },
  { id: 'default', label: 'Choose the default device' },
  { id: 'app_volume', label: 'Set the volume of an app' },
  { id: 'app_mute', label: 'Mute or unmute an app' },
  { id: 'app_output', label: 'Send an app to another device' },
] as const;

export const AUDIO_KIND_CHOICES = [
  { id: 'output', label: 'Speakers and headphones' },
  { id: 'input', label: 'Microphones' },
] as const;

export const DISPLAY_ACTION_CHOICES = [
  { id: 'enable', label: 'Turn a screen on' },
  { id: 'disable', label: 'Turn a screen off' },
  { id: 'mode', label: 'Set the resolution' },
  { id: 'scale', label: 'Set the scale' },
  { id: 'rotation', label: 'Rotate' },
  { id: 'primary', label: 'Make it the main screen' },
  { id: 'position', label: 'Place it next to another screen' },
  { id: 'mirror', label: 'Mirror another screen' },
  { id: 'brightness', label: 'Set the brightness' },
  { id: 'hdr', label: 'Turn HDR on or off' },
  { id: 'vrr', label: 'Set variable refresh rate' },
  { id: 'night_light', label: 'Set the night light' },
  { id: 'keep', label: 'Keep the screen change' },
  { id: 'revert', label: 'Undo the screen change' },
] as const;

export const DISPLAY_ROTATION_CHOICES = DISPLAY_ROTATIONS.map((degrees) => ({
  id: String(degrees),
  label: degrees === 0 ? 'Upright' : `${String(degrees)} degrees`,
}));

export const DISPLAY_SIDE_CHOICES = DISPLAY_SIDES.map((id) => ({
  id,
  label: id === 'above' || id === 'below' ? id : `to the ${id}`,
}));

export const DISPLAY_VRR_CHOICES = DISPLAY_VRR_POLICIES.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

export const NIGHT_LIGHT_CHOICES = NIGHT_LIGHT_MODES.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

const COMPUTER: InputPortDecl = {
  name: 'computer',
  type: { t: 'ref', of: 'computer' },
  required: true,
  description: 'Which computer.',
  summary: true,
};

function choice(
  name: string,
  options: readonly { readonly id: string; readonly label: string }[],
  label: string,
  description: string,
): InputPortDecl {
  return {
    name,
    type: { t: 'choice', options: [...options] },
    required: false,
    static: true,
    description,
    ui: { label },
  };
}

function picker(
  name: string,
  source: 'computer.audio_devices' | 'computer.audio_apps' | 'computer.displays',
  label: string,
  description: string,
): InputPortDecl {
  return {
    name,
    type: TEXT,
    required: false,
    static: true,
    description,
    ui: { label, optionsFrom: source },
  };
}

function number(
  name: string,
  label: string,
  description: string,
  range: { readonly min?: number; readonly max?: number; readonly unit?: string },
): InputPortDecl {
  return {
    name,
    type: NUMBER,
    required: false,
    live: true,
    description,
    ui: { label, step: 1, ...range },
  };
}

function toggle(name: string, label: string, description: string): InputPortDecl {
  return { name, type: BOOLEAN, required: false, live: true, description, ui: { label } };
}

export const AUDIO_INPUTS: readonly InputPortDecl[] = [
  COMPUTER,
  {
    ...choice('action', AUDIO_ACTION_CHOICES, 'Action', 'What to change.'),
    required: true,
    summary: true,
  },
  choice(
    'kind',
    AUDIO_KIND_CHOICES,
    'Kind',
    'Whether the action is about sound out or microphones. Used by Set the volume, Mute or unmute and Choose the default device; sound out is the default for the first two.',
  ),
  picker(
    'device',
    'computer.audio_devices',
    'Device',
    'The sound device. Used by Set the volume and Mute or unmute (the default device when left empty) and by Choose the default device.',
  ),
  picker(
    'app',
    'computer.audio_apps',
    'App',
    'The app that is playing sound. Used by the three app actions.',
  ),
  number(
    'level',
    'Volume',
    'The volume to set. Used by Set the volume and Set the volume of an app.',
    {
      min: 0,
      max: 150,
      unit: '%',
    },
  ),
  toggle('muted', 'Muted', 'Whether to mute. Used by Mute or unmute and Mute or unmute an app.'),
  picker(
    'output',
    'computer.audio_devices',
    'Send to',
    'The device the app should play on. Used by Send an app to another device.',
  ),
];

export const DISPLAY_INPUTS: readonly InputPortDecl[] = [
  COMPUTER,
  {
    ...choice('action', DISPLAY_ACTION_CHOICES, 'Action', 'What to change.'),
    required: true,
    summary: true,
  },
  picker(
    'output',
    'computer.displays',
    'Screen',
    'The screen to change. The only screen is used when the computer has one. Used by every action except the night light, keep and undo.',
  ),
  number('width', 'Width', 'The width in pixels. Used by Set the resolution.', {
    min: 1,
    unit: 'px',
  }),
  number('height', 'Height', 'The height in pixels. Used by Set the resolution.', {
    min: 1,
    unit: 'px',
  }),
  number('refreshHz', 'Refresh rate', 'The refresh rate. Used by Set the resolution.', {
    min: 1,
    unit: 'Hz',
  }),
  number('scale', 'Scale', 'The scale of everything on the screen. Used by Set the scale.', {
    min: 50,
    max: 400,
    unit: '%',
  }),
  choice(
    'rotation',
    DISPLAY_ROTATION_CHOICES,
    'Rotation',
    'How far to turn the screen. Used by Rotate.',
  ),
  picker(
    'relativeTo',
    'computer.displays',
    'Next to',
    'The screen to place it beside. Used by Place it next to another screen.',
  ),
  choice(
    'side',
    DISPLAY_SIDE_CHOICES,
    'Side',
    'Which side of that screen. Used by Place it next to another screen.',
  ),
  picker(
    'mirrorOf',
    'computer.displays',
    'Mirror of',
    'The screen to copy. Leave empty to stop mirroring. Used by Mirror another screen.',
  ),
  number('brightness', 'Brightness', 'The brightness. Used by Set the brightness.', {
    min: 0,
    max: 100,
    unit: '%',
  }),
  toggle('enabled', 'HDR on', 'Whether HDR is on. Used by Turn HDR on or off.'),
  choice(
    'vrr',
    DISPLAY_VRR_CHOICES,
    'Variable refresh rate',
    'When to vary the refresh rate. Used by Set variable refresh rate.',
  ),
  choice(
    'nightLight',
    NIGHT_LIGHT_CHOICES,
    'Night light',
    'Whether the night light is off, on or scheduled. Used by Set the night light.',
  ),
  number('temperature', 'Warmth', 'How warm the night light is. Used by Set the night light.', {
    min: 1000,
    max: 6500,
    unit: 'K',
  }),
  {
    name: 'keep',
    type: BOOLEAN,
    required: false,
    default: false,
    static: true,
    description:
      'Keep a resolution, scale, rotation, main screen, position, mirror, on or off change instead of letting it revert.',
  },
];
