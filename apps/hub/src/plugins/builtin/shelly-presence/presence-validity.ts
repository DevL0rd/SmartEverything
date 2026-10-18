import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
export function shellyZoneValid(snapshot: ShellyDevice, zone: ShellyZone): boolean {
  return (
    snapshot.connection.state === 'online' &&
    snapshot.config?.enable === true &&
    snapshot.status !== null &&
    (snapshot.status.errors?.length ?? 0) === 0 &&
    zone.config.enable === true &&
    zone.status !== null
  );
}
