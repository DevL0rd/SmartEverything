import type { DeviceRegionSource } from '@smarteverything/domain';

export function deviceRegionSource(): DeviceRegionSource {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return { locale: resolved.locale, timeZone: resolved.timeZone };
}
