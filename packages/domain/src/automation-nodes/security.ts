import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };
const SKIPPED: FlowType = {
  t: 'list',
  of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } },
};

export const COVER_ACTION_CHOICES = [
  { id: 'open', label: 'Open' },
  { id: 'close', label: 'Close' },
  { id: 'stop', label: 'Stop' },
  { id: 'position', label: 'Go to a position' },
] as const;

const SECURITY_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'sent', type: DEVICE_LIST, description: 'Devices the command was sent to.' },
  {
    name: 'skipped',
    type: SKIPPED,
    description: 'Devices left out, each with the reason (offline, not supported or out of range).',
  },
  ERROR_OUT,
];

function targetInput(description: string): InputPortDecl {
  return { name: 'target', type: TARGET_REF, required: true, description, summary: true };
}

const lockSet = defineNodeKind({
  id: 'lock.set',
  name: 'Lock or unlock',
  category: 'devices',
  icon: 'lock',
  class: 'effect',
  description:
    'Locks or unlocks a door lock, in a room, a group or a list. Only the owner can use it. Devices that are not locks, are offline or refuse the command are skipped and reported.',
  inputs: [
    targetInput('Which lock, room or group, or a wired device or list of devices.'),
    {
      name: 'locked',
      type: { t: 'boolean' },
      required: false,
      default: true,
      live: true,
      description: 'On locks the door, off unlocks it.',
      summary: true,
      ui: { label: 'Locked' },
    },
  ],
  outputs: SECURITY_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set {target} locked to {locked}',
  keywords: ['lock', 'unlock', 'door', 'deadbolt', 'latch', 'secure', 'key'],
  access: 'owner',
  tier: 'v1.1',
});

const alarmSet = defineNodeKind({
  id: 'alarm.set',
  name: 'Set alarm mode',
  category: 'devices',
  icon: 'shield',
  class: 'effect',
  description:
    'Arms or disarms an alarm panel or security system by picking one of the modes the device offers, such as home, away or disarmed. Devices without that mode are skipped and reported.',
  inputs: [
    targetInput('Which alarm panel, room or group, or a wired device or list of devices.'),
    {
      name: 'mode',
      type: TEXT,
      required: true,
      static: true,
      description: 'The alarm mode the device offers.',
      summary: true,
      ui: { label: 'Mode', optionsFrom: 'device.enum_values' },
    },
  ],
  outputs: SECURITY_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set alarm of {target} to {mode}',
  keywords: ['alarm', 'arm', 'disarm', 'security', 'away', 'home', 'panel', 'siren', 'guard'],
  access: 'member',
  tier: 'v1.1',
});

const coverSet = defineNodeKind({
  id: 'cover.set',
  name: 'Move blinds',
  category: 'devices',
  icon: 'blinds',
  class: 'effect',
  description:
    'Opens, closes or stops blinds, curtains and shutters, or moves them to a position from 0 to 100 percent, in a room, a group or a list. Devices that do not offer the action are skipped and reported.',
  inputs: [
    targetInput('Which blinds or curtains, room or group, or a wired device or list of devices.'),
    {
      name: 'action',
      type: { t: 'choice', options: [...COVER_ACTION_CHOICES] },
      required: false,
      default: 'open',
      static: true,
      description: 'Open, close or stop, or go to the position below.',
      summary: true,
      ui: { label: 'Action' },
    },
    {
      name: 'position',
      type: { t: 'number' },
      required: false,
      live: true,
      description: 'How far open, as a percentage. Used when the action is Go to a position.',
      summary: true,
      ui: { label: 'Position', min: 0, max: 100, step: 1, unit: '%' },
    },
  ],
  outputs: SECURITY_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: '{action} {target}',
  keywords: ['cover', 'blind', 'blinds', 'curtain', 'shutter', 'shade', 'open', 'close', 'stop'],
  access: 'member',
  tier: 'v1.1',
});

export const SECURITY_KINDS: readonly NodeKind[] = [lockSet, alarmSet, coverSet];
