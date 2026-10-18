import type { AdGuardStatus } from '@smarteverything/domain';

export type Protection = 'on' | 'paused' | 'off';

export function protectionOf(status: AdGuardStatus): Protection {
  if (status.protection) {
    return 'on';
  }
  return status.pausedUntil === null ? 'off' : 'paused';
}
