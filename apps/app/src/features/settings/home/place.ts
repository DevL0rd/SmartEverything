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

export function sunLines(point: GeoPoint, timeZone: string, now: Date): readonly string[] {
  const today = localClock(now, timeZone);
  const rise = sunEventOn('sunrise', today, point);
  const set = sunEventOn('sunset', today, point);
  if (rise === null || set === null) {
    return ['No sunrise or sunset today'];
  }
  return [`Sunrise ${clock(rise, timeZone)}`, `Sunset ${clock(set, timeZone)}`];
}
