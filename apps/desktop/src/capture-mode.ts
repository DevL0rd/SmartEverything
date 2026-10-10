import type { DesktopCaptureMode } from '@smarteverything/domain';

export interface CaptureEnvironment {
  readonly platform: NodeJS.Platform;
  readonly sessionType: string | undefined;
  readonly waylandDisplay: string | undefined;
  readonly ozoneSwitch: string;
  readonly ozoneHint: string | undefined;
}

const OZONE_PLATFORMS: readonly string[] = ['wayland', 'x11'];

function ozonePlatformOf(environment: CaptureEnvironment): string | null {
  if (OZONE_PLATFORMS.includes(environment.ozoneSwitch)) {
    return environment.ozoneSwitch;
  }
  const hint = environment.ozoneHint;
  return hint !== undefined && OZONE_PLATFORMS.includes(hint) ? hint : null;
}

function isWaylandSession(environment: CaptureEnvironment): boolean {
  const display = environment.waylandDisplay;
  return environment.sessionType === 'wayland' || (display !== undefined && display !== '');
}

export function captureModeOf(environment: CaptureEnvironment): DesktopCaptureMode {
  if (environment.platform !== 'linux') {
    return 'picker';
  }
  const forced = ozonePlatformOf(environment);
  if (forced !== null) {
    return forced === 'wayland' ? 'portal' : 'picker';
  }
  return isWaylandSession(environment) ? 'portal' : 'picker';
}
