import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const BOOLEAN: FlowType = { t: 'boolean' };
const ANY: FlowType = { t: 'any' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };
const SKIPPED: FlowType = {
  t: 'list',
  of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } },
};

const TARGET_INPUT: InputPortDecl = {
  name: 'target',
  type: TARGET_REF,
  required: true,
  description:
    'Which purifier, humidifier, diffuser, vacuum or other appliance, room or group, or a wired device or list of devices.',
  summary: true,
};

const REQUIRE_ALL_INPUT: InputPortDecl = {
  name: 'requireAll',
  type: BOOLEAN,
  required: false,
  default: false,
  static: true,
  description: 'Fail when any device is left out, not only when nothing was sent.',
  ui: { label: 'Every device must answer' },
};

const APPLIANCE_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'ok', type: BOOLEAN, description: 'Whether the command was sent.' },
  { name: 'sent', type: DEVICE_LIST, description: 'Devices the command was sent to.' },
  {
    name: 'skipped',
    type: SKIPPED,
    description: 'Devices left out, each with the reason (offline or not supported).',
  },
  ERROR_OUT,
];

const applianceSet = defineNodeKind({
  id: 'appliance.set',
  name: 'Change appliance setting',
  category: 'devices',
  icon: 'fan',
  class: 'effect',
  description:
    'Changes one setting of a purifier, humidifier, dehumidifier, diffuser, vacuum or other appliance, such as its mode, fan level, target humidity, child lock, display or timer. The setting is picked from what the devices can be set to, and the value follows the setting: a switch, a number within the range and unit the device offers, or one of its choices. Offline or unsupported devices are skipped and reported.',
  inputs: [
    TARGET_INPUT,
    {
      name: 'setting',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which setting to change.',
      summary: true,
      ui: { label: 'Setting', optionsFrom: 'device.writable_controls' },
    },
    {
      name: 'value',
      type: ANY,
      required: true,
      live: true,
      description: 'The new value, typed by the setting.',
      summary: true,
      ui: { label: 'To', typedBy: 'setting' },
    },
    REQUIRE_ALL_INPUT,
  ],
  outputs: [
    ...APPLIANCE_OUTPUTS.slice(0, 3),
    { name: 'value', type: ANY, optional: true, description: 'The value now set.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set {setting} of {target} to {value}',
  keywords: [
    'appliance',
    'purifier',
    'humidifier',
    'dehumidifier',
    'diffuser',
    'vacuum',
    'setting',
    'mode',
    'fan level',
    'child lock',
    'buzzer',
    'display',
    'spray',
    'mist',
    'humidity',
    'suction',
  ],
  access: 'member',
  tier: 'v1.1',
});

const deviceAction = defineNodeKind({
  id: 'device.action',
  name: 'Run device action',
  category: 'devices',
  icon: 'play',
  class: 'effect',
  description:
    'Presses an action button of a device, such as resetting a filter or a consumable, starting a self clean, restarting a device or starting and stopping an oven. The action is picked from what the devices can do. Offline or unsupported devices are skipped and reported.',
  inputs: [
    TARGET_INPUT,
    {
      name: 'action',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which action to run.',
      summary: true,
      ui: { label: 'Action', optionsFrom: 'device.actions' },
    },
    REQUIRE_ALL_INPUT,
  ],
  outputs: APPLIANCE_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'relative', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Run {action} on {target}',
  keywords: [
    'action',
    'press',
    'button',
    'reset',
    'filter',
    'self clean',
    'restart',
    'reboot',
    'consumable',
    'brush',
    'oven',
    'start',
    'stop',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const APPLIANCE_KINDS: readonly NodeKind[] = [applianceSet, deviceAction];
