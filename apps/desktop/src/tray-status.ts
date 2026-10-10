import type { DesktopServiceHealth, DesktopServiceStatus } from '@smarteverything/domain';

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
