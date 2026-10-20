import type { ComputerScope } from '@smarteverything/domain';

export interface ScopeRow {
  readonly scope: ComputerScope;
  readonly title: string;
  readonly description: string;
}

const SCOPE_TEXT: Readonly<
  Record<ComputerScope, { readonly title: string; readonly description: string }>
> = {
  files: { title: 'Files', description: 'Browse and download files' },
  apps: { title: 'Apps', description: 'Open and close apps' },
  app_events: {
    title: 'App events',
    description: 'Tell the home when apps open, close, come to the front or leave it',
  },
  processes: {
    title: 'Programs',
    description: 'See what is running and end your own programs',
  },
  metrics: {
    title: 'Readings',
    description: 'Processor, memory, disk and temperature figures',
  },
  screenshots: {
    title: 'Screenshots',
    description: 'Take screenshots to attach to a chat',
  },
  input: {
    title: 'Pointer and keyboard',
    description: 'Click, type and scroll as a person would; this computer asks once to allow it',
  },
  system: {
    title: 'System settings',
    description: 'Sound, screens, power mode, Wi-Fi, startup apps and services',
  },
  power: {
    title: 'Power actions',
    description: 'Shut down, restart, sleep, lock and sign out',
  },
  ai_power: {
    title: 'Assistant power actions',
    description: 'Let the assistant use power actions',
  },
};

const SCOPE_ORDER = [
  'files',
  'apps',
  'app_events',
  'system',
  'processes',
  'metrics',
  'screenshots',
  'input',
  'power',
  'ai_power',
] as const satisfies readonly ComputerScope[];

export const SCOPE_ROWS: readonly ScopeRow[] = SCOPE_ORDER.map((scope) => ({
  scope,
  ...SCOPE_TEXT[scope],
}));

export function scopeTitle(scope: ComputerScope): string {
  return SCOPE_TEXT[scope].title;
}
