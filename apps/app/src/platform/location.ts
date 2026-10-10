import { GEO_POINT, type GeoPoint } from '@smarteverything/domain';
import { requireOptionalNativeModule } from 'expo';
import { appPlatform } from '../design/platform';

const NATIVE_MODULE = 'ExpoLocation';

export class LocationDeniedError extends Error {
  override readonly name = 'LocationDeniedError';

  constructor(readonly canAskAgain: boolean) {
    super('Location permission was not granted.');
  }
}

export class LocationMissingError extends Error {
  override readonly name = 'LocationMissingError';

  constructor() {
    super('Update the app to use your location.');
  }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function canLocateHere(): boolean {
  return appPlatform() === 'android';
}

export async function locateHere(): Promise<GeoPoint> {
  if (requireOptionalNativeModule(NATIVE_MODULE) === null) {
    throw new LocationMissingError();
  }
  const location = await import('expo-location');
  const permission = await location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new LocationDeniedError(permission.canAskAgain);
  }
  const position = await location.getCurrentPositionAsync({
    accuracy: location.Accuracy.Balanced,
  });
  return GEO_POINT.parse({
    latitude: rounded(position.coords.latitude),
    longitude: rounded(position.coords.longitude),
  });
}
