import type { IconName } from '../../../components/icon';

export interface SettingRow {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly group: 'setting' | 'action';
  readonly keywords: readonly string[];
}

export const BRUSH_WORDS = ['toothbrush', 'teeth', 'brushing', 'brush head'] as const;

export const SHARED_ROWS: readonly SettingRow[] = [
  {
    id: 'link',
    title: 'Toothbrush link',
    icon: 'bluetooth',
    group: 'setting',
    keywords: ['bluetooth', 'connection', 'holder', 'asleep'],
  },
  {
    id: 'policy',
    title: 'Connection level',
    icon: 'signal',
    group: 'setting',
    keywords: ['on demand', 'armed', 'background', 'battery cost', 'live'],
  },
  {
    id: 'take-over',
    title: 'Use this phone for the toothbrush link',
    icon: 'refresh',
    group: 'action',
    keywords: ['take over', 'hold', 'holder phone'],
  },
  {
    id: 'goal-sessions',
    title: 'Brushes per day',
    icon: 'trophy',
    group: 'setting',
    keywords: ['goal', 'twice a day', 'sessions', 'streak'],
  },
  {
    id: 'goal-minimum',
    title: 'Minimum brushing time',
    icon: 'timer',
    group: 'setting',
    keywords: ['goal', 'seconds', 'two minutes', 'whole routine'],
  },
  {
    id: 'goal-morning',
    title: 'Morning starts',
    icon: 'sun',
    group: 'setting',
    keywords: ['window', 'morning', 'goal', 'hours'],
  },
  {
    id: 'goal-morning-end',
    title: 'Morning ends',
    icon: 'sun',
    group: 'setting',
    keywords: ['window', 'morning', 'goal', 'hours'],
  },
  {
    id: 'goal-evening',
    title: 'Evening starts',
    icon: 'moon',
    group: 'setting',
    keywords: ['window', 'evening', 'night', 'goal', 'hours'],
  },
  {
    id: 'goal-evening-end',
    title: 'Evening ends',
    icon: 'moon',
    group: 'setting',
    keywords: ['window', 'evening', 'night', 'goal', 'hours'],
  },
  {
    id: 'alert-head-warn',
    title: 'Warn when the brush head is worn',
    icon: 'bell',
    group: 'setting',
    keywords: ['replace', 'percent', 'wear', 'reminder'],
  },
  {
    id: 'alert-head-due',
    title: 'Brush head is due',
    icon: 'bell',
    group: 'setting',
    keywords: ['replace', 'percent', 'wear'],
  },
  {
    id: 'alert-battery',
    title: 'Low battery level',
    icon: 'battery',
    group: 'setting',
    keywords: ['charge', 'percent', 'warn'],
  },
  {
    id: 'alert-counterfeit',
    title: 'Warn about a head that is not recognised',
    icon: 'warning',
    group: 'setting',
    keywords: ['counterfeit', 'fake', 'genuine'],
  },
  {
    id: 'person',
    title: 'Who uses this toothbrush',
    icon: 'user',
    group: 'setting',
    keywords: ['person', 'owner', 'sessions belong'],
  },
  {
    id: 'diagnostics',
    title: 'Toothbrush diagnostics',
    icon: 'wrench',
    group: 'setting',
    keywords: ['serial', 'firmware', 'error bits', 'calibration', 'frames', 'log'],
  },
];
