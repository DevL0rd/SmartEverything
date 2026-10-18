import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import type { Device } from '../../store/state';

export function shownZone(sensor: ShellyDevice, device: Device): ShellyZone | null {
  return (
    sensor.zones.find((zone) => zone.externalId === device.external_id) ??
    (sensor.externalId === device.external_id
      ? (sensor.zones.find((zone) => zone.main) ?? null)
      : null)
  );
}

function occupancyLabel(zone: ShellyZone | null): string {
  const value = zone?.status?.value ?? null;
  return value === null ? 'Unknown' : value ? 'Occupied' : 'Clear';
}

export function zoneState(sensor: ShellyDevice, zone: ShellyZone | null): string {
  if (sensor.connection.state !== 'online')
    return {
      offline: 'Offline',
      paused: 'Plugin paused',
      connecting: 'Connecting',
      needs_auth: 'Needs authentication',
    }[sensor.connection.state];
  if ((sensor.status?.errors?.length ?? 0) > 0) return 'Sensor fault';
  if (sensor.config?.enable === false) return 'Detection paused';
  if (zone?.config.enable === false) return 'Disabled';
  return occupancyLabel(zone);
}

export function zoneCount(sensor: ShellyDevice, zone: ShellyZone | null): string {
  if (
    sensor.connection.state !== 'online' ||
    ['Detection paused', 'Disabled', 'Unknown', 'Sensor fault'].includes(zoneState(sensor, zone))
  )
    return '—';
  const count = zone?.status?.num_objects ?? null;
  return count === null ? '—' : String(count);
}

export function lightText(sensor: ShellyDevice): string {
  const light = sensor.light[0];
  if (light?.status === undefined || light.status === null || sensor.connection.state !== 'online')
    return 'Light unknown';
  const lux = light.status.lux;
  const category = light.status.illumination;
  return [lux === null || lux === undefined ? 'Light unknown' : `${String(lux)} lx`, category]
    .filter((part) => part !== null)
    .join(' · ');
}
