import type { IconName } from '../../../components/icon';

export interface SettingRow {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly group: 'setting' | 'action';
  readonly keywords: readonly string[];
}

export const TREADMILL_WORDS = [
  'treadmill',
  'walking pad',
  'walkingpad',
  'KS Fit',
  'belt',
] as const;

export const SETTING_ROWS: readonly SettingRow[] = [
  {
    id: 'link',
    title: 'Treadmill link',
    icon: 'bluetooth',
    group: 'setting',
    keywords: ['bluetooth', 'connection', 'holder'],
  },
  {
    id: 'take-over',
    title: 'Use this phone for the treadmill link',
    icon: 'refresh',
    group: 'action',
    keywords: ['take over', 'hold', 'holder phone'],
  },
  {
    id: 'stay-connected',
    title: 'Treadmill stay connected',
    icon: 'plug',
    group: 'setting',
    keywords: ['keep connected', 'background', 'always on', 'power', 'standby'],
  },
  {
    id: 'presence',
    title: 'Treadmill notice when near',
    icon: 'motion',
    group: 'setting',
    keywords: ['near', 'presence', 'auto connect'],
  },
  {
    id: 'remote-start',
    title: 'Allow remote start',
    icon: 'lock',
    group: 'setting',
    keywords: ['remote', 'start', 'safety', 'assistant', 'automation', 'power', 'standby'],
  },
  {
    id: 'remote-who',
    title: 'Who can start the treadmill remotely',
    icon: 'users',
    group: 'setting',
    keywords: ['remote', 'owner', 'walker', 'permission'],
  },
  {
    id: 'remote-max',
    title: 'Treadmill remote speed limit',
    icon: 'gauge',
    group: 'setting',
    keywords: ['remote', 'speed', 'cap', 'maximum'],
  },
  {
    id: 'no-steps',
    title: 'Stop when nobody steps on',
    icon: 'footprints',
    group: 'setting',
    keywords: ['no steps', 'safety', 'auto stop', 'remote start'],
  },
  {
    id: 'grade',
    title: 'Treadmill belt grade',
    icon: 'trendUp',
    group: 'setting',
    keywords: ['incline', 'slope', 'gradient', 'calories', 'percent'],
  },
  {
    id: 'run-switch',
    title: 'Treadmill running speed',
    icon: 'gauge',
    group: 'setting',
    keywords: ['run', 'jog', 'switch', 'calories'],
  },
  {
    id: 'goals',
    title: 'Treadmill goals',
    icon: 'trophy',
    group: 'setting',
    keywords: ['daily minutes', 'weekly distance', 'sessions', 'steps goal', 'energy goal'],
  },
  {
    id: 'max-speed',
    title: 'Treadmill maximum speed',
    icon: 'gauge',
    group: 'setting',
    keywords: ['speed limit', 'cap', 'top speed'],
  },
  {
    id: 'start-speed',
    title: 'Treadmill start speed',
    icon: 'play',
    group: 'setting',
    keywords: ['initial speed', 'begin'],
  },
  {
    id: 'auto-start',
    title: 'Treadmill auto start',
    icon: 'play',
    group: 'setting',
    keywords: ['step on', 'intelligent start'],
  },
  {
    id: 'sensitivity',
    title: 'Treadmill step-on sensitivity',
    icon: 'settings',
    group: 'setting',
    keywords: ['auto', 'sensor', 'high', 'low'],
  },
  {
    id: 'child-lock',
    title: 'Treadmill child lock',
    icon: 'lock',
    group: 'setting',
    keywords: ['lock', 'children', 'panel'],
  },
  {
    id: 'pad-goal',
    title: 'Treadmill session goal',
    icon: 'trophy',
    group: 'setting',
    keywords: ['target', 'distance', 'calories', 'time', 'beep'],
  },
  {
    id: 'button-sounds',
    title: 'Treadmill button sounds',
    icon: 'volume',
    group: 'setting',
    keywords: ['beep', 'buzzer', 'sound'],
  },
  {
    id: 'lubrication',
    title: 'Treadmill belt oiling',
    icon: 'wrench',
    group: 'setting',
    keywords: ['lubrication', 'silicone oil', 'maintenance', 'reminder'],
  },
  {
    id: 'mark-oiled',
    title: 'Mark the treadmill belt as oiled',
    icon: 'circleCheck',
    group: 'action',
    keywords: ['lubricated', 'maintenance done'],
  },
  {
    id: 'diagnostics',
    title: 'Treadmill diagnostics',
    icon: 'activity',
    group: 'setting',
    keywords: [
      'firmware',
      'gatt',
      'frames',
      'raw log',
      'motor',
      'version',
      'incline range',
      '2AD5',
      'capability word',
    ],
  },
  {
    id: 'incline-scale',
    title: 'Treadmill incline scale',
    icon: 'trendUp',
    group: 'setting',
    keywords: ['incline', 'slope', 'gradient', 'hill', 'level', 'percent', 'calibration', 'climb'],
  },
  {
    id: 'remote-incline',
    title: 'Allow remote incline',
    icon: 'lock',
    group: 'setting',
    keywords: ['incline', 'slope', 'remote', 'safety', 'assistant', 'automation', 'hill'],
  },
  {
    id: 'remote-incline-cap',
    title: 'Treadmill remote incline limit',
    icon: 'trendUp',
    group: 'setting',
    keywords: ['incline', 'slope', 'remote', 'cap', 'maximum', 'climb'],
  },
  {
    id: 'light-strip',
    title: 'Treadmill light strip',
    icon: 'bulb',
    group: 'setting',
    keywords: ['light strip', 'light', 'led', 'strip', 'lamp'],
  },
  {
    id: 'max-heart-rate',
    title: 'Treadmill maximum heart rate',
    icon: 'heartPulse',
    group: 'setting',
    keywords: ['heart rate', 'zones', 'bpm', 'grips'],
  },
];
