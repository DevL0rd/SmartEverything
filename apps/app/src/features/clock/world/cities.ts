import { TIME_ZONE, type GeoPoint, type PlannerPreferences } from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import { compareText } from '../../../format/text';
import { cityOf } from '../frame/rail-summary';
import { zonePointOf, zonesWithPoints } from './zone-points';
import { offsetToHomeOf } from './world-time';

export type WorldClock = PlannerPreferences['clock']['world_clocks'][number];

export interface WorldCity {
  readonly key: string;
  readonly name: string;
  readonly zone: string;
  readonly home: boolean;
  readonly point: GeoPoint | null;
}

export interface HomePlace {
  readonly zone: string;
  readonly point: GeoPoint | null;
}

export function homePointOf(settings: {
  readonly latitude: number | null;
  readonly longitude: number | null;
}): GeoPoint | null {
  if (settings.latitude === null || settings.longitude === null) return null;
  return { latitude: settings.latitude, longitude: settings.longitude };
}

export function citiesOf(home: HomePlace, clocks: readonly WorldClock[]): readonly WorldCity[] {
  return [
    {
      key: 'home',
      name: cityOf({ time_zone: home.zone, label: null }),
      zone: home.zone,
      home: true,
      point: home.point,
    },
    ...clocks.map((world) => ({
      key: `world:${world.time_zone}`,
      name: cityOf(world),
      zone: world.time_zone,
      home: false,
      point: zonePointOf(world.time_zone),
    })),
  ];
}

export function addedClock(clocks: readonly WorldClock[], zone: string): readonly WorldClock[] {
  if (clocks.some((world) => world.time_zone === zone)) return clocks;
  return [...clocks, { time_zone: zone, label: null }];
}

export function removedClock(clocks: readonly WorldClock[], zone: string): readonly WorldClock[] {
  return clocks.filter((world) => world.time_zone !== zone);
}

export function movedClock(
  clocks: readonly WorldClock[],
  zone: string,
  by: -1 | 1,
): readonly WorldClock[] {
  const from = clocks.findIndex((world) => world.time_zone === zone);
  const to = from + by;
  const moving = clocks[from];
  if (moving === undefined || to < 0 || to >= clocks.length) return clocks;
  const rest = clocks.filter((_, index) => index !== from);
  return [...rest.slice(0, to), moving, ...rest.slice(to)];
}

export function canMove(clocks: readonly WorldClock[], zone: string, by: -1 | 1): boolean {
  return movedClock(clocks, zone, by) !== clocks;
}

let knownZones: readonly string[] | null = null;

export function pickableZones(): readonly string[] {
  knownZones ??= zonesWithPoints().filter((zone) => TIME_ZONE.safeParse(zone).success);
  return knownZones;
}

function regionOf(zone: string): string {
  return zone.split('/').slice(0, -1).join(' › ').replaceAll('_', ' ');
}

export function cityOptionsOf(
  zones: readonly string[],
  taken: readonly string[],
  at: number,
  homeZone: string,
): readonly SelectOption<string>[] {
  return zones
    .filter((zone) => !taken.includes(zone))
    .map((zone) => ({
      value: zone,
      label: cityOf({ time_zone: zone, label: null }),
      description: `${regionOf(zone)} · ${offsetToHomeOf(at, zone, homeZone)}`,
    }))
    .sort((left, right) => compareText(left.label, right.label));
}
