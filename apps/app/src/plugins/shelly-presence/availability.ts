import type { ShellyPresenceDevice } from '@smarteverything/domain';

export function presenceFeature(
  sensor: ShellyPresenceDevice,
  id: string,
): ShellyPresenceDevice['features'][number] | undefined {
  return sensor.features.find((feature) => feature.id === id);
}

export function presenceActionAvailable(sensor: ShellyPresenceDevice, action: string): boolean {
  return presenceFeature(sensor, action)?.available === true;
}
