import type { DesktopDriveState } from '@smarteverything/domain';
import {
  formatBytes,
  type DesktopServiceHealth,
  type DesktopServiceStatus,
} from '@smarteverything/domain';

import type { DriveSyncTray } from './tray.js';

const HEALTH_LABEL: Readonly<Record<DesktopServiceHealth, string>> = {
  'not-installed': 'Server not installed',
  stopped: 'Server stopped',
  starting: 'Server starting',
  running: 'Server running',
  failed: 'Server failed',
};

export function trayHealthLabel(status: DesktopServiceStatus | null): string {
  if (status === null) {
    return 'Server status unknown';
  }
  const label = HEALTH_LABEL[status.health];
  return status.health === 'running' && status.url !== null ? `${label} at ${status.url}` : label;
}

export function traySyncOf(sync: DesktopDriveState['sync']): DriveSyncTray | null {
  if (sync === null) {
    return null;
  }
  if (sync.paused) {
    return { status: 'Paused', paused: true };
  }
  if (sync.failures > 0) {
    return { status: `${String(sync.failures)} need attention`, paused: false };
  }
  if (sync.needBytes > 0) {
    return { status: `Syncing, ${formatBytes(sync.needBytes)} left`, paused: false };
  }
  return { status: sync.pendingOps > 0 ? 'Syncing' : 'Up to date', paused: false };
}
