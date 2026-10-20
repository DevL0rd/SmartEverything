import { GEO_POINT, type GeoPoint } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export function homeZone(store: Pick<Store, 'settings'>): string {
  return store.settings.read().time_zone;
}

export function homeLocation(store: Pick<Store, 'settings'>): GeoPoint | null {
  const settings = store.settings.read();
  const location = GEO_POINT.safeParse({
    latitude: settings.latitude,
    longitude: settings.longitude,
  });
  return location.success ? location.data : null;
}
