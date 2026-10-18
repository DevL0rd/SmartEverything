import {
  LAUNDRY_AMOUNT_OPTIONS,
  LAUNDRY_DELAY_OPTIONS,
  LAUNDRY_DOOR_LINES,
  LAUNDRY_DRY_MODE_OPTIONS,
  LAUNDRY_DRY_TARGET_OPTIONS,
  LAUNDRY_FAULT_OPTIONS,
  LAUNDRY_LEVEL_OPTIONS,
  LAUNDRY_RUN_STATUS_OPTIONS,
  LAUNDRY_STATUS_OPTIONS,
  LAUNDRY_TANK_OPTIONS,
} from '../../laundry-copy';
import { LAUNDRY_PROGRAMS } from '../../laundry-programs';
import { LAUNDRY_ROLES, UNLOAD_PENDING_KEY, type LaundryRole } from '../../laundry-roles';
import type { CapabilityKey } from '../../capabilities';
import type { CapabilityOverride, CapabilityOverrides, ModelOverride } from '../types';
import { diagnostic, hidden, XIAOMI_DEVICE_INFORMATION } from './xiaomi-common';

export type LaundryKeys = Readonly<Partial<Record<LaundryRole | 'fault', CapabilityKey>>>;

type RolePresentation = Omit<CapabilityOverride, 'role'>;

const MINUTES = 'min';
const SEARCH_WORDS = ['washer', 'washing machine', 'laundry'] as const;

function entry(
  label: string,
  tier: CapabilityOverride['tier'],
  groupLabel: string,
  extra: Partial<CapabilityOverride> = {},
): RolePresentation {
  return { label, tier, group: 'cleaning', groupLabel, ...extra };
}

const NUMBER_STEPS = (values: readonly number[], suffix: string): Record<string, string> =>
  Object.fromEntries(values.map((value) => [String(value), `${String(value)} ${suffix}`]));

const TEMPERATURE_OPTIONS: Readonly<Record<string, string>> = {
  '0': 'Cold',
  ...NUMBER_STEPS([20, 30, 40, 60, 90], '°C'),
};

const SPIN_OPTIONS: Readonly<Record<string, string>> = {
  '0': 'No spin',
  ...NUMBER_STEPS([400, 600, 800, 1000, 1200, 1400], 'rpm'),
};

const PROGRAM_OPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  LAUNDRY_PROGRAMS.map((program) => [program.raw, program.label]),
);

const CYCLE = 'Cycle';
const OPTIONS = 'Program options';
const DELAY = 'Delay';
const DETERGENT = 'Detergent';
const SOFTENER = 'Softener';
const MAINTENANCE = 'Maintenance';
const SETTINGS = 'Settings';
const USAGE = 'Usage';

const ROLE_PRESENTATIONS: Readonly<Record<LaundryRole | 'fault', RolePresentation>> = {
  laundry_status: entry('Status', 'reading', CYCLE, {
    options: LAUNDRY_STATUS_OPTIONS,
    keywords: [...SEARCH_WORDS, 'state'],
  }),
  laundry_phase: entry('Cycle step', 'reading', CYCLE, {
    options: LAUNDRY_RUN_STATUS_OPTIONS,
    keywords: ['phase', 'stage', 'rinsing', 'spinning', 'washing'],
  }),
  laundry_phases: diagnostic('Planned steps', { groupLabel: CYCLE }),
  laundry_program: entry('Program', 'control', CYCLE, {
    options: PROGRAM_OPTIONS,
    keywords: [...SEARCH_WORDS, 'program', 'cycle', 'wash'],
  }),
  laundry_dial: diagnostic('Programs on the machine', { groupLabel: CYCLE }),
  remaining_minutes: entry('Time left', 'reading', CYCLE, {
    unit: MINUTES,
    keywords: ['remaining', 'finish', 'done'],
  }),
  door_state: entry('Door', 'reading', CYCLE, {
    options: LAUNDRY_DOOR_LINES,
    keywords: ['lock', 'open'],
  }),
  door_release: entry('Unlock door', 'control', CYCLE, {
    keywords: ['add a garment', 'open door'],
  }),
  cycle_start: entry('Start', 'primary', CYCLE, {
    danger: { tier: 'none' },
    keywords: [...SEARCH_WORDS, 'start wash', 'begin'],
  }),
  cycle_pause: entry('Pause', 'primary', CYCLE, { keywords: [...SEARCH_WORDS, 'resume'] }),
  cycle_stop: entry('Stop', 'control', CYCLE, {
    danger: { tier: 'confirm' },
    keywords: [...SEARCH_WORDS, 'cancel', 'stop wash'],
  }),
  wash_temperature: entry('Temperature', 'control', OPTIONS, {
    options: TEMPERATURE_OPTIONS,
    keywords: ['degrees', 'cold', 'hot'],
  }),
  spin_speed: entry('Spin speed', 'control', OPTIONS, {
    options: SPIN_OPTIONS,
    keywords: ['spin', 'rpm', 'revolutions'],
  }),
  rinse_count: entry('Rinses', 'control', OPTIONS, { keywords: ['rinse', 'extra rinse'] }),
  wash_minutes: entry('Wash time', 'control', OPTIONS, { unit: MINUTES }),
  soak_minutes: entry('Soak', 'control', OPTIONS, {
    unit: MINUTES,
    keywords: ['soak', 'pre-soak'],
  }),
  dry_mode: entry('Drying', 'control', OPTIONS, {
    options: LAUNDRY_DRY_MODE_OPTIONS,
    keywords: ['dryer', 'dry'],
  }),
  dry_minutes: entry('Drying time', 'control', OPTIONS, { unit: MINUTES }),
  dry_target: entry('Dryness', 'control', OPTIONS, { options: LAUNDRY_DRY_TARGET_OPTIONS }),
  steam_hygiene: entry('Steam hygiene', 'control', OPTIONS, {
    keywords: ['steam', 'sterilise', 'sanitise'],
  }),
  extra_water: entry('Extra water', 'control', OPTIONS, {
    keywords: ['high water', 'water level'],
  }),
  quiet_mode: entry('Quiet mode', 'control', OPTIONS, { keywords: ['night', 'sleep', 'noise'] }),
  anti_crease_minutes: entry('Anti-crease after finish', 'control', OPTIONS, {
    unit: MINUTES,
    keywords: ['tumble', 'wrinkles', 'shake'],
  }),
  anti_crease_waiting: entry('Waiting to tumble', 'reading', CYCLE),
  anti_crease_start: entry('Start tumbling', 'control', OPTIONS),
  anti_crease_stop: entry('Stop tumbling', 'control', OPTIONS),
  smart_mode: entry('AI mode', 'setting', SETTINGS, { keywords: ['smart', 'auto'] }),
  one_click: entry('One-click wash', 'setting', SETTINGS, { keywords: ['favourite', 'button'] }),
  delay_mode: entry('When', 'control', DELAY, {
    options: LAUNDRY_DELAY_OPTIONS,
    keywords: ['delay', 'schedule', 'finish by', 'start at'],
  }),
  delay_minutes: entry('Delay', 'control', DELAY, { unit: MINUTES, keywords: ['delay', 'timer'] }),
  detergent_level: entry('Detergent', 'reading', DETERGENT, {
    options: LAUNDRY_LEVEL_OPTIONS,
    keywords: ['refill', 'soap'],
  }),
  detergent_auto: entry('Auto-dose detergent', 'setting', DETERGENT, { keywords: ['dispenser'] }),
  detergent_amount: entry('Detergent amount', 'setting', DETERGENT, {
    options: LAUNDRY_AMOUNT_OPTIONS,
  }),
  softener_level: entry('Softener', 'reading', SOFTENER, {
    options: LAUNDRY_LEVEL_OPTIONS,
    keywords: ['refill', 'conditioner'],
  }),
  softener_auto: entry('Auto-dose softener', 'setting', SOFTENER, { keywords: ['dispenser'] }),
  softener_amount: entry('Softener amount', 'setting', SOFTENER, {
    options: LAUNDRY_AMOUNT_OPTIONS,
  }),
  disinfectant: entry('Disinfectant in softener tank', 'setting', SOFTENER, {
    keywords: ['sanitiser'],
  }),
  filter_clean: entry('Filter', 'maintenance', MAINTENANCE, {
    states: ['Needs cleaning', 'Clean'],
    keywords: ['drain filter', 'clean'],
  }),
  tank_clean_slot: entry('Tank to rinse', 'maintenance', MAINTENANCE, {
    options: LAUNDRY_TANK_OPTIONS,
  }),
  tank_clean_minutes: entry('Tank rinse time left', 'maintenance', MAINTENANCE, {
    unit: MINUTES,
  }),
  tank_clean_start: entry('Rinse tank', 'maintenance', MAINTENANCE, {
    danger: { tier: 'confirm' },
    keywords: ['dispenser', 'clean'],
  }),
  tank_clean_stop: entry('Stop tank rinse', 'maintenance', MAINTENANCE),
  drum_light: entry('Drum light', 'setting', SETTINGS, { group: 'lighting', keywords: ['lamp'] }),
  noise_reduction: entry('Noise reduction', 'setting', SETTINGS, { keywords: ['quiet'] }),
  detergent_reminder: entry('Remind me when detergent is low', 'setting', SETTINGS),
  softener_reminder: entry('Remind me when softener is low', 'setting', SETTINGS),
  remote_control: entry('Remote control', 'reading', CYCLE, {
    states: ['Remote control on', 'Remote control off'],
    keywords: ['remote', 'app control'],
  }),
  wash_count: entry('Washes', 'reading', USAGE, { keywords: ['count', 'cycles'] }),
  dry_count: entry('Dries', 'reading', USAGE, { keywords: ['count', 'cycles'] }),
  energy_use: diagnostic('Power counter', { groupLabel: USAGE, group: 'energy' }),
  water_use: diagnostic('Water counter', { groupLabel: USAGE, group: 'energy' }),
  unload_pending: entry('Waiting to be unloaded', 'reading', CYCLE, {
    states: ['Clothes waiting', 'Unloaded'],
    keywords: ['unload', 'empty', 'remind', 'clothes inside'],
  }),
  fault: entry('Fault', 'maintenance', CYCLE, {
    options: LAUNDRY_FAULT_OPTIONS,
    keywords: ['error', 'problem'],
  }),
};

const STANDARD_LAUNDRY: CapabilityOverrides = {
  power: { label: 'Power', tier: 'primary', keywords: [...SEARCH_WORDS, 'dryer'] },
  child_lock: { label: 'Child lock', tier: 'setting', group: 'security' },
  buzzer: { label: 'Button sounds', tier: 'setting', keywords: ['beep', 'sound'] },
};

const ROLE_NAMES = [...LAUNDRY_ROLES, 'fault'] as const;

export function laundryOverride(keys: LaundryKeys, extra: CapabilityOverrides = {}): ModelOverride {
  const roles: CapabilityOverrides = Object.fromEntries(
    ROLE_NAMES.flatMap((role) => {
      const key = keys[role];
      return key === undefined ? [] : [[key, { ...ROLE_PRESENTATIONS[role], role }]];
    }),
  );
  return {
    family: 'laundry',
    capabilities: { ...XIAOMI_DEVICE_INFORMATION, ...STANDARD_LAUNDRY, ...roles, ...extra },
    unlisted: { tier: 'diagnostic', group: 'system' },
  };
}

const XIAOMI_WASHER_KEYS: LaundryKeys = {
  laundry_status: 'raw:2.2',
  laundry_phase: 'raw:2.11',
  laundry_phases: 'raw:2.20',
  laundry_program: 'raw:2.3',
  laundry_dial: 'raw:18.1',
  remaining_minutes: 'raw:2.10',
  door_state: 'raw:2.9',
  door_release: 'raw:action.2.7',
  cycle_start: 'raw:action.2.2',
  cycle_pause: 'raw:action.2.3',
  cycle_stop: 'raw:action.2.1',
  wash_temperature: 'raw:2.5',
  spin_speed: 'raw:2.7',
  rinse_count: 'raw:2.6',
  wash_minutes: 'raw:2.21',
  soak_minutes: 'raw:2.12',
  dry_mode: 'raw:2.26',
  dry_minutes: 'raw:2.27',
  dry_target: 'raw:2.33',
  steam_hygiene: 'raw:2.18',
  extra_water: 'raw:2.19',
  quiet_mode: 'raw:2.23',
  anti_crease_minutes: 'raw:2.24',
  anti_crease_waiting: 'raw:2.30',
  anti_crease_start: 'raw:action.2.6',
  anti_crease_stop: 'raw:action.2.5',
  smart_mode: 'raw:2.36',
  one_click: 'raw:2.35',
  delay_mode: 'raw:2.16',
  delay_minutes: 'raw:2.17',
  detergent_level: 'raw:8.1',
  detergent_auto: 'raw:8.2',
  detergent_amount: 'raw:8.3',
  softener_level: 'raw:9.1',
  softener_auto: 'raw:9.2',
  softener_amount: 'raw:9.3',
  disinfectant: 'raw:9.4',
  filter_clean: 'raw:2.42',
  tank_clean_slot: 'raw:11.1',
  tank_clean_minutes: 'raw:11.2',
  tank_clean_start: 'raw:action.11.1',
  tank_clean_stop: 'raw:action.11.2',
  drum_light: 'raw:12.1',
  noise_reduction: 'raw:16.5',
  detergent_reminder: 'raw:19.1',
  softener_reminder: 'raw:19.2',
  remote_control: 'raw:17.1',
  wash_count: 'raw:2.13',
  dry_count: 'raw:2.37',
  energy_use: 'raw:2.39',
  water_use: 'raw:2.40',
  unload_pending: UNLOAD_PENDING_KEY,
  fault: 'raw:2.4',
};

const XIAOMI_WASHER_EXTRAS: CapabilityOverrides = {
  'raw:action.2.4': diagnostic('Apply settings'),
  'raw:29.1': hidden('Store demo mode'),
  'raw:6.1': hidden('Plugin connection'),
  'raw:action.6.1': hidden('Connect plugin'),
  'raw:action.6.2': hidden('Disconnect plugin'),
  'raw:8.4': hidden('Detergent dose notice'),
  'raw:9.5': hidden('Softener dose notice'),
};

export const WASHER_F29GL: ModelOverride = laundryOverride(
  XIAOMI_WASHER_KEYS,
  XIAOMI_WASHER_EXTRAS,
);
