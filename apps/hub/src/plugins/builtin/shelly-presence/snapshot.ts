import {
  SHELLY_COMPONENT,
  SHELLY_LIGHT_SETTINGS,
  SHELLY_LIGHT_STATUS,
  SHELLY_PRESENCE_SETTINGS,
  SHELLY_PRESENCE_STATUS,
  SHELLY_SETTING_COMPONENTS,
  SHELLY_ZONE_SETTINGS,
  SHELLY_ZONE_STATUS,
  shellyExternalId,
  shellyZoneDelays,
  shellyZoneExternalId,
  type ShellyDevice,
} from '@smarteverything/shelly';
import { z } from 'zod';
import type { ShellyInventory } from './component-inventory';
import type { ShellyEnrollment } from './enrollment';
import { shellyFeatures } from './features';

const DEDICATED: ReadonlySet<string> = new Set(['presence', 'presencezone', 'illuminance']);
const COMPONENT_TYPES: ReadonlySet<string> = new Set(
  SHELLY_SETTING_COMPONENTS.filter((component) => !DEDICATED.has(component)),
);
const DEVICE_NAME = z.object({
  device: z.looseObject({ name: z.string().nullable().optional() }).optional(),
});

function statusOf<T>(inventory: ShellyInventory, key: string, schema: z.ZodType<T>): T | null {
  const status = inventory.status[key];
  return status === undefined ? null : schema.parse(status);
}

function zones(
  enrollment: ShellyEnrollment,
  inventory: ShellyInventory,
  main: string | undefined,
): ShellyDevice['zones'] {
  return Object.entries(inventory.config).flatMap(([key, value]) => {
    if (!key.startsWith('presencezone:')) return [];
    const zone = SHELLY_ZONE_SETTINGS.parse(value);
    const generation = enrollment.generations[String(zone.id)] ?? 0;
    return [
      {
        key,
        externalId:
          key === main
            ? shellyExternalId(enrollment.info.id)
            : shellyZoneExternalId(enrollment.info.id, zone.id, generation),
        generation,
        main: key === main,
        config: shellyZoneDelays(zone),
        status: statusOf(inventory, key, SHELLY_ZONE_STATUS),
      },
    ];
  });
}

function light(inventory: ShellyInventory): ShellyDevice['light'] {
  return Object.entries(inventory.config).flatMap(([key, value]) =>
    key.startsWith('illuminance:')
      ? [
          {
            config: SHELLY_LIGHT_SETTINGS.parse(value),
            status: statusOf(inventory, key, SHELLY_LIGHT_STATUS),
          },
        ]
      : [],
  );
}

function components(inventory: ShellyInventory): ShellyDevice['components'] {
  return Object.entries(inventory.config).flatMap(([key, config]) => {
    const component = key.split(':')[0] ?? key;
    if (!COMPONENT_TYPES.has(component)) return [];
    return [
      SHELLY_COMPONENT.parse({ key, component, config, status: inventory.status[key] ?? null }),
    ];
  });
}

export function shellySnapshot(
  enrollment: ShellyEnrollment,
  inventory: ShellyInventory,
): ShellyDevice {
  const presence = inventory.config['presence'];
  const config = presence === undefined ? null : SHELLY_PRESENCE_SETTINGS.parse(presence);
  const name = DEVICE_NAME.parse(inventory.config['sys']).device?.name;
  return {
    id: enrollment.info.id,
    externalId: shellyExternalId(enrollment.info.id),
    name: name ?? `Shelly Presence ${enrollment.info.mac.slice(-4).toUpperCase()}`,
    address: enrollment.address,
    info: enrollment.info,
    connection: { state: 'online', reason: null },
    observedAt: new Date().toISOString(),
    config,
    status: statusOf(inventory, 'presence', SHELLY_PRESENCE_STATUS),
    revision: inventory.revision,
    zones: zones(enrollment, inventory, config?.main_zone),
    light: light(inventory),
    components: components(inventory),
    discoveredBthome: [],
    tracks: [],
    tracksAt: null,
    methods: [...inventory.methods],
    componentKeys: Object.keys(inventory.config),
    features: shellyFeatures(inventory),
  };
}
