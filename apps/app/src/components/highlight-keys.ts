const CAPABILITY = 'capability:';

export const anchorKey = {
  setting: (settingId: string): string => `setting:${settingId}`,
  capability: (deviceId: string, capability: string): string =>
    `${CAPABILITY}${deviceId}:${capability}`,
  step: (stepId: string): string => `step:${stepId}`,
  nav: (node: string): string => `nav:${node}`,
  tile: (deviceId: string): string => `tile:device:${deviceId}`,
} as const;

function capabilityMatches(key: string, focus: string): boolean {
  if (!key.startsWith(CAPABILITY)) return false;
  const qualified = key.slice(CAPABILITY.length);
  const separator = qualified.indexOf(':');
  return separator > 0 && (qualified === focus || qualified.slice(separator + 1) === focus);
}

export function anchorForFocus(keys: Iterable<string>, focus: string): string | null {
  const exact = new Set([anchorKey.setting(focus), anchorKey.step(focus), anchorKey.nav(focus)]);
  let found: string | null = null;
  for (const key of keys) {
    if (!exact.has(key) && !capabilityMatches(key, focus)) continue;
    if (found !== null) return null;
    found = key;
  }
  return found;
}
