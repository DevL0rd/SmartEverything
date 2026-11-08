import { VACUUM_CLEANING_OPTIONS } from '../../vacuum-status';
import type { CapabilityRole, CapabilityOverride, CapabilityOverrides, Danger } from '../types';

export const VACUUM_GROUPS = {
  cleaning: 'Cleaning',
  rooms: 'Rooms and zones',
  dock: 'Dock',
  care: 'Care',
  map: 'Map',
  voice: 'Voice and sound',
  camera: 'Camera and AI',
  dnd: 'Do not disturb',
  system: 'System',
} as const;

type GroupLabel = (typeof VACUUM_GROUPS)[keyof typeof VACUUM_GROUPS];

type Tier = CapabilityOverride['tier'];

type Extra = Partial<Omit<CapabilityOverride, 'label' | 'tier' | 'role' | 'groupLabel'>>;

const NONE: Danger = { tier: 'none' };
const CONFIRM: Danger = { tier: 'confirm' };
const TYPED_DELETE: Danger = { tier: 'typed', word: 'DELETE' };

const ROBOT = ['robot', 'vacuum', 'hoover'] as const;
const RAW_NOTE = 'raw, unit unconfirmed';

export type VacuumBuilder = (
  role: CapabilityRole | undefined,
  label: string,
  tier: Tier,
  extra?: Extra,
) => CapabilityOverride;

export function vacuumIn(groupLabel: GroupLabel): VacuumBuilder {
  return (role, label, tier, extra = {}) => {
    const group = tier === 'diagnostic' || tier === 'hidden' ? 'system' : 'cleaning';
    return { label, tier, group, groupLabel, ...(role === undefined ? {} : { role }), ...extra };
  };
}

export function vacuumActionIn(groupLabel: GroupLabel): VacuumBuilder {
  const build = vacuumIn(groupLabel);
  return (role, label, tier, extra = {}) => build(role, label, tier, { danger: NONE, ...extra });
}

const STATUS_OPTIONS: Readonly<Record<string, string>> = {
  Idle: 'Standby',
  Charging: 'Charging',
  BreakCharging: 'Recharging to resume',
  Sweeping: 'Working',
  Paused: 'Pausing',
  'Go Charging': 'Returning',
  GoWash: 'Cleaning the mop',
  Remote: 'Remote controlling',
  Charged: 'Fully charged',
  BuildingMap: 'Mapping',
  Updating: 'Updating',
  MultiTaskStationWorking: 'Station working (cleaning)',
  MultiTaskRecharge: 'Switching tasks',
  StationWorking: 'Station working (charging)',
  Error: 'Error',
  'Sweeping and Mopping': 'Sweeping and mopping',
  Mopping: 'Mopping',
  MappingPause: 'Pausing map creation',
  GoChargeBreak: 'Returning to recharge',
  WashBreak: 'Returning midway',
  GoChargeBuildingMap: 'Returning after mapping',
  GoChargeInStationAssistingCleaning: 'Returning',
  SelfChecking: 'Self-checking',
  Summoning: 'Summoning',
  SweepSummoning: 'Cleaning summoned area',
};

const CLEANING_OPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  VACUUM_CLEANING_OPTIONS.map((option) => [
    option,
    option === 'docked' ? 'Fully charged' : option === 'servicing' ? 'Station working' : option,
  ]),
);

const MODE_OPTIONS: Readonly<Record<string, string>> = {
  Sweep: 'Vacuuming',
  'Sweep Mop': 'Vacuuming and mopping',
  'Sweep Before Mopping': 'Vacuuming before mopping',
};

const SCOPE_OPTIONS: Readonly<Record<string, string>> = {
  Global: 'Global',
  Zone: 'Zone',
  Area: 'Area',
  Edge: 'Edge',
  Costum: 'Custom',
  Point: 'Point',
  'Custom Area': 'Custom area',
  Appointment: 'Appointment',
  Linkage: 'Linkage',
  Fast: 'Fast',
  'AI Hosting': 'AI hosting',
};

const TIMES_OPTIONS: Readonly<Record<string, string>> = {
  'One Time': 'Once',
  'Two Time': 'Twice',
  'Three Time': 'Three times',
};

const SUCTION_OPTIONS: Readonly<Record<string, string>> = {
  Silent: 'Silent',
  Basic: 'Standard',
  Strong: 'Strong',
  'Full Speed': 'Turbo',
};

const WATER_OPTIONS: Readonly<Record<string, string>> = {
  Off: 'Off',
  Level1: 'Level 1',
  Level2: 'Level 2',
  Level3: 'Level 3',
};

const SWEEP_MOP_OPTIONS: Readonly<Record<string, string>> = {
  Idle: 'Idle',
  Sweeping: 'Sweeping',
  Mopping: 'Mopping',
};

const CHARGING_OPTIONS: Readonly<Record<string, string>> = {
  Charging: 'Charging',
  'Not Charging': 'Not charging',
  'Not Chargeable': 'Not chargeable',
};

const MAP_SWITCH_OPTIONS: Readonly<Record<string, string>> = { Manual: 'Manual', Auto: 'Auto' };

const clean = vacuumIn(VACUUM_GROUPS.cleaning);
const rooms = vacuumIn(VACUUM_GROUPS.rooms);
const map = vacuumIn(VACUUM_GROUPS.map);
const system = vacuumIn(VACUUM_GROUPS.system);
const cleanAction = vacuumActionIn(VACUUM_GROUPS.cleaning);
const roomsAction = vacuumActionIn(VACUUM_GROUPS.rooms);
const mapAction = vacuumActionIn(VACUUM_GROUPS.map);
const systemAction = vacuumActionIn(VACUUM_GROUPS.system);

const CONFIRMED: Extra = { danger: CONFIRM };
const TYPED: Extra = { danger: TYPED_DELETE };
const SCHEDULE_WORDS = ['schedule', 'timer', 'appointment'] as const;

const UNNAMED_PROPERTIES: CapabilityOverrides = Object.fromEntries(
  ['2.37', '2.49', '2.50', '2.51', '2.52', '2.55', '2.63', '2.69'].map((address) => [
    `raw:${address}`,
    system(undefined, `Unnamed entry ${address}`, 'diagnostic'),
  ]),
);

const CLEANING_PROPERTIES: CapabilityOverrides = {
  cleaning: clean(undefined, 'Cleaning', 'primary', {
    options: CLEANING_OPTIONS,
    keywords: [...ROBOT, 'dock', 'start', 'pause'],
  }),
  suction: clean(undefined, 'Suction', 'control', {
    options: SUCTION_OPTIONS,
    keywords: [...ROBOT, 'power', 'silent', 'standard', 'strong', 'turbo', 'full speed'],
  }),
  mop_level: clean(undefined, 'Water output for mopping', 'control', {
    options: WATER_OPTIONS,
    keywords: ['mop', 'water', 'wet', 'level'],
  }),
  battery: clean(undefined, 'Battery', 'reading', {
    group: 'power',
    keywords: [...ROBOT, 'charge', 'percent'],
  }),
  'raw:2.1': system(undefined, 'Robot software version', 'diagnostic'),
  'raw:2.2': clean('vacuum_status', 'Status', 'reading', {
    options: STATUS_OPTIONS,
    keywords: [...ROBOT, 'state', 'working', 'standby', 'charging'],
  }),
  'raw:2.3': clean('fault', 'Device fault', 'maintenance', {
    keywords: ['error', 'problem', 'alert', 'stuck'],
  }),
  'raw:2.66': system('vacuum_fault_ids', 'Active fault ids', 'diagnostic'),
  'raw:2.4': clean('vacuum_mode', 'Cleaning mode', 'control', {
    options: MODE_OPTIONS,
    keywords: [...ROBOT, 'mop', 'sweep', 'vacuuming'],
  }),
  'raw:2.5': clean('vacuum_scope', 'Cleaning type', 'reading', {
    options: SCOPE_OPTIONS,
    readOnly: true,
  }),
  'raw:2.6': clean('vacuum_area', `Cleaning area (${RAW_NOTE})`, 'diagnostic'),
  'raw:2.7': clean('vacuum_seconds', 'Cleaning time', 'reading', { clock: 'seconds' }),
  'raw:2.8': clean('vacuum_repeats', 'Cleaning times', 'control', { options: TIMES_OPTIONS }),
  'raw:2.11': clean('vacuum_mop_attached', 'Mop status', 'reading', {
    states: ['Mop attached', 'No mop'],
  }),
  'raw:2.17': clean('vacuum_last_clean_time', 'Last clean time (Unix seconds)', 'diagnostic'),
  'raw:2.25': clean('vacuum_asleep', 'Sleeping', 'reading', { states: ['Sleeping', 'Awake'] }),
  'raw:2.26': clean('vacuum_locating', 'Positioning', 'diagnostic', {
    states: ['Positioning', 'Positioned'],
  }),
  'raw:2.27': map(undefined, 'Map complete dialog', 'diagnostic'),
  'raw:2.38': clean(undefined, 'Exit remote dialog', 'diagnostic'),
  'raw:2.85': clean('vacuum_total_area', `Total cleaned area (${RAW_NOTE})`, 'diagnostic'),
  'raw:2.86': clean('vacuum_total_cleans', 'Total cleans', 'reading'),
  'raw:2.87': clean('vacuum_total_seconds', 'Total cleaning time', 'reading', { clock: 'minutes' }),
  'raw:2.89': clean('vacuum_progress', 'Cleaning progress', 'reading', { unit: '%' }),
  'raw:2.96': clean('vacuum_sweep_mop_status', 'Sweeping or mopping', 'reading', {
    options: SWEEP_MOP_OPTIONS,
  }),
  'raw:3.2': clean('charging_state', 'Charging state', 'reading', {
    group: 'power',
    options: CHARGING_OPTIONS,
  }),
  'raw:3.3': system('vacuum_voltage', 'Battery voltage (raw)', 'diagnostic'),
};

const ROOM_PROPERTIES: CapabilityOverrides = {
  'raw:2.12': rooms('vacuum_zones', 'Zone IDs', 'hidden'),
  'raw:2.13': rooms('vacuum_no_go', 'Restricted sweep areas', 'hidden'),
  'raw:2.14': rooms('vacuum_walls', 'Restricted walls', 'hidden'),
  'raw:2.15': rooms(undefined, 'Room IDs', 'hidden'),
  'raw:2.16': rooms('vacuum_rooms', 'Room information', 'hidden', { keywords: ['rooms'] }),
  'raw:2.19': clean('vacuum_schedules', 'Scheduled cleans (order clean)', 'hidden', {
    keywords: SCHEDULE_WORDS,
  }),
  'raw:2.40': clean('vacuum_job', 'Current cleaning config', 'hidden'),
  'raw:2.42': clean('vacuum_user_sweep_config', 'Custom sweep presets', 'hidden'),
  'raw:2.43': clean('vacuum_user_sweep_id', 'Custom sweep id', 'hidden'),
  'raw:2.56': rooms('vacuum_ai_objects', 'AI detected objects', 'hidden'),
  'raw:2.57': rooms('vacuum_furniture', 'Furniture', 'hidden'),
  'raw:2.58': rooms('vacuum_carpets', 'Carpets', 'hidden'),
  'raw:2.99': rooms('vacuum_sills', 'Sills', 'hidden'),
  'raw:2.102': rooms('vacuum_automation_furniture', 'Furniture for automation', 'hidden'),
  'raw:2.103': rooms('vacuum_hidden_zones', 'Hidden map zones', 'hidden'),
};

const FEED_PROPERTIES: CapabilityOverrides = {
  ...UNNAMED_PROPERTIES,
  'raw:2.24': system(undefined, 'Common params', 'hidden'),
  'raw:2.39': system(undefined, 'Remote button type', 'hidden'),
  'raw:2.65': map('vacuum_route', 'Vacuum route', 'hidden'),
  'raw:2.67': system('vacuum_action_result', 'Action result', 'hidden'),
  'raw:2.72': system('vacuum_notice', 'Notice', 'hidden'),
  'raw:2.104': system(undefined, 'Sweep command', 'hidden'),
  'raw:2.105': system(undefined, 'Sweep flag', 'hidden'),
  'raw:2.106': system(undefined, 'Sweep params', 'hidden'),
};

const MAP_PROPERTIES: CapabilityOverrides = {
  'raw:10.1': map('vacuum_map_object', 'Map object', 'hidden'),
  'raw:10.2': map('vacuum_trajectory_object', 'Trajectory object', 'hidden'),
  'raw:10.3': map('vacuum_clean_record', 'Clean record', 'hidden'),
  'raw:10.4': map('vacuum_position', 'Robot position', 'hidden'),
  'raw:10.5': map('vacuum_map_slots', 'Saved maps', 'hidden'),
  'raw:10.6': map('vacuum_map_id', 'Current map id', 'diagnostic'),
  'raw:10.7': map('vacuum_carpet_object', 'Carpet object', 'hidden'),
  'raw:10.8': map(undefined, 'Common params', 'hidden'),
  'raw:10.9': map('vacuum_map_3d', '3D map info', 'hidden'),
  'raw:10.10': map('vacuum_map_switch', 'Map switch method', 'setting', {
    options: MAP_SWITCH_OPTIONS,
  }),
  'raw:10.11': map('vacuum_map_upload_stop', 'Map upload stop', 'hidden'),
  'raw:10.12': map(undefined, 'Map upload stop result', 'hidden'),
  'raw:10.13': map('vacuum_backups', 'Map backups', 'hidden'),
  'raw:10.14': map('vacuum_restore_result', 'Restore map result', 'hidden'),
  'raw:10.15': map('vacuum_cloud_records', 'Cloud clean records', 'hidden'),
  'raw:vacuum_map': map(undefined, 'Map version', 'hidden'),
  'raw:vacuum_pose': map(undefined, 'Robot pose', 'hidden'),
  'raw:vacuum_fault': map(undefined, 'Active fault', 'hidden'),
  'raw:vacuum_room_links': map(undefined, 'Room links', 'hidden'),
};

const RUN_ACTIONS: CapabilityOverrides = {
  'raw:action.2.1': cleanAction('vacuum_start', 'Start cleanup', 'primary', {
    keywords: [...ROBOT, 'clean', 'start', 'begin', 'go'],
  }),
  'raw:action.2.2': cleanAction('vacuum_stop', 'End cleaning', 'control'),
  'raw:action.2.3': cleanAction('vacuum_dock', 'Stop and return to dock', 'primary', {
    keywords: [...ROBOT, 'dock', 'home', 'charge', 'return'],
  }),
  'raw:action.2.4': cleanAction('vacuum_start_sweep_only', 'Vacuum only', 'control'),
  'raw:action.2.6': cleanAction('vacuum_start_sweep_mop', 'Vacuum and mop', 'control'),
  'raw:action.2.7': cleanAction('vacuum_pause', 'Pause', 'primary'),
  'raw:action.2.8': cleanAction('vacuum_resume', 'Resume', 'primary'),
  'raw:action.2.9': cleanAction('vacuum_start_custom', 'Start custom sweep', 'extra'),
  'raw:action.2.22': cleanAction('vacuum_call_clean', 'Call clean', 'extra'),
  'raw:action.2.42': cleanAction('vacuum_start_user_sweep', 'Start custom clean', 'extra'),
  'raw:action.2.48': cleanAction('vacuum_close_alert', 'Close alert card', 'extra'),
  'raw:action.2.50': cleanAction('vacuum_sweep_before_mop', 'Vacuum before mopping', 'control'),
  'raw:action.2.51': cleanAction('vacuum_stop_working', 'Stop working', 'control'),
  'raw:action.2.59': cleanAction('vacuum_spot_clean', 'Spot cleaning', 'control'),
  'raw:action.3.1': cleanAction('vacuum_start_charge', 'Dock', 'control', {
    keywords: [...ROBOT, 'dock', 'charge', 'home'],
  }),
};

const TARGET_ACTIONS: CapabilityOverrides = {
  'raw:clean_rooms': roomsAction('vacuum_clean_rooms', 'Clean rooms', 'control', {
    keywords: [...ROBOT, 'room', 'kitchen', 'bedroom', 'living room'],
  }),
  'raw:clean_zones': roomsAction('vacuum_clean_zones', 'Clean zones', 'control', {
    keywords: [...ROBOT, 'zone', 'area', 'rectangle'],
  }),
  'raw:action.2.10': roomsAction('vacuum_get_zone_configs', 'Get zone settings', 'hidden'),
  'raw:action.2.11': roomsAction('vacuum_get_room_configs', 'Get room settings', 'hidden'),
  'raw:action.2.12': roomsAction('vacuum_set_zone', 'Set zone', 'hidden'),
  'raw:action.2.13': roomsAction('vacuum_set_room_settings', 'Set room settings', 'extra'),
  'raw:action.2.14': roomsAction('vacuum_split_room', 'Split room', 'extra', CONFIRMED),
  'raw:action.2.15': roomsAction('vacuum_merge_rooms', 'Merge rooms', 'extra', CONFIRMED),
  'raw:action.2.16': roomsAction(undefined, 'Start room sweep', 'hidden'),
  'raw:action.2.37': roomsAction(undefined, 'Start zone sweep', 'hidden'),
  'raw:action.2.52': roomsAction('vacuum_skip_cleaning', 'Skip cleaning', 'control'),
  'raw:action.2.53': roomsAction('vacuum_final_cleaning', 'Final cleaning', 'extra', {
    keywords: ['clean last'],
  }),
  'raw:action.2.54': roomsAction('vacuum_temp_clean_room', 'Clean room now', 'extra'),
  'raw:action.2.55': roomsAction('vacuum_temp_clean_zone', 'Clean zone now', 'extra'),
  'raw:action.2.56': roomsAction('vacuum_clean_furniture', 'Clean furniture', 'extra'),
  'raw:action.2.62': roomsAction('vacuum_clean_object', 'Clean object', 'extra'),
};

const MAPPING_ACTIONS: CapabilityOverrides = {
  'raw:action.2.17': mapAction('vacuum_build_map', 'Build map', 'extra', {
    ...CONFIRMED,
    keywords: ['map', 'explore', 'mapping'],
  }),
  'raw:action.2.33': mapAction('vacuum_resume_mapping', 'Resume mapping', 'extra'),
  'raw:action.2.34': mapAction('vacuum_stop_mapping', 'Stop mapping and dock', 'extra'),
  'raw:action.2.35': mapAction('vacuum_pause_mapping', 'Pause mapping', 'extra'),
  'raw:action.2.47': mapAction('vacuum_get_route', 'Get route', 'hidden'),
  'raw:action.2.60': mapAction('vacuum_recognize_object', 'AI recognize object', 'hidden'),
  'raw:action.2.61': mapAction('vacuum_ai_picture', 'Get AI picture', 'hidden'),
  'raw:action.2.65': mapAction('vacuum_rotate_map', 'Rotate map', 'extra', CONFIRMED),
  'raw:action.10.1': mapAction('vacuum_clear_map', 'Clear map', 'extra', {
    ...TYPED,
    keywords: ['erase map', 'wipe map'],
  }),
  'raw:action.10.2': mapAction('vacuum_delete_map', 'Delete map', 'extra', {
    ...TYPED,
    keywords: ['remove map', 'saved map'],
  }),
  'raw:action.10.3': mapAction('vacuum_set_map', 'Set map', 'extra', {
    ...CONFIRMED,
    keywords: ['switch map', 'floor'],
  }),
  'raw:action.10.4': mapAction('vacuum_save_map', 'Save map', 'extra', CONFIRMED),
  'raw:action.10.5': mapAction('vacuum_auto_partition', 'Auto room partition', 'extra', {
    ...CONFIRMED,
    keywords: ['split rooms', 'partition'],
  }),
  'raw:action.10.6': mapAction('vacuum_set_map_name', 'Set map name', 'extra', CONFIRMED),
  'raw:action.10.7': mapAction('vacuum_refresh', 'Update properties data', 'hidden'),
  'raw:action.10.8': mapAction('vacuum_restore_map', 'Restore map', 'extra', {
    ...TYPED,
    keywords: ['backup', 'replace map'],
  }),
};

const PROGRAM_ACTIONS: CapabilityOverrides = {
  'raw:action.2.23': cleanAction('vacuum_add_schedule', 'Add scheduled clean', 'extra', {
    ...CONFIRMED,
    keywords: SCHEDULE_WORDS,
  }),
  'raw:action.2.24': cleanAction('vacuum_modify_schedule', 'Change scheduled clean', 'extra', {
    ...CONFIRMED,
    keywords: SCHEDULE_WORDS,
  }),
  'raw:action.2.25': cleanAction('vacuum_delete_schedule', 'Delete scheduled clean', 'extra', {
    ...TYPED,
    keywords: SCHEDULE_WORDS,
  }),
  'raw:action.2.38': cleanAction('vacuum_add_user_sweep', 'Add custom sweep', 'extra', CONFIRMED),
  'raw:action.2.39': cleanAction('vacuum_delete_user_sweep', 'Delete custom sweep', 'extra', TYPED),
  'raw:action.2.40': cleanAction(
    'vacuum_modify_user_sweep',
    'Change custom sweep',
    'extra',
    CONFIRMED,
  ),
  'raw:action.2.41': cleanAction('vacuum_set_user_sweep', 'Set custom sweep', 'extra', CONFIRMED),
};

const REMOTE_ACTIONS: CapabilityOverrides = {
  'raw:action.2.26': cleanAction('vacuum_remote_drive', 'Remote control', 'hidden', {
    ...CONFIRMED,
  }),
  'raw:action.2.27': systemAction('vacuum_try_listen', 'Try listen', 'hidden'),
  'raw:action.2.28': cleanAction('vacuum_enter_remote', 'Enter remote control', 'hidden'),
  'raw:action.2.29': cleanAction('vacuum_exit_remote', 'Exit remote control', 'hidden'),
  'raw:action.2.30': systemAction('vacuum_system_info', 'Get system info', 'hidden'),
};

export const XIAOMI_VACUUM_CLEANING: CapabilityOverrides = {
  ...CLEANING_PROPERTIES,
  ...ROOM_PROPERTIES,
  ...FEED_PROPERTIES,
  ...MAP_PROPERTIES,
  ...RUN_ACTIONS,
  ...TARGET_ACTIONS,
  ...MAPPING_ACTIONS,
  ...PROGRAM_ACTIONS,
  ...REMOTE_ACTIONS,
};
