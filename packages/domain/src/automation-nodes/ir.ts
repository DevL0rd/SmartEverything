import type { FlowType } from '../automation-v3/types';
import { IR_AC_MODES, IR_SPEED_STEPS, IR_TEMP_RANGE } from '../ir-remote-state';
import { CLIMATE_POWER_CHOICES } from './climate';
import { defineNodeKind, type NodeKind } from './define';
import { DEVICE_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };

export const IR_MODE_CHOICES = IR_AC_MODES.map((mode) => ({ id: mode, label: mode }));

const irApplianceSet = defineNodeKind({
  id: 'ir.appliance_set',
  name: 'Set IR appliance',
  category: 'devices',
  icon: 'snowflake',
  class: 'effect',
  description:
    'Brings an infrared appliance, such as an air conditioner, to a state in one step: power, mode, target temperature and fan speed. The hub works out which buttons to send from the state it assumes, and sends them through the appliance’s IR blaster. Anything left unset stays as it is.',
  inputs: [
    {
      name: 'appliance',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which infrared appliance.',
      summary: true,
      ui: { label: 'Appliance', optionsFrom: 'ir.appliances' },
    },
    {
      name: 'power',
      type: { t: 'choice', options: [...CLIMATE_POWER_CHOICES] },
      required: false,
      default: 'keep',
      static: true,
      description: 'Turn the appliance on or off, or leave its power as it is.',
      ui: { label: 'Power' },
    },
    {
      name: 'mode',
      type: { t: 'choice', options: [...IR_MODE_CHOICES] },
      required: false,
      static: true,
      description: 'The air conditioner mode.',
      summary: true,
      ui: { label: 'Mode' },
    },
    {
      name: 'temperature',
      type: { t: 'number' },
      required: false,
      live: true,
      description: 'The target temperature in °C.',
      summary: true,
      ui: {
        label: 'Target temperature',
        min: IR_TEMP_RANGE.min,
        max: IR_TEMP_RANGE.max,
        step: 1,
        unit: '°C',
      },
    },
    {
      name: 'fan',
      type: { t: 'number' },
      required: false,
      live: true,
      description: 'The fan speed step, from the slowest (1) to the fastest.',
      ui: { label: 'Fan speed', min: 1, max: IR_SPEED_STEPS, step: 1 },
    },
  ],
  outputs: [
    { name: 'device', type: DEVICE_REF, description: 'The appliance, shown as a device.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set {appliance} to {temperature}',
  keywords: [
    'infrared',
    'ir',
    'air conditioner',
    'ac',
    'appliance',
    'temperature',
    'fan',
    'mode',
    'power',
    'remote',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const IR_KINDS: readonly NodeKind[] = [irApplianceSet];
