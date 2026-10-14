import type { ShellyPresenceDevice, ShellyPresenceZone } from '@smarteverything/domain';
export function shellyZoneValid(snapshot: ShellyPresenceDevice, zone: ShellyPresenceZone): boolean {
  return (
    snapshot.connection.state === 'online' &&
    snapshot.config?.enable === true &&
    snapshot.status !== null &&
    (snapshot.status.errors?.length ?? 0) === 0 &&
    zone.config.enable &&
    zone.status !== null
  );
}
