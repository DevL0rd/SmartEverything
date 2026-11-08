import type { SettingsPageDefinition } from './types';

export const SERVER_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'server',
    title: 'Server & remote access',
    icon: 'server',
    parent: null,
    group: 'System',
    keywords: ['public url', 'remote', 'switch server', 'unpair'],
  },
  {
    id: 'server/firewall',
    title: 'Firewall',
    icon: 'shield',
    parent: 'server',
    group: null,
    keywords: ['ports', 'blocked', 'rules'],
  },
  {
    id: 'server/diagnostics',
    title: 'Diagnostics',
    icon: 'activity',
    parent: 'server',
    group: null,
    keywords: ['logs', 'version', 'uptime'],
  },
];
