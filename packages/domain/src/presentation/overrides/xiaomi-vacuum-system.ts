import type { JsonValue } from '../../values';
import type { CapabilityOverride, CapabilityOverrides, Danger } from '../types';
import { VACUUM_GROUPS, vacuumActionIn, vacuumIn } from './xiaomi-vacuum';

type Extra = Partial<Omit<CapabilityOverride, 'label' | 'tier' | 'role' | 'groupLabel'>>;

export interface VacuumEventPresentation {
  readonly label: string;
  readonly keywords: readonly string[];
}

const CONFIRM: Danger = { tier: 'confirm' };
const TYPED_RESET: Danger = { tier: 'typed', word: 'RESET' };

const ROBOT = ['robot', 'vacuum', 'hoover'] as const;
const CAMERA_WORDS = ['camera', 'video', 'privacy'] as const;
const SCHEDULE_WORDS = ['schedule', 'timer', 'appointment'] as const;
const CONFIRMED: Extra = { danger: CONFIRM };
const RESET: Extra = { danger: TYPED_RESET };
const CARE: Extra = { group: 'care' };
const HOURS: Extra = { ...CARE, unit: 'h' };
const PERCENT: Extra = { ...CARE, unit: '%' };
const SETTINGS_GROUP: Extra = { group: 'system' };
const VOICE_GROUP: Extra = { group: 'media' };
const CAMERA_GROUP: Extra = { group: 'camera' };

const care = vacuumIn(VACUUM_GROUPS.care);
const careAction = vacuumActionIn(VACUUM_GROUPS.care);
const voice = vacuumIn(VACUUM_GROUPS.voice);
const voiceAction = vacuumActionIn(VACUUM_GROUPS.voice);
const quiet = vacuumIn(VACUUM_GROUPS.dnd);
const camera = vacuumIn(VACUUM_GROUPS.camera);
const cameraAction = vacuumActionIn(VACUUM_GROUPS.camera);
const system = vacuumIn(VACUUM_GROUPS.system);
const systemAction = vacuumActionIn(VACUUM_GROUPS.system);
const clean = vacuumIn(VACUUM_GROUPS.cleaning);
const cleanAction = vacuumActionIn(VACUUM_GROUPS.cleaning);
const dock = vacuumIn(VACUUM_GROUPS.dock);
const dockAction = vacuumActionIn(VACUUM_GROUPS.dock);
const map = vacuumIn(VACUUM_GROUPS.map);
const mapAction = vacuumActionIn(VACUUM_GROUPS.map);

const VOICE_STATUS_OPTIONS: Readonly<Record<string, string>> = {
  'Not Downloaded': 'Not downloaded',
  Downloading: 'Downloading',
  Downloaded: 'Downloaded',
  'Download Fail': 'Download failed',
  'Apply Success': 'Applied',
  'Apply Fail': 'Apply failed',
};

const FLASH_OPTIONS: Readonly<Record<string, string>> = {
  Auto: 'Auto',
  Open: 'On',
  Close: 'Off',
};

const VIDEO_WARNING_OPTIONS: Readonly<Record<string, string>> = {
  Voice: 'Voice',
  Light: 'Light',
  'Strong Reminder': 'Strong reminder',
};

const LOW_REGION_OPTIONS: Readonly<Record<string, string>> = {
  'Safe Mode': 'Safe',
  'Extreme Mode': 'Extreme',
};

const LIDAR_OPTIONS: Readonly<Record<string, string>> = {
  Bottom: 'Lowered',
  Top: 'Raised',
  Lifting: 'Rising',
  Downing: 'Lowering',
};

const byteOf = (packed: number, shift: number): number => (packed >>> shift) & 0xff;

const clockOf = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export function dndPeriodText(value: JsonValue): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    return JSON.stringify(value);
  }
  const start = clockOf(byteOf(value, 24), byteOf(value, 16));
  const end = clockOf(byteOf(value, 8), byteOf(value, 0));
  return `${start} to ${end}`;
}

const DEVICE_INFORMATION: CapabilityOverrides = {
  'raw:1.1': system(undefined, 'Manufacturer', 'diagnostic'),
  'raw:1.2': system(undefined, 'Model', 'diagnostic'),
  'raw:1.3': system(undefined, 'Device ID', 'diagnostic'),
  'raw:1.5': system(undefined, 'Serial number', 'diagnostic'),
  firmware: system(undefined, 'Firmware version', 'diagnostic'),
};

const CONSUMABLES: CapabilityOverrides = {
  'raw:12.1': care('vacuum_main_brush_life', 'Main brush life', 'maintenance', {
    ...PERCENT,
    keywords: ['main brush', 'brush', 'roller brush', 'life', 'wear', 'consumable'],
  }),
  'raw:12.2': care('vacuum_main_brush_left', 'Main brush time left', 'maintenance', {
    ...HOURS,
    keywords: ['main brush', 'brush', 'replace', 'remaining'],
  }),
  'raw:13.1': care('vacuum_side_brush_life', 'Side brush life', 'maintenance', {
    ...PERCENT,
    keywords: ['side brush', 'brush', 'life', 'wear', 'consumable'],
  }),
  'raw:13.2': care('vacuum_side_brush_left', 'Side brush time left', 'maintenance', {
    ...HOURS,
    keywords: ['side brush', 'brush', 'replace', 'remaining'],
  }),
  filter_life: care(undefined, 'Filter life', 'maintenance', {
    ...PERCENT,
    keywords: ['filter', 'life', 'wear', 'consumable', ...ROBOT],
  }),
  'raw:14.2': care('vacuum_filter_left', 'Filter time left', 'maintenance', {
    ...HOURS,
    keywords: ['filter', 'replace', 'remaining'],
  }),
};

const CONSUMABLE_RESETS: CapabilityOverrides = {
  'raw:action.12.1': careAction('vacuum_reset_main_brush', 'Reset main brush life', 'extra', {
    ...RESET,
    keywords: ['main brush', 'brush', 'replaced', 'counter', 'consumable'],
  }),
  'raw:action.13.1': careAction('vacuum_reset_side_brush', 'Reset side brush life', 'extra', {
    ...RESET,
    keywords: ['side brush', 'brush', 'replaced', 'counter', 'consumable'],
  }),
  filter_reset: careAction('vacuum_reset_filter', 'Reset filter life', 'extra', {
    ...RESET,
    keywords: ['filter', 'replaced', 'counter', 'consumable'],
  }),
};

const SOUND: CapabilityOverrides = {
  volume: voice(undefined, 'Volume', 'setting', {
    ...VOICE_GROUP,
    unit: '%',
    keywords: [...ROBOT, 'sound', 'loud', 'quiet', 'speaker'],
  }),
  'raw:action.6.1': voiceAction('vacuum_identify', 'Find robot', 'control', {
    ...VOICE_GROUP,
    keywords: [...ROBOT, 'find', 'locate', 'beep', 'where'],
  }),
  buzzer: voice('vacuum_alarm', 'Alarm (meaning unconfirmed)', 'diagnostic'),
  'raw:15.1': voice('vacuum_voice_target', 'Voice language to download', 'extra', {
    ...CONFIRMED,
    keywords: ['voice', 'language', 'pack', 'download'],
  }),
  'raw:15.2': voice('vacuum_voice_current', 'Voice language', 'reading', {
    ...VOICE_GROUP,
    keywords: ['voice', 'language', 'pack'],
  }),
  'raw:15.3': voice('vacuum_voice_download_status', 'Voice download status', 'reading', {
    ...VOICE_GROUP,
    options: VOICE_STATUS_OPTIONS,
  }),
  'raw:15.4': voice('vacuum_voice_download_progress', 'Voice download progress', 'reading', {
    ...VOICE_GROUP,
    unit: '%',
  }),
  'raw:15.5': voice(undefined, 'Voice URL', 'hidden'),
  'raw:15.6': voice(undefined, 'Voice common params', 'hidden'),
  'raw:action.15.1': voiceAction('vacuum_download_voice', 'Download voice', 'extra', {
    ...CONFIRMED,
    keywords: ['voice', 'language', 'pack', 'download'],
  }),
  'raw:action.15.2': voiceAction('vacuum_voice_status', 'Get voice download status', 'hidden'),
};

const QUIET_HOURS: CapabilityOverrides = {
  dnd: quiet(undefined, 'Do not disturb', 'setting', {
    ...SETTINGS_GROUP,
    keywords: [...ROBOT, 'quiet', 'night', 'silent', 'sleep', 'do not disturb'],
  }),
  'raw:11.2': quiet('vacuum_dnd_period', 'Do not disturb period', 'setting', {
    ...SETTINGS_GROUP,
    format: dndPeriodText,
    keywords: ['quiet', 'night', 'hours', 'window', 'do not disturb'],
  }),
  'raw:11.3': quiet('vacuum_dnd_now', 'Inside quiet hours', 'reading', {
    ...SETTINGS_GROUP,
    states: ['Quiet hours active', 'Quiet hours not active'],
    keywords: ['quiet', 'do not disturb', 'now'],
  }),
};

const CHILD_LOCK: CapabilityOverrides = {
  child_lock: system(undefined, 'Child lock', 'setting', {
    ...SETTINGS_GROUP,
    keywords: ['buttons', 'lock', 'physical', 'children', ...ROBOT],
  }),
  'raw:5.2': system('vacuum_control_locked_now', 'Physical controls locked now', 'diagnostic'),
};

const CAMERA_SETTINGS: CapabilityOverrides = {
  'raw:21.1': camera(undefined, 'Unnamed entry 21.1', 'diagnostic'),
  'raw:21.2': camera('vacuum_flash_light', 'Camera light', 'setting', {
    ...CAMERA_GROUP,
    options: FLASH_OPTIONS,
    keywords: ['camera', 'light', 'flash', 'fill', 'night'],
  }),
  'raw:21.3': camera(undefined, 'Unnamed entry 21.3', 'diagnostic'),
  'raw:21.4': camera('vacuum_video_warnings', 'Camera use alert', 'setting', {
    ...CAMERA_GROUP,
    options: VIDEO_WARNING_OPTIONS,
    keywords: ['camera', 'video', 'recording', 'warning', 'privacy'],
  }),
  'raw:21.5': camera('vacuum_video_shared', 'Camera visible to shared users', 'setting', {
    ...CAMERA_GROUP,
    keywords: [...CAMERA_WORDS, 'share', 'family'],
  }),
  'raw:21.6': camera('vacuum_video_on', 'Camera video switch', 'setting', {
    ...CAMERA_GROUP,
    ...CONFIRMED,
    keywords: [...CAMERA_WORDS, 'switch', 'enable'],
  }),
  'raw:21.7': camera(undefined, 'Video common params', 'hidden'),
  'raw:21.8': camera('vacuum_video_lock', 'Camera physical control lock', 'diagnostic'),
  'raw:17.1': camera(undefined, 'Unnamed entry 17.1', 'diagnostic'),
  'raw:17.2': camera(undefined, 'Unnamed entry 17.2', 'diagnostic'),
};

const CAMERA_ACTIONS: CapabilityOverrides = {
  'raw:action.21.4': cameraAction('vacuum_video_page', 'Enter or leave video page', 'hidden'),
  'raw:action.21.5': cameraAction('vacuum_video_status', 'Get video status', 'hidden'),
  'raw:action.21.6': cameraAction('vacuum_set_video_password', 'Set video password', 'extra', {
    ...CONFIRMED,
    keywords: [...CAMERA_WORDS, 'password', 'pin'],
  }),
  'raw:action.21.7': cameraAction(
    'vacuum_verify_video_password',
    'Verify video password',
    'hidden',
    {
      ...CONFIRMED,
    },
  ),
  'raw:action.21.8': cameraAction(
    'vacuum_forgot_video_password',
    'Forgot video password',
    'extra',
    {
      ...CONFIRMED,
      keywords: [...CAMERA_WORDS, 'password', 'pin', 'forgot'],
    },
  ),
};

const SERVICE_20_PROPERTIES: CapabilityOverrides = {
  'raw:20.1': system(undefined, 'Common params', 'hidden'),
  'raw:20.2': system(undefined, 'Query id', 'hidden'),
  'raw:20.3': system(undefined, 'Update difference', 'hidden'),
  'raw:20.4': system(undefined, 'Self-check items', 'hidden'),
  'raw:20.5': system(undefined, 'Self-check result', 'diagnostic'),
  'raw:20.6': system('vacuum_spec_test', 'Spec test', 'diagnostic'),
  'raw:20.7': dock(
    'vacuum_sewage_cleaning',
    'Sewage tank self-cleaning (unconfirmed)',
    'diagnostic',
  ),
  'raw:20.8': dock(
    'vacuum_self_cleaning_time',
    'Self-cleaning time (raw, unit unconfirmed)',
    'diagnostic',
  ),
  'raw:20.9': clean('vacuum_low_region', 'Low-area strategy', 'setting', {
    options: LOW_REGION_OPTIONS,
    keywords: [...ROBOT, 'low', 'furniture', 'under', 'bed', 'lidar'],
  }),
  'raw:20.10': system('vacuum_precise_diagnosis', 'Precise diagnosis', 'diagnostic'),
  'raw:20.11': system('vacuum_lidar_status', 'Lidar position', 'reading', {
    options: LIDAR_OPTIONS,
    keywords: ['lidar', 'sensor', 'tower'],
  }),
  'raw:20.12': system('vacuum_lidar_button', 'Lidar button', 'hidden'),
  'raw:20.13': dock('vacuum_water_level_remind', 'Low water reminder', 'setting', {
    keywords: ['water', 'tank', 'low', 'reminder', 'refill'],
  }),
  'raw:20.14': system(undefined, 'Bit status', 'diagnostic'),
  'raw:20.15': system(undefined, 'Check list', 'diagnostic'),
  'raw:22.1': system('vacuum_self_check_items', 'Self-check items (input)', 'hidden'),
  'raw:22.2': system('vacuum_self_check_results', 'Self-check results', 'diagnostic'),
  'raw:23.1': map('vacuum_standard_rooms', 'Standard map rooms', 'hidden'),
  'raw:23.2': map('vacuum_standard_objects', 'Standard map objects', 'hidden'),
  'raw:23.3': map('vacuum_standard_carpets', 'Standard map carpets', 'hidden'),
};

const SERVICE_20_ACTIONS: CapabilityOverrides = {
  'raw:action.20.1': systemAction('vacuum_history_object', 'Get clean record object', 'hidden'),
  'raw:action.20.2': systemAction('vacuum_user_define', 'Get custom sweep object', 'hidden'),
  'raw:action.20.3': mapAction('vacuum_stop_map_upload', 'Stop map upload to cloud', 'extra', {
    ...CONFIRMED,
    keywords: ['map', 'cloud', 'upload', 'privacy'],
  }),
  'raw:action.20.4': systemAction('vacuum_xiaoai_id', 'Get voice assistant bind id', 'hidden'),
  'raw:action.20.5': cleanAction('vacuum_get_schedule', 'Get scheduled cleans', 'hidden', {
    keywords: SCHEDULE_WORDS,
  }),
  'raw:action.20.6': cleanAction(
    'vacuum_switch_schedule',
    'Turn scheduled clean on or off',
    'extra',
    {
      keywords: SCHEDULE_WORDS,
    },
  ),
  'raw:action.20.7': systemAction('vacuum_control_lidar', 'Raise or lower lidar', 'hidden', RESET),
  'raw:action.20.8': cleanAction('vacuum_start_patrol', 'Start patrol', 'hidden', {
    ...CONFIRMED,
    keywords: ['patrol', 'camera', 'home'],
  }),
  'raw:action.20.9': dockAction('vacuum_dust_set', 'Sweeping dust arrest', 'hidden'),
  'raw:action.20.10': systemAction('vacuum_language', 'Get Mijia language', 'hidden'),
  'raw:action.20.11': systemAction(
    'vacuum_enter_check',
    'Enter factory check mode',
    'hidden',
    RESET,
  ),
  'raw:action.20.12': systemAction('vacuum_check_ack', 'Acknowledge check result', 'hidden', RESET),
  'raw:action.20.13': systemAction(
    'vacuum_check_current',
    'Get current check result',
    'hidden',
    RESET,
  ),
  'raw:action.20.14': systemAction('vacuum_exit_check', 'Exit factory check mode', 'hidden', RESET),
  'raw:action.20.15': systemAction('vacuum_start_check', 'Start check task', 'hidden', RESET),
};

export const XIAOMI_VACUUM_SYSTEM: CapabilityOverrides = {
  ...DEVICE_INFORMATION,
  ...CONSUMABLES,
  ...CONSUMABLE_RESETS,
  ...SOUND,
  ...QUIET_HOURS,
  ...CHILD_LOCK,
  ...CAMERA_SETTINGS,
  ...CAMERA_ACTIONS,
  ...SERVICE_20_PROPERTIES,
  ...SERVICE_20_ACTIONS,
};

export const XIAOMI_VACUUM_EVENTS: Readonly<Record<string, VacuumEventPresentation>> = {
  'raw:event.2.1': { label: 'Map built', keywords: ['map', 'mapping', 'complete'] },
  'raw:event.2.2': { label: 'Cleanup finished', keywords: ['clean', 'sweep', 'complete', 'done'] },
  'raw:event.2.3': { label: 'Dust bin emptied', keywords: ['dust', 'empty', 'station'] },
  'raw:event.2.4': { label: 'Mop washed', keywords: ['mop', 'wash', 'station'] },
  'raw:event.2.5': { label: 'Mop dried', keywords: ['mop', 'dry', 'station'] },
};
