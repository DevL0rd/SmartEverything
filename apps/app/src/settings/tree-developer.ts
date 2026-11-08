import type { SettingEnv, SettingsPageDefinition } from './types';

function developerPageShown(env: SettingEnv): boolean {
  return env.owner;
}

function runtimeLogsShown(env: SettingEnv): boolean {
  return env.developer && env.owner;
}

export const RUNTIME_LOGS_PAGE = {
  id: 'developer/logs',
  title: 'Runtime logs',
  icon: 'terminal',
  parent: 'developer',
  group: null,
  subtitle: 'Search logs from the hub and paired devices.',
  keywords: ['logs', 'search logs', 'debug', 'errors', 'diagnostics', 'log sources', 'log levels'],
  visible: runtimeLogsShown,
} satisfies SettingsPageDefinition;

export const DEVELOPER_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'developer',
    title: 'Developer',
    icon: 'wrench',
    parent: null,
    group: 'App',
    subtitle: 'Diagnostics and profiling for this device.',
    keywords: ['debug', 'profiler', 'performance', 'logging', 'verbose', 'lag', 'diagnostics'],
    visible: developerPageShown,
  },
  RUNTIME_LOGS_PAGE,
];
