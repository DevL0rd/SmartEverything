import type { DesktopVersionArgumentPrefix } from '@smarteverything/domain';

export const APP_SCHEME = 'app';
export const APP_HOST = 'smarteverything';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_START_URL = `${APP_ORIGIN}/`;
export const METRO_START_URL = 'http://localhost:8081/';
export const DEEP_LINK_SCHEME = 'smarteverything';
export const HIDDEN_START_ARGUMENT = '--hidden';

export const INSTALL_SERVICE_ARGUMENT = '--install-service';
export const VERSION_ARGUMENT_PREFIX: DesktopVersionArgumentPrefix = '--smarteverything-version=';

export function originOf(candidate: string): string | undefined {
  if (!URL.canParse(candidate)) {
    return undefined;
  }
  const url = new URL(candidate);
  return url.host === '' ? undefined : `${url.protocol}//${url.host}`;
}

export function isAppOrigin(
  candidate: string | undefined,
  startUrl: string = APP_START_URL,
): boolean {
  return candidate !== undefined && originOf(candidate) === originOf(startUrl);
}
