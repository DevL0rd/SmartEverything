import {
  BOTTLE_CHARGING,
  BOTTLE_LINKS,
  BOTTLE_STATE_OPTIONS,
  type DeviceCapability,
} from '@smarteverything/domain';

type Access = DeviceCapability['access'];

const MAX_VOLUME_ML = 1100;

const MAX_TEXT = 40;

const CLOCK_TEXT = 5;

function number(
  key: DeviceCapability['key'],
  label: string,
  range: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly unit: string;
  },
  access: Access = 'read',
): DeviceCapability {
  return { key, label, access, value: { kind: 'number', ...range } };
}

function choice(
  key: DeviceCapability['key'],
  label: string,
  options: readonly string[],
  access: Access = 'read',
): DeviceCapability {
  return { key, label, access, value: { kind: 'enum', options: [...options] } };
}

function text(
  key: DeviceCapability['key'],
  label: string,
  maxLength: number,
  access: Access = 'read',
): DeviceCapability {
  return { key, label, access, value: { kind: 'text', maxLength } };
}

function action(key: DeviceCapability['key'], label: string): DeviceCapability {
  return { key, label, access: 'write', value: { kind: 'action' } };
}

export const BOTTLE_CAPABILITIES: readonly DeviceCapability[] = [
  number('bottle_volume', 'Water in bottle', { min: 0, max: MAX_VOLUME_ML, step: 1, unit: 'ml' }),
  number('water_level', 'Bottle level', { min: 0, max: 110, step: 1, unit: '%' }),
  number('battery', 'Cap battery', { min: 0, max: 100, step: 1, unit: '%' }),
  choice('bottle_state', 'Cap', BOTTLE_STATE_OPTIONS),
  choice('bottle_charging', 'Cap charging', BOTTLE_CHARGING),
  choice('bottle_link', 'Bottle sync', BOTTLE_LINKS),
  {
    key: 'bottle_reliable',
    label: 'Level trustworthy',
    access: 'read',
    value: { kind: 'boolean' },
  },
  choice('uv_clean', 'UV clean', ['stop'], 'write'),
  text('last_uv_clean', 'Last UV clean', MAX_TEXT),
  text('last_drink', 'Last drink', MAX_TEXT),
  text('last_seen', 'Last seen', MAX_TEXT),
  text('firmware', 'Firmware', MAX_TEXT),
  number('signal_strength', 'Signal', { min: -127, max: 20, step: 1, unit: 'dBm' }),
  choice('hydration_reminder', 'Drink reminder', ['off', 'interval_fixed'], 'read_write'),
  number(
    'reminder_interval',
    'Reminder every',
    { min: 15, max: 120, step: 5, unit: 'min' },
    'read_write',
  ),
  text('reminder_from', 'Reminders start', CLOCK_TEXT, 'read_write'),
  text('reminder_to', 'Reminders end', CLOCK_TEXT, 'read_write'),
  {
    key: 'reminder_colour',
    label: 'Reminder colour',
    access: 'read_write',
    value: { kind: 'color' },
  },
  choice('quiet_hours', 'Quiet hours', ['off', 'on', 'auto'], 'read_write'),
  text('quiet_from', 'Quiet hours start', CLOCK_TEXT, 'read_write'),
  text('quiet_to', 'Quiet hours end', CLOCK_TEXT, 'read_write'),
  action('bottle_sync', 'Sync bottle'),
  action('measure_level', 'Measure level'),
];
