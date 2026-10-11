import type { SettingsPageDefinition } from './types';

export const DEVELOPER_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'developer',
    title: 'Developer',
    icon: 'wrench',
    parent: null,
    group: 'App',
    subtitle: 'Debug tools for this device. Everything is off by default.',
    keywords: ['debug', 'profiler', 'performance', 'logging', 'verbose', 'lag', 'diagnostics'],
  },
];
