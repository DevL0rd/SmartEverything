import {
  SHELLY_LIGHT_CONFIG,
  SHELLY_LIGHT_STATUS,
  SHELLY_PRESENCE_CONFIG,
  SHELLY_PRESENCE_STATUS,
  SHELLY_COMPONENT,
  SHELLY_ZONE_CONFIG,
  SHELLY_ZONE_STATUS,
  shellyPresenceExternalId,
  shellyZoneExternalId,
  type ShellyPresenceDevice,
  type ShellyComponent,
} from '@smarteverything/domain';
import type { ShellyEnrollment } from './enrollment';
import type { ShellyInventory } from './component-inventory';
import { shellyFeatures } from './features';

export function shellySnapshot(
  enrollment: ShellyEnrollment,
  inventory: ShellyInventory,
): ShellyPresenceDevice {
  const config =
    inventory.config['presence'] === undefined
      ? null
      : SHELLY_PRESENCE_CONFIG.parse(inventory.config['presence']);
  const zones = zoneSnapshots(enrollment, inventory, config?.main_zone ?? null);
  const light = lightSnapshots(inventory);
  const components = systemSnapshots(inventory);
  const system = components.find((component) => component.component === 'sys');
  return {
    id: enrollment.info.id,
    externalId: shellyPresenceExternalId(enrollment.info.id),
    name: system?.config.device?.name ?? 'Shelly Presence',
    address: enrollment.address,
    info: enrollment.info,
    connection: { state: 'online', reason: null },
    observedAt: new Date().toISOString(),
    config,
    status:
      inventory.status['presence'] === undefined
        ? null
        : SHELLY_PRESENCE_STATUS.parse(inventory.status['presence']),
    revision: inventory.revision,
    zones,
    light,
    components,
    discoveredBthome: [],
    tracks: [],
    tracksAt: null,
    methods: [...inventory.methods],
    componentKeys: Object.keys(inventory.config),
    features: shellyFeatures(inventory, config),
  };
}

function zoneSnapshots(
  enrollment: ShellyEnrollment,
  inventory: ShellyInventory,
  mainZone: string | null,
): ShellyPresenceDevice['zones'] {
  return Object.entries(inventory.config).flatMap(([key, value]) => {
    if (!key.startsWith('presencezone:')) return [];
    const zone = SHELLY_ZONE_CONFIG.parse(value);
    const generation = enrollment.generations[String(zone.id)] ?? 0;
    return [
      {
        key,
        externalId:
          key === mainZone
            ? shellyPresenceExternalId(enrollment.info.id)
            : shellyZoneExternalId(enrollment.info.id, zone.id, generation),
        generation,
        main: key === mainZone,
        config: {
          ...zone,
          ...(zone.presence_thr === undefined ? {} : { presence_delay: zone.presence_thr }),
          ...(zone.absence_thr === undefined ? {} : { absence_delay: zone.absence_thr }),
        },
        status:
          inventory.status[key] === undefined
            ? null
            : SHELLY_ZONE_STATUS.parse(inventory.status[key]),
      },
    ];
  });
}
function lightSnapshots(inventory: ShellyInventory): ShellyPresenceDevice['light'] {
  return Object.entries(inventory.config).flatMap(([key, value]) =>
    key.startsWith('illuminance:')
      ? [
          {
            config: SHELLY_LIGHT_CONFIG.parse(value),
            status:
              inventory.status[key] === undefined
                ? null
                : SHELLY_LIGHT_STATUS.parse(inventory.status[key]),
          },
        ]
      : [],
  );
}
function systemSnapshots(inventory: ShellyInventory): ShellyComponent[] {
  return Object.entries(inventory.config).flatMap(([key, value]) => {
    const component = key.split(':')[0];
    const recognized = SHELLY_COMPONENT.options.some((group) =>
      group.options.some((schema) => schema.shape.component.safeParse(component).success),
    );
    if (!recognized) return [];
    return [
      SHELLY_COMPONENT.parse({
        key,
        component,
        config: value,
        status: inventory.status[key] ?? null,
      }),
    ];
  });
}
