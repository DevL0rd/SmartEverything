import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const BOOLEAN: FlowType = { t: 'boolean' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };

export const CAMERA_DIRECTION_CHOICES = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
] as const;

export const CAMERA_SWITCH_CHOICES = [
  { id: 'on', label: 'Switch on' },
  { id: 'off', label: 'Switch off' },
  { id: 'keep', label: 'Leave as it is' },
] as const;

const CAMERA_REF: FlowType = { t: 'ref', of: 'camera' };

export const CLIP_SECONDS_MIN = 5;
export const CLIP_SECONDS_MAX = 300;
export const CLIP_SECONDS_DEFAULT = 30;

function switchInput(name: string, label: string, description: string): InputPortDecl {
  return {
    name,
    type: { t: 'choice', options: [...CAMERA_SWITCH_CHOICES] },
    required: false,
    default: 'keep',
    static: true,
    description,
    ui: { label },
  };
}

const MOVE_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'camera',
    type: CAMERA_REF,
    required: true,
    description: 'Which camera to move.',
    summary: true,
  },
  {
    name: 'preset',
    type: TEXT,
    required: false,
    static: true,
    description: 'A saved position of the camera to turn to. Use this or a direction.',
    summary: true,
    ui: { label: 'Saved position', optionsFrom: 'camera.presets' },
  },
  {
    name: 'direction',
    type: { t: 'choice', options: [...CAMERA_DIRECTION_CHOICES] },
    required: false,
    static: true,
    description: 'Which way to turn the camera. Use this or a saved position.',
    summary: true,
    ui: { label: 'Direction' },
  },
  {
    name: 'steps',
    type: { t: 'number', integer: true, min: 1 },
    required: false,
    default: 1,
    live: true,
    description: 'How many steps to turn in the direction.',
    ui: { label: 'Steps', min: 1, step: 1 },
  },
];

const MOVE_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'ok', type: BOOLEAN, description: 'Whether the camera was told to move.' },
  ERROR_OUT,
];

const SET_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'target',
    type: TARGET_REF,
    required: false,
    description:
      'Which camera, cameras, room or group, or a wired device or list of devices. Leave empty and turn on Every camera to change all of them.',
    summary: true,
  },
  {
    name: 'everyCamera',
    type: BOOLEAN,
    required: false,
    default: false,
    static: true,
    description: 'Change every camera and doorbell of the home instead of a chosen target.',
    ui: { label: 'Every camera' },
  },
  switchInput('privacy', 'Privacy', 'Switch privacy on, which stops the camera, or off.'),
  switchInput('motionDetection', 'Motion detection', 'Switch motion detection on or off.'),
  {
    name: 'nightVision',
    type: TEXT,
    required: false,
    static: true,
    description: 'The night vision setting the camera offers, such as on, off or auto.',
    ui: { label: 'Night vision', optionsFrom: 'camera.night_vision' },
  },
  switchInput('statusLight', 'Status light', 'Switch the status light of the camera on or off.'),
];

const SET_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'sent', type: DEVICE_LIST, description: 'Cameras the command was sent to.' },
  {
    name: 'skipped',
    type: { t: 'list', of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } } },
    description:
      'Cameras left out, each with the reason (offline, not a camera or no such setting).',
  },
  ERROR_OUT,
];

const RECORD_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'camera',
    type: CAMERA_REF,
    required: true,
    description: 'Which camera records.',
    summary: true,
  },
  {
    name: 'seconds',
    type: { t: 'number', integer: true, min: CLIP_SECONDS_MIN, max: CLIP_SECONDS_MAX, unit: 's' },
    required: false,
    default: CLIP_SECONDS_DEFAULT,
    live: true,
    description: 'How long to record, from 5 to 300 seconds.',
    summary: true,
    ui: { label: 'Seconds', min: CLIP_SECONDS_MIN, max: CLIP_SECONDS_MAX, step: 1, unit: 's' },
  },
];

const RECORD_OUTPUTS: readonly OutputPortDecl[] = [
  {
    name: 'recordingId',
    type: TEXT,
    optional: true,
    description: 'The id of the saved clip. Only known when the step waits for the clip.',
  },
  {
    name: 'at',
    type: { t: 'instant' },
    optional: true,
    description: 'When the recording started. Only known when the step waits for the clip.',
  },
  ERROR_OUT,
];

const cameraRecord = defineNodeKind({
  id: 'camera.record',
  name: 'Record clip',
  category: 'cameras',
  icon: 'film',
  class: 'effect',
  description:
    'Records a video clip from a camera and saves it with the camera recordings. Sending starts the recording and continues at once. Waiting continues when the clip is saved and gives its id and start time. A camera that is offline or switched off for privacy gives an error.',
  inputs: RECORD_INPUTS,
  outputs: RECORD_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'external', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Record {camera} for {seconds}',
  keywords: ['camera', 'record', 'recording', 'clip', 'video', 'film', 'capture', 'doorbell'],
  access: 'member',
  tier: 'v1.1',
});

const cameraMove = defineNodeKind({
  id: 'camera.move',
  name: 'Move camera',
  category: 'cameras',
  icon: 'move',
  class: 'effect',
  description:
    'Turns a camera to a saved position, or a number of steps left, right, up or down. A camera that cannot move, is offline or has no such saved position gives an error.',
  inputs: MOVE_INPUTS,
  outputs: MOVE_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'relative', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Move {camera}: {preset} {direction}',
  keywords: [
    'camera',
    'move',
    'turn',
    'pan',
    'tilt',
    'ptz',
    'rotate',
    'preset',
    'position',
    'left',
    'right',
    'up',
    'down',
  ],
  access: 'member',
  tier: 'v1.1',
});

const cameraSet = defineNodeKind({
  id: 'camera.set',
  name: 'Set cameras',
  category: 'cameras',
  icon: 'camera',
  class: 'effect',
  description:
    'Changes privacy, motion detection, night vision and the status light on one camera, a room of cameras, a group or every camera. Each camera gets one command with everything in it, sent to all cameras together. Settings a camera does not have are left out for that camera.',
  inputs: SET_INPUTS,
  outputs: SET_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set cameras {target}',
  keywords: [
    'camera',
    'cameras',
    'privacy',
    'motion',
    'detection',
    'night vision',
    'infrared',
    'status light',
    'led',
    'doorbell',
    'all cameras',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const CAMERA_KINDS: readonly NodeKind[] = [cameraMove, cameraSet, cameraRecord];
