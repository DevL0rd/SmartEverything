import type { Href } from 'expo-router';
import { href } from './hrefs';

function climateHref(rest: readonly string[]): Href | null {
  const [page] = rest;
  if (page === undefined) {
    return href.devices();
  }
  return page === 'air' || page === 'supplies' ? href.devicesPage(page) : null;
}

function deviceSettingsHref(rest: readonly string[]): Href | null {
  const [deviceId, page, extra] = rest;
  if (deviceId === undefined || deviceId === 'add' || extra !== undefined) {
    return null;
  }
  if (page === undefined) {
    return href.settings.device(deviceId);
  }
  return page === 'remotes' || page === 'diagnostics' ? href.settings.device(deviceId, page) : null;
}

export function legacyHref(segments: readonly string[]): Href | null {
  const [first, second, ...rest] = segments;
  if (first === 'climate') {
    return climateHref(second === undefined ? [] : [second, ...rest]);
  }
  return first === 'settings' && second === 'devices' ? deviceSettingsHref(rest) : null;
}
