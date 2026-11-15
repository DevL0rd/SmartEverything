import { TIME_ZONE } from '@smarteverything/domain';
import ICAL from 'ical.js';
import { WINDOWS_ZONES } from './windows-zones';

const VENDOR_PREFIX = /^\/[^/]+\.org\/[^/]+\//;

function ianaOf(name: string): string | null {
  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions()
      .timeZone;
    return TIME_ZONE.safeParse(canonical).success ? canonical : null;
  } catch (cause) {
    if (cause instanceof RangeError) return null;
    throw cause;
  }
}

export type ResolvedZone =
  | { readonly kind: 'iana'; readonly zone: string }
  | { readonly kind: 'rules'; readonly zone: ICAL.Timezone };

export class ZoneBook {
  private readonly defined = new Map<string, ICAL.Timezone>();

  constructor(calendar: ICAL.Component) {
    for (const component of calendar.getAllSubcomponents('vtimezone')) {
      const zone = new ICAL.Timezone(component);
      this.defined.set(zone.tzid, zone);
    }
  }

  resolve(tzid: string): ResolvedZone | null {
    const trimmed = tzid.trim().replace(VENDOR_PREFIX, '');
    const direct = ianaOf(trimmed);
    if (direct !== null) return { kind: 'iana', zone: direct };
    const windows = WINDOWS_ZONES[trimmed];
    if (windows !== undefined) {
      const mapped = ianaOf(windows);
      if (mapped !== null) return { kind: 'iana', zone: mapped };
    }
    const own = this.defined.get(tzid);
    return own === undefined ? null : { kind: 'rules', zone: own };
  }
}
