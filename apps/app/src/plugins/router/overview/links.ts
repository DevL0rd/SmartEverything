import type { Href } from 'expo-router';

export function routerSectionHref(
  deviceId: string,
  section: string,
  query: Readonly<Record<string, string>> = {},
): Href {
  return { pathname: '/device/[deviceId]/[section]', params: { deviceId, section, ...query } };
}
