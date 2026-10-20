import type { IconName } from '../../../components/icon';

export interface SettingRow {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly group: 'setting' | 'action';
  readonly keywords: readonly string[];
}

export const PRINTER_WORDS = ['printer', 'print', 'ink', 'toner', 'IPP', 'paper'] as const;

export const SETTING_ROWS: readonly SettingRow[] = [
  {
    id: 'connection',
    title: 'Printer address and security',
    icon: 'link',
    group: 'setting',
    keywords: ['uri', 'ipp', 'ipps', 'address', 'certificate', 'fingerprint'],
  },
  {
    id: 'trust-certificate',
    title: 'Trust the new certificate',
    icon: 'shield',
    group: 'action',
    keywords: ['certificate', 'pin', 'fingerprint'],
  },
  {
    id: 'credentials',
    title: 'Printer sign-in',
    icon: 'key',
    group: 'setting',
    keywords: ['password', 'user name', 'login', 'authentication'],
  },
  {
    id: 'rescan',
    title: 'Look for printers again',
    icon: 'refresh',
    group: 'action',
    keywords: ['scan', 'discover', 'find'],
  },
  {
    id: 'forget',
    title: 'Forget this printer',
    icon: 'trash',
    group: 'action',
    keywords: ['remove', 'delete'],
  },
  {
    id: 'updates',
    title: 'How often to check the printer',
    icon: 'timer',
    group: 'setting',
    keywords: ['interval', 'poll', 'refresh', 'lease', 'subscription'],
  },
  {
    id: 'low-levels',
    title: 'Low ink levels',
    icon: 'droplet',
    group: 'setting',
    keywords: ['threshold', 'low', 'warning', 'cartridge'],
  },
  {
    id: 'prices',
    title: 'Cartridge prices and yields',
    icon: 'trendUp',
    group: 'setting',
    keywords: ['cost', 'price', 'yield', 'money'],
  },
  {
    id: 'goals',
    title: 'Print goals and budget',
    icon: 'trophy',
    group: 'setting',
    keywords: ['weekly', 'budget', 'cap', 'print less'],
  },
  {
    id: 'defaults',
    title: 'My print defaults',
    icon: 'fileText',
    group: 'setting',
    keywords: ['sides', 'duplex', 'colour', 'quality', 'copies', 'paper'],
  },
  {
    id: 'notifications',
    title: 'Printer notifications',
    icon: 'bell',
    group: 'setting',
    keywords: ['low', 'empty', 'problem', 'offline', 'job finished'],
  },
  {
    id: 'clear-history',
    title: 'Clear print history',
    icon: 'trash',
    group: 'action',
    keywords: ['delete', 'history', 'reset'],
  },
];
