import { GEO_POINT, type GeoPoint } from '@smarteverything/domain';
import type { WorldSource } from './world-mirror';

export function homeZone(world: Pick<WorldSource, 'settings'>): string {
  return world.settings.read().time_zone;
}

export function homeLocation(world: Pick<WorldSource, 'settings'>): GeoPoint | null {
  const settings = world.settings.read();
  const location = GEO_POINT.safeParse({
    latitude: settings.latitude,
    longitude: settings.longitude,
  });
  return location.success ? location.data : null;
}
