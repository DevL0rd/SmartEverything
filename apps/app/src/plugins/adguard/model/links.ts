import type { AppHref } from '../../../components/app-href';

export function adguardSectionHref(
  deviceId: string,
  section: string,
  query: Readonly<Record<string, string>> = {},
): AppHref {
  return { pathname: '/device/[deviceId]/[section]', params: { deviceId, section, ...query } };
}
