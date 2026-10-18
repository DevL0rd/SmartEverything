import { type JsonValue } from '@smarteverything/domain';
import {
  SHELLY_COMPONENT,
  SHELLY_LIGHT_STATUS,
  shellyComponentCapability,
  type ShellyDevice,
  type ShellyTracks,
} from '@smarteverything/shelly';

export interface PresenceReadings {
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly observedAt: string | null;
}

const VALUE_COMPONENTS: ReadonlySet<string> = new Set([
  'boolean',
  'number',
  'enum',
  'text',
  'button',
  'group',
  'bthomesensor',
]);

export function readingKey(externalId: string, capability: string): string {
  return `${externalId}|${capability}`;
}

function zoneExternalId(sensor: ShellyDevice, zone: ShellyDevice['zones'][number]): string {
  return zone.main ? sensor.externalId : zone.externalId;
}

export function readingKeys(
  sensor: ShellyDevice,
): readonly (readonly [externalId: string, capability: string])[] {
  return [
    ...sensor.zones.flatMap((zone) => [
      [zoneExternalId(sensor, zone), 'occupancy'] as const,
      [zoneExternalId(sensor, zone), 'object_count'] as const,
    ]),
    ...(sensor.light.length === 0
      ? []
      : ([
          [sensor.externalId, 'illuminance'],
          [sensor.externalId, 'illumination'],
        ] as const)),
    ...sensor.components
      .filter((component) => VALUE_COMPONENTS.has(component.component))
      .map((component) => [sensor.externalId, shellyComponentCapability(component.key)] as const),
  ];
}

type ReadingValues = PresenceReadings['values'];

function zonesWith(sensor: ShellyDevice, readings: ReadingValues): ShellyDevice['zones'] {
  return sensor.zones.map((zone) => {
    if (zone.status === null) return zone;
    const id = zoneExternalId(sensor, zone);
    const occupied = readings[readingKey(id, 'occupancy')];
    const objects = readings[readingKey(id, 'object_count')];
    const value = typeof occupied === 'boolean' ? occupied : zone.status.value;
    const count = typeof objects === 'number' ? objects : zone.status.num_objects;
    if (value === zone.status.value && count === zone.status.num_objects) return zone;
    return { ...zone, status: { ...zone.status, value, num_objects: count } };
  });
}

function lightWith(sensor: ShellyDevice, readings: ReadingValues): ShellyDevice['light'] {
  const lux = readings[readingKey(sensor.externalId, 'illuminance')];
  const illumination = SHELLY_LIGHT_STATUS.shape.illumination.safeParse(
    readings[readingKey(sensor.externalId, 'illumination')],
  );
  return sensor.light.map((light, index) => {
    if (index > 0 || light.status === null) return light;
    const nextLux = typeof lux === 'number' ? lux : light.status.lux;
    const nextCategory = illumination.success ? illumination.data : light.status.illumination;
    if (nextLux === light.status.lux && nextCategory === light.status.illumination) return light;
    return { ...light, status: { ...light.status, lux: nextLux, illumination: nextCategory } };
  });
}

function componentsWith(sensor: ShellyDevice, readings: ReadingValues): ShellyDevice['components'] {
  return sensor.components.map((component) => {
    const reading =
      readings[readingKey(sensor.externalId, shellyComponentCapability(component.key))];
    if (reading === undefined || component.status === null || !('value' in component.status))
      return component;
    if (Object.is(component.status['value'], reading)) return component;
    const next = SHELLY_COMPONENT.safeParse({
      ...component,
      status: { ...component.status, value: reading },
    });
    return next.success ? next.data : component;
  });
}

function changed<T>(before: readonly T[], after: readonly T[]): boolean {
  return before.some((item, index) => item !== after[index]);
}

function sameReadings(before: ShellyDevice, after: ShellyDevice): boolean {
  return (
    before.observedAt === after.observedAt &&
    !changed(before.zones, after.zones) &&
    !changed(before.light, after.light) &&
    !changed(before.components, after.components)
  );
}

function observedAtWith(sensor: ShellyDevice, readings: PresenceReadings): string | null {
  if (readings.observedAt === null) return sensor.observedAt;
  if (sensor.observedAt === null) return readings.observedAt;
  return Date.parse(readings.observedAt) > Date.parse(sensor.observedAt)
    ? readings.observedAt
    : sensor.observedAt;
}

export function liveSensor(sensor: ShellyDevice, readings: PresenceReadings): ShellyDevice {
  const next = {
    ...sensor,
    zones: zonesWith(sensor, readings.values),
    light: lightWith(sensor, readings.values),
    components: componentsWith(sensor, readings.values),
    observedAt: observedAtWith(sensor, readings),
  };
  return sameReadings(sensor, next) ? sensor : next;
}

export function trackedSensor(sensor: ShellyDevice, tracked: ShellyTracks | null): ShellyDevice {
  const track = tracked?.devices.find((entry) => entry.id === sensor.id);
  const tracks = track?.tracks ?? [];
  const tracksAt = track?.tracksAt ?? null;
  const unchanged =
    tracks.length === 0 && sensor.tracks.length === 0 && sensor.tracksAt === tracksAt;
  return unchanged ? sensor : { ...sensor, tracks, tracksAt };
}
