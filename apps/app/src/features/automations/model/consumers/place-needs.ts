import type { AutomationV3, Place } from '@smarteverything/domain';
import { activeTriggers } from './row';

export type PlaceReading =
  | { readonly usable: true; readonly place: Place }
  | { readonly usable: false; readonly problem: string };

export type PlaceStatus =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'zone-differs'; readonly home: string; readonly device: string }
  | { readonly kind: 'no-location' };

export function usesSun(programs: readonly AutomationV3[]): boolean {
  return programs.some((program) =>
    activeTriggers(program).some((trigger) => trigger.kind === 'trigger.sun'),
  );
}

export function placeStatusFor(
  reading: PlaceReading,
  deviceZone: string,
  programs: readonly AutomationV3[],
): PlaceStatus {
  if (!reading.usable) return { kind: 'invalid' };
  const { place } = reading;
  if (place.timeZone !== deviceZone) {
    return { kind: 'zone-differs', home: place.timeZone, device: deviceZone };
  }
  return usesSun(programs) && place.location === null ? { kind: 'no-location' } : { kind: 'ok' };
}
