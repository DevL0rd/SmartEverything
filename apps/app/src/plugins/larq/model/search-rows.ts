import type { IconName } from '../../../components/icon';

export interface SettingRow {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly group: 'setting' | 'action';
  readonly keywords: readonly string[];
}

export const BOTTLE_WORDS = ['water bottle', 'bottle', 'LARQ', 'PureVis', 'hydration'] as const;

export const SETTING_ROWS: readonly SettingRow[] = [
  {
    id: 'person',
    title: 'Whose drinks',
    icon: 'user',
    group: 'setting',
    keywords: ['person', 'bind', 'water log', 'owner'],
  },
  {
    id: 'body',
    title: 'Bottle size',
    icon: 'ruler',
    group: 'setting',
    keywords: ['680', 'litre', '1 L', 'body', 'outline'],
  },
  {
    id: 'goal',
    title: 'Daily water goal',
    icon: 'trophy',
    group: 'setting',
    keywords: ['goal', 'target', 'hydration goal'],
  },
  {
    id: 'filter',
    title: 'Filter pod',
    icon: 'filter',
    group: 'setting',
    keywords: ['filter', 'replace', 'litres', 'pod'],
  },
  {
    id: 'reminders',
    title: 'Drink reminders',
    icon: 'bell',
    group: 'setting',
    keywords: ['reminder', 'nudge', 'light flash', 'ring'],
  },
  {
    id: 'reminder-interval',
    title: 'Remind every',
    icon: 'timer',
    group: 'setting',
    keywords: ['interval', 'minutes', 'how often'],
  },
  {
    id: 'reminder-colour',
    title: 'Reminder colour',
    icon: 'palette',
    group: 'setting',
    keywords: ['colour', 'color', 'ring colour', 'swatch'],
  },
  {
    id: 'quiet-hours',
    title: 'Quiet hours',
    icon: 'moon',
    group: 'setting',
    keywords: ['do not disturb', 'dnd', 'sleep', 'silent', 'night'],
  },
  {
    id: 'calibration',
    title: 'Calibrate the level',
    icon: 'ruler',
    group: 'action',
    keywords: ['calibrate', 'measuring cup', 'accuracy', 'curve'],
  },
  {
    id: 'holder',
    title: 'Phone that syncs the bottle',
    icon: 'smartphone',
    group: 'setting',
    keywords: ['sync', 'holder', 'bluetooth'],
  },
  {
    id: 'take-over',
    title: 'Use this phone for the bottle',
    icon: 'refresh',
    group: 'action',
    keywords: ['take over', 'hold', 'sync phone'],
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    icon: 'activity',
    group: 'action',
    keywords: ['signal', 'firmware', 'clock', 'sensors', 'troubleshoot'],
  },
  {
    id: 'forget',
    title: 'Forget this bottle',
    icon: 'trash',
    group: 'action',
    keywords: ['remove', 'delete', 'unlink'],
  },
];
