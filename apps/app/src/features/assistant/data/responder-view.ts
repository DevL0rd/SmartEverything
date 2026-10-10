import type { ResponderAppState } from '@smarteverything/domain';

const APP_TEXT: Readonly<Record<ResponderAppState, string>> = {
  not_installed: 'Not installed on your computer',
  not_connected: 'Not connected',
  connected: 'Connected',
  needs_repair: 'Needs repair',
};

export function appText(state: ResponderAppState): string {
  return APP_TEXT[state];
}
