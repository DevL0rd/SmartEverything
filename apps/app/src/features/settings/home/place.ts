import { localClock, sunEventOn, type GeoPoint } from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import { clock, zoneLabel } from '../../../format/time';

function offsetOf(zone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((entry) => entry.type === 'timeZoneName');
  return part?.value ?? zone;
}

let zones: readonly SelectOption<string>[] | null = null;

export function timeZoneOptions(): readonly SelectOption<string>[] | null {
  if (!('supportedValuesOf' in Intl)) {
    return null;
  }
  zones ??= ['UTC', ...Intl.supportedValuesOf('timeZone')].map((zone) => ({
    value: zone,
    label: zoneLabel(zone),
    description: offsetOf(zone),
  }));
  return zones;
}

export function matchingTimeZone(
  zone: string,
  options: readonly SelectOption<string>[],
): string | null {
  if (options.some((option) => option.value === zone)) return zone;
  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
    return options.some((option) => option.value === canonical) ? canonical : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function sunLines(point: GeoPoint, timeZone: string, now: Date): readonly string[] {
  const today = localClock(now, timeZone);
  const rise = sunEventOn('sunrise', today, point);
  const set = sunEventOn('sunset', today, point);
  if (rise === null || set === null) {
    return ['No sunrise or sunset today'];
  }
  return [`Sunrise ${clock(rise, timeZone)}`, `Sunset ${clock(set, timeZone)}`];
}
