import type { CapabilityOverride, CapabilityOverrides, Danger } from '../types';
import { VACUUM_GROUPS, vacuumActionIn, vacuumIn } from './xiaomi-vacuum';

type Extra = Partial<Omit<CapabilityOverride, 'label' | 'tier' | 'role' | 'groupLabel'>>;

export interface VacuumCoupling {
  readonly rewrites: readonly string[];
  readonly note: string;
}

export const VACUUM_COUPLINGS: Readonly<Record<string, VacuumCoupling>> = {
  'raw:2.83': {
    rewrites: ['suction', 'raw:2.8', 'raw:2.30', 'raw:2.32'],
    note: 'Worry-free mode is a preset: choosing it rewrites suction, cleaning times, mop wash water, dust collection and other settings at once.',
  },
  'raw:2.45': {
    rewrites: ['raw:2.93'],
    note: 'Turning off AI detection also turns off real-scene capture.',
  },
};

const CONFIRM: Danger = { tier: 'confirm' };
const TYPED_RESET: Danger = { tier: 'typed', word: 'RESET' };

const ROBOT = ['robot', 'vacuum', 'hoover'] as const;
const DOCK_WORDS = ['dock', 'station', 'base'] as const;
const CONFIRMED: Extra = { danger: CONFIRM };
const RESET: Extra = { danger: TYPED_RESET };
const CARE: Extra = { group: 'care' };
const HOURS: Extra = { ...CARE, unit: 'h' };
const PERCENT: Extra = { ...CARE, unit: '%' };
const UNCONFIRMED_HOURS = 'raw, unit unconfirmed';

const dock = vacuumIn(VACUUM_GROUPS.dock);
const dockAction = vacuumActionIn(VACUUM_GROUPS.dock);
const care = vacuumIn(VACUUM_GROUPS.care);
const careAction = vacuumActionIn(VACUUM_GROUPS.care);
const clean = vacuumIn(VACUUM_GROUPS.cleaning);
const camera = vacuumIn(VACUUM_GROUPS.camera);
const system = vacuumIn(VACUUM_GROUPS.system);

const STATION_TANK_OPTIONS: Readonly<Record<string, string>> = {
  Idle: 'Idle',
  Empting: 'Emptying',
  'Empting Completed': 'Emptying done',
  'Empting Failed': 'Emptying failed',
};

const HOST_TANK_OPTIONS: Readonly<Record<string, string>> = {
  ...STATION_TANK_OPTIONS,
  'Not Installed': 'Not installed',
};

const WASH_BASIS_OPTIONS: Readonly<Record<string, string>> = {
  'By Room': 'By room',
  'By Area': 'By area',
  'By TIme': 'By time',
};

const WASH_WATER_OPTIONS: Readonly<Record<string, string>> = {
  Deep: 'Deep mop washing',
  Daily: 'Daily mop washing',
  'Save Water': 'Save water',
};

const TEMPERATURE_OPTIONS: Readonly<Record<string, string>> = {
  'Ordinary Temperature': 'Room temperature',
  Warm: 'Warm',
  Hot: 'Hot',
  Smart: 'Smart',
};

const MOP_TEMPERATURE_OPTIONS: Readonly<Record<string, string>> = {
  Normal: 'Room temperature',
  Warm: 'Warm',
  Hot: 'Hot',
  Smart: 'Smart',
};

const WASH_AREA_OPTIONS: Readonly<Record<string, string>> = {
  'Five Square  Meters': 'Every 5 m2',
  'Ten Square  Meters': 'Every 10 m2',
  'Eight Square  Meters': 'Every 8 m2',
  'Fifteen Square  Meters': 'Every 15 m2',
  'Twenty Square  Meters': 'Every 20 m2',
  'Twenty-five Square  Meters': 'Every 25 m2',
};

const EDGE_OPTIONS: Readonly<Record<string, string>> = {
  '7 Sweeps': 'Once every 7 cleans',
  'Every Time': 'Every clean',
};

const WORRY_FREE_OPTIONS: Readonly<Record<string, string>> = {
  'Silent Clean': 'Low-noise cleanup',
  'Deep Clean': 'Deep cleanup',
  General: 'General',
  Butler: 'Housekeeper mode',
};

const STATION_PROPERTIES: CapabilityOverrides = {
  'raw:2.18': dock('vacuum_station_mode', 'Base station status', 'hidden', {
    keywords: [...DOCK_WORDS, 'drying', 'dust', 'wash'],
  }),
  'raw:2.88': dock('vacuum_station_progress', 'Drying progress', 'reading', {
    unit: '%',
    keywords: ['dry', 'mop', 'progress'],
  }),
  'raw:2.90': dock('vacuum_dry_left', 'Drying time left', 'reading', {
    clock: 'minutes',
    keywords: ['dry', 'mop', 'remaining'],
  }),
  'raw:2.97': dock('vacuum_sewage_tank', 'Sewage tank', 'reading', {
    options: { 'Not Full': 'Not full', Full: 'Full' },
    keywords: ['dirty water', 'tank', ...DOCK_WORDS],
  }),
  'raw:2.98': dock('vacuum_water_tank', 'Clean water tank', 'reading', {
    options: { 'Not Empty': 'Has water', Empty: 'Empty' },
    keywords: ['water', 'tank', 'refill', ...DOCK_WORDS],
  }),
  'raw:2.100': dock('vacuum_station_water_tank', 'Station tank emptying', 'reading', {
    options: STATION_TANK_OPTIONS,
    keywords: ['empty', 'drain', 'tank', ...DOCK_WORDS],
  }),
  'raw:2.101': dock('vacuum_host_water_tank', 'Robot tank emptying', 'reading', {
    options: HOST_TANK_OPTIONS,
    keywords: ['empty', 'drain', 'tank', ...ROBOT],
  }),
  'raw:2.53': dock('vacuum_water_check_list', 'Water check results', 'diagnostic'),
  'raw:2.54': dock('vacuum_water_check_status', 'Water check status', 'diagnostic', {
    options: {
      Uncheck: 'Not checked',
      Checking: 'Checking',
      'Check Success': 'Check success',
      'Check Fail': 'Check fail',
    },
  }),
  'raw:2.62': dock('vacuum_water_change_installed', 'Auto water change kit', 'diagnostic', {
    states: ['Installed', 'Not installed'],
  }),
  'raw:2.64': dock('vacuum_cut_hair_frequency', 'Hair cutting frequency', 'diagnostic'),
};

const WASH_SETTINGS: CapabilityOverrides = {
  'raw:2.28': dock('vacuum_mop_wash', 'Enable mop wash', 'setting', {
    keywords: ['mop', 'wash', 'auto', ...DOCK_WORDS],
  }),
  'raw:2.29': dock('vacuum_mop_wash_frequency', 'Mop wash frequency', 'setting', {
    options: WASH_BASIS_OPTIONS,
    keywords: ['mop', 'wash', 'return', 'how often'],
  }),
  'raw:2.81': dock('vacuum_mop_wash_by_time', 'Mop wash interval', 'setting', {
    unit: 'min',
    keywords: ['mop', 'wash', 'minutes'],
  }),
  'raw:2.61': dock('vacuum_mop_wash_frequency_no_tank', 'Mop wash area interval', 'diagnostic', {
    options: WASH_AREA_OPTIONS,
  }),
  'raw:2.30': dock('vacuum_mop_wash_water', 'Mop washing water output', 'setting', {
    options: WASH_WATER_OPTIONS,
    keywords: ['mop', 'wash', 'water', 'deep', 'daily'],
  }),
  'raw:2.60': dock('vacuum_mop_water_no_tank', 'Mop washing water, plumbed', 'diagnostic', {
    options: { Daily: 'Daily', Deep: 'Deep' },
  }),
  'raw:2.84': dock('vacuum_wash_temperature', 'Mop wash water temperature', 'setting', {
    options: TEMPERATURE_OPTIONS,
    keywords: ['mop', 'wash', 'hot water', 'warm'],
  }),
  'raw:2.41': dock('vacuum_hot_wash', 'Hot water mop wash', 'setting', {
    keywords: ['mop', 'hot water', 'heat'],
  }),
  'raw:2.92': dock('vacuum_repeat_wash', 'Repeat mop wash', 'setting', {
    keywords: ['mop', 'wash', 'twice', 'again'],
  }),
  'raw:2.107': dock('vacuum_mop_temperature', 'Mop temperature', 'diagnostic', {
    options: MOP_TEMPERATURE_OPTIONS,
  }),
};

const DRY_AND_DUST_SETTINGS: CapabilityOverrides = {
  'raw:2.31': dock('vacuum_dry_time', 'Drying duration', 'setting', {
    options: { '2 Hours': '2 h', '3 Hours': '3 h', '4 Hours': '4 h' },
    keywords: ['dry', 'mop', 'hours', 'air dry'],
  }),
  'raw:2.34': dock('vacuum_auto_mop_dry', 'Auto mop dry', 'setting', {
    keywords: ['dry', 'mop', 'auto', ...DOCK_WORDS],
  }),
  'raw:2.32': dock('vacuum_auto_dust', 'Auto dust collection', 'setting', {
    keywords: ['dust', 'empty', 'bin', 'auto', ...DOCK_WORDS],
  }),
  'raw:2.33': dock('vacuum_dust_frequency', 'Dust collection frequency', 'setting', {
    options: { Once: 'Once', Twice: 'Twice', Triple: 'Three times' },
    keywords: ['dust', 'empty', 'every', 'cleanings'],
  }),
  'raw:2.82': dock(undefined, 'Dust collection power', 'diagnostic', {
    options: { Silent: 'Silent', Normal: 'Normal', Strong: 'Strong' },
  }),
  'raw:2.35': dock('vacuum_auto_water_change', 'Auto water change', 'diagnostic'),
  'raw:2.36': dock('vacuum_detergent_use', 'Use detergent', 'setting', {
    keywords: ['detergent', 'soap', 'mop', 'wash'],
  }),
  'raw:2.71': dock('vacuum_detergent_reminder', 'Detergent depletion reminder', 'setting', {
    keywords: ['detergent', 'reminder', 'low', 'refill'],
  }),
  'raw:2.59': dock(undefined, 'Detergent self delivery (same entry as 18.2)', 'diagnostic'),
  'raw:2.91': clean('vacuum_brush_swing', 'Side brush outer swing', 'setting', {
    keywords: ['brush', 'swing', 'corner'],
  }),
};

const CLEANING_SETTINGS: CapabilityOverrides = {
  'raw:2.83': clean('vacuum_worry_free', 'Worry-free cleaning mode', 'setting', {
    options: WORRY_FREE_OPTIONS,
    danger: CONFIRM,
    keywords: [...ROBOT, 'worry free', 'housekeeper', 'quiet', 'deep', 'preset', 'mode'],
  }),
  'raw:2.20': clean('vacuum_carpet_boost', 'Carpet boost', 'setting', {
    keywords: ['carpet', 'rug', 'suction', 'boost'],
  }),
  'raw:2.21': clean('vacuum_carpet_avoidance', 'Carpet avoidance', 'setting', {
    keywords: ['carpet', 'rug', 'avoid', 'mop'],
  }),
  'raw:2.22': clean('vacuum_carpet_display', 'Carpet display', 'setting'),
  'raw:2.73': clean('vacuum_carpet_method', 'Carpet cleaning method', 'setting', {
    options: {
      'Self Adaption': 'Self-adapting',
      Avoid: 'Avoid',
      Ignore: 'Ignore',
      Span: 'Cross',
    },
    keywords: ['carpet', 'rug', 'avoid', 'cross'],
  }),
  'raw:2.76': clean('vacuum_carpet_deep', 'Carpet deep cleaning', 'setting', {
    keywords: ['carpet', 'rug', 'deep'],
  }),
  'raw:2.77': clean('vacuum_carpet_discriminate', 'Carpet recognition', 'setting'),
  'raw:2.78': clean('vacuum_carpet_first', 'Carpet first', 'setting'),
  'raw:2.23': clean('vacuum_break_resume', 'Cleanup resumption', 'setting', {
    keywords: ['resume', 'recharge', 'low battery', 'continue'],
  }),
  'raw:2.44': clean('vacuum_mop_lift', 'Mop auto lift', 'setting', {
    keywords: ['mop', 'lift', 'carpet'],
  }),
  'raw:2.79': clean('vacuum_mop_swing', 'Mop outer swing', 'setting', {
    keywords: ['mop', 'swing', 'edge'],
  }),
  'raw:2.80': clean('vacuum_mop_swing_frequency', 'Mop outer swing frequency', 'setting', {
    options: EDGE_OPTIONS,
    keywords: ['mop', 'swing', 'edge'],
  }),
  'raw:2.68': clean('vacuum_edge_frequency', 'Edge sweep frequency', 'diagnostic', {
    options: EDGE_OPTIONS,
  }),
  'raw:2.74': clean('vacuum_sweep_route', 'Cleaning path', 'setting', {
    options: { Quick: 'Quick', Daily: 'Standard', Careful: 'Deep' },
    keywords: ['route', 'path', 'quick', 'careful', 'deep'],
  }),
  'raw:2.75': clean('vacuum_obstacle_strategy', 'Obstacle avoidance strategy', 'setting', {
    options: { 'Less Collisions': 'Fewer collisions', 'High Coverage': 'High coverage' },
    keywords: ['obstacle', 'bump', 'coverage'],
  }),
};

const AI_SETTINGS: CapabilityOverrides = {
  'raw:2.45': camera('vacuum_ai_detection', 'AI detection', 'setting', {
    keywords: ['ai', 'recognition', 'obstacle', 'camera', 'object'],
  }),
  'raw:2.46': camera('vacuum_dirt_detection', 'Dirt detection', 'setting'),
  'raw:2.47': camera('vacuum_object_detection', 'Object detection', 'setting'),
  'raw:2.48': camera('vacuum_room_detection', 'Room detection', 'setting'),
  'raw:2.93': camera('vacuum_scene_capture', 'Real scene capture', 'setting', {
    keywords: ['ai', 'photo', 'picture', 'camera', 'object'],
  }),
  'raw:2.94': camera('vacuum_night_light', 'Auto night fill light', 'diagnostic'),
  'raw:2.95': camera('vacuum_ai_wake', 'AI wake-up', 'diagnostic'),
  'raw:2.70': system('vacuum_plugin_reminder', 'Plugin info reminder', 'hidden'),
};

const STATION_ACTIONS: CapabilityOverrides = {
  'raw:action.2.18': dockAction('vacuum_empty_dust', 'Empty dust bin', 'control', {
    keywords: ['dust', 'collect', 'empty', 'bin', ...DOCK_WORDS],
  }),
  'raw:action.24.2': dockAction('vacuum_start_roller_wash', 'Clean mop', 'control', {
    keywords: ['roller', 'mop', 'wash', 'clean mop', ...DOCK_WORDS],
  }),
  'raw:action.24.3': dockAction('vacuum_stop_roller_wash', 'Stop cleaning mop', 'control', {
    keywords: ['roller', 'mop', 'wash', 'stop', ...DOCK_WORDS],
  }),
  'raw:action.2.20': dockAction('vacuum_dry_mop', 'Start drying', 'control', {
    keywords: ['dry', 'mop', 'air dry', ...DOCK_WORDS],
  }),
  'raw:action.2.32': dockAction('vacuum_stop_dry', 'Stop drying', 'control', {
    keywords: ['dry', 'mop', 'stop', ...DOCK_WORDS],
  }),
  'raw:action.2.57': dockAction('vacuum_empty_station_tank', 'Empty station water tank', 'extra', {
    ...CONFIRMED,
    keywords: ['drain', 'dirty water', 'tank', ...DOCK_WORDS],
  }),
  'raw:action.2.58': dockAction('vacuum_empty_host_tank', 'Empty robot water tank', 'extra', {
    ...CONFIRMED,
    keywords: ['drain', 'water', 'tank', ...ROBOT],
  }),
  'raw:action.2.19': dockAction('vacuum_wash_mop', 'Start mop wash', 'hidden'),
  'raw:action.2.31': dockAction('vacuum_stop_wash', 'Stop mop wash', 'hidden'),
  'raw:action.2.36': dockAction('vacuum_back_wash', 'Back to mop wash', 'hidden'),
  'raw:action.2.21': dockAction('vacuum_eject', 'Start eject', 'hidden'),
  'raw:action.2.45': dockAction('vacuum_start_water_check', 'Start water self check', 'hidden'),
  'raw:action.2.46': dockAction('vacuum_cancel_water_check', 'Cancel water self check', 'hidden'),
  'raw:action.2.49': dockAction('vacuum_clean_station', 'Start base station cleaning', 'hidden'),
};

const CONSUMABLE_PROPERTIES: CapabilityOverrides = {
  'raw:9.1': care('vacuum_mop_life', 'Corner mop life', 'maintenance', {
    ...PERCENT,
    keywords: ['mop', 'pad', 'life', 'wear', 'consumable'],
  }),
  'raw:9.2': care('vacuum_mop_left', 'Corner mop time left', 'maintenance', {
    ...HOURS,
    keywords: ['mop', 'pad', 'replace', 'remaining'],
  }),
  'raw:24.1': care('vacuum_roller_life', 'Roller mop life', 'maintenance', {
    ...PERCENT,
    keywords: ['roller', 'mop', 'life', 'wear', 'consumable'],
  }),
  'raw:24.2': care('vacuum_roller_left', 'Roller mop time left', 'maintenance', {
    ...HOURS,
    keywords: ['roller', 'mop', 'replace', 'remaining'],
  }),
  'raw:18.1': care('vacuum_detergent_level', 'Detergent left', 'maintenance', {
    ...PERCENT,
    keywords: ['detergent', 'soap', 'refill', 'level'],
  }),
  'raw:18.4': care('vacuum_detergent_left', 'Detergent time left', 'maintenance', {
    ...HOURS,
    keywords: ['detergent', 'soap', 'remaining'],
  }),
  'raw:19.1': care('vacuum_dust_bag_life', 'Dust bag life', 'maintenance', {
    ...PERCENT,
    keywords: ['dust bag', 'bag', 'life', 'consumable', ...DOCK_WORDS],
  }),
  'raw:19.2': care(
    'vacuum_dust_bag_left',
    `Dust bag time left (${UNCONFIRMED_HOURS})`,
    'diagnostic',
    {
      ...CARE,
      keywords: ['dust bag', 'bag', 'replace', 'remaining'],
    },
  ),
};

const CARE_SETTINGS: CapabilityOverrides = {
  'raw:18.2': care('vacuum_detergent_delivery', 'Detergent self delivery', 'setting', {
    keywords: ['detergent', 'soap', 'dispense', 'auto'],
  }),
  'raw:18.3': care('vacuum_detergent_amount', 'Detergent delivery amount', 'setting', {
    options: { Few: 'Few', Standard: 'Standard', Many: 'Many', 'Lots Of': 'Lots' },
    keywords: ['detergent', 'soap', 'amount', 'dose'],
  }),
  'raw:24.3': care('vacuum_roller_swing', 'Roller mop outer swing', 'setting', {
    keywords: ['roller', 'mop', 'swing', 'edge'],
  }),
  'raw:24.4': care('vacuum_roller_auto_wash', 'Auto wash roller', 'setting', {
    keywords: ['roller', 'mop', 'wash', 'auto'],
  }),
};

const RESET_ACTIONS: CapabilityOverrides = {
  'raw:action.9.1': careAction('vacuum_reset_mop', 'Reset corner mop life', 'extra', {
    ...RESET,
    keywords: ['mop', 'pad', 'replaced', 'counter', 'consumable'],
  }),
  'raw:action.24.1': careAction('vacuum_reset_roller', 'Reset roller mop life', 'extra', {
    ...RESET,
    keywords: ['roller', 'mop', 'replaced', 'counter', 'consumable'],
  }),
  'raw:action.18.1': careAction('vacuum_reset_detergent', 'Reset detergent level', 'extra', {
    ...RESET,
    keywords: ['detergent', 'refilled', 'counter', 'consumable'],
  }),
  'raw:action.19.1': careAction('vacuum_reset_dust_bag', 'Reset dust bag life', 'extra', {
    ...RESET,
    keywords: ['dust bag', 'replaced', 'counter', 'consumable'],
  }),
};

export const XIAOMI_VACUUM_DOCK: CapabilityOverrides = {
  ...STATION_PROPERTIES,
  ...WASH_SETTINGS,
  ...DRY_AND_DUST_SETTINGS,
  ...CLEANING_SETTINGS,
  ...AI_SETTINGS,
  ...STATION_ACTIONS,
  ...CONSUMABLE_PROPERTIES,
  ...CARE_SETTINGS,
  ...RESET_ACTIONS,
};
