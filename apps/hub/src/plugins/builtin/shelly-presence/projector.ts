import { shellyZoneValid } from './presence-validity';
import { componentCapabilities, projectComponents } from './component-projection';
import {
  SHELLY_PRESENCE_ARGUMENTS,
  SHELLY_PRESENCE_DETECTION_CAPABILITY,
  SHELLY_PRESENCE_OPERATION_CAPABILITY,
  type AdapterSink,
  type DeviceCapability,
  type DiscoveredDevice,
  type ShellyPresenceDevice,
  type ShellyPresenceZone,
} from '@smarteverything/domain';

const READINGS: readonly DeviceCapability[] = [
  { key: 'occupancy', label: 'Occupancy', access: 'read', value: { kind: 'boolean' } },
  {
    key: 'object_count',
    label: 'Detected objects',
    access: 'read',
    value: { kind: 'number', min: 0, max: 65535, step: 1 },
  },
];
const LIGHT: readonly DeviceCapability[] = [
  {
    key: 'illuminance',
    label: 'Light level',
    access: 'read',
    value: { kind: 'number', min: 0, max: 10000000, step: 0.001, unit: 'lux' },
  },
  {
    key: 'illumination',
    label: 'Light category',
    access: 'read',
    value: { kind: 'enum', options: ['dark', 'twilight', 'bright'] },
  },
];
const CONTROLS: readonly DeviceCapability[] = [
  {
    key: SHELLY_PRESENCE_DETECTION_CAPABILITY,
    label: 'Presence detection',
    access: 'read_write',
    value: { kind: 'boolean' },
  },
  {
    key: SHELLY_PRESENCE_OPERATION_CAPABILITY,
    label: 'Sensor operation',
    access: 'write',
    value: {
      kind: 'action',
      arguments: SHELLY_PRESENCE_ARGUMENTS,
    },
  },
];
export function shellyDevices(snapshot: ShellyPresenceDevice): DiscoveredDevice[] {
  const parent = describe(snapshot, snapshot.externalId, snapshot.name, {
    parentExternalId: null,
    capabilities: [
      ...READINGS,
      ...(snapshot.light.length === 0 ? [] : LIGHT),
      ...CONTROLS,
      ...componentCapabilities(snapshot),
    ],
  });
  return [
    parent,
    ...snapshot.zones
      .filter((zone) => !zone.main)
      .map((zone) =>
        describe(
          snapshot,
          zone.externalId,
          `${snapshot.name} · ${zone.config.name ?? `Zone ${String(zone.config.id)}`}`,
          { parentExternalId: snapshot.externalId, capabilities: READINGS },
        ),
      ),
  ];
}
function describe(
  snapshot: ShellyPresenceDevice,
  externalId: string,
  name: string,
  projection: {
    readonly parentExternalId: string | null;
    readonly capabilities: readonly DeviceCapability[];
  },
): DiscoveredDevice {
  return {
    provider: 'local',
    externalId,
    parentExternalId: projection.parentExternalId,
    kind: 'sensor',
    name,
    model: snapshot.info.model,
    manufacturer: 'Shelly',
    room: null,
    online: snapshot.connection.state === 'online',
    capabilities: [...projection.capabilities],
    details: {
      pluginId: 'shelly-presence',
      firmware: snapshot.info.ver,
      shellyId: snapshot.id,
      physicalExternalId: snapshot.externalId,
      component: externalId === snapshot.externalId ? 'presence' : 'presencezone',
    },
  };
}
export function projectShellyReadings(sink: AdapterSink, snapshot: ShellyPresenceDevice): void {
  const observedAt = snapshot.observedAt ?? new Date().toISOString();
  if (!snapshot.zones.some((zone) => zone.main))
    for (const capability of ['occupancy', 'object_count'] as const)
      sink.state({ externalId: snapshot.externalId, capability, value: null, observedAt });
  for (const zone of snapshot.zones) projectZone(sink, snapshot, zone, observedAt);
  projectLight(sink, snapshot, observedAt);
  projectComponents(sink, snapshot, observedAt);
  sink.state({
    externalId: snapshot.externalId,
    capability: SHELLY_PRESENCE_DETECTION_CAPABILITY,
    value: snapshot.config?.enable ?? null,
    observedAt,
  });
}
function projectZone(
  sink: AdapterSink,
  snapshot: ShellyPresenceDevice,
  zone: ShellyPresenceZone,
  observedAt: string,
): void {
  const externalId = zone.main ? snapshot.externalId : zone.externalId;
  const valid = shellyZoneValid(snapshot, zone);
  sink.state({
    externalId,
    capability: 'occupancy',
    value: valid ? (zone.status?.value ?? null) : null,
    observedAt,
  });
  sink.state({
    externalId,
    capability: 'object_count',
    value: valid ? (zone.status?.num_objects ?? null) : null,
    observedAt,
  });
}
function projectLight(sink: AdapterSink, snapshot: ShellyPresenceDevice, observedAt: string): void {
  const light = snapshot.light[0];
  if (light === undefined) return;
  const status = light.status;
  const valid = lightValid(snapshot, status);
  const lux = status?.lux ?? null;
  const illumination = status?.illumination ?? null;
  sink.state({
    externalId: snapshot.externalId,
    capability: 'illuminance',
    value: valid ? lux : null,
    observedAt,
  });
  sink.state({
    externalId: snapshot.externalId,
    capability: 'illumination',
    value: valid ? illumination : null,
    observedAt,
  });
}
function lightValid(
  snapshot: ShellyPresenceDevice,
  status: ShellyPresenceDevice['light'][number]['status'],
): boolean {
  return (
    snapshot.connection.state === 'online' && status !== null && (status.errors?.length ?? 0) === 0
  );
}
