import type { PluginSearchEntry } from '@smarteverything/domain';
import {
  SHELLY_ACTIONS,
  SHELLY_PAGES,
  SHELLY_SETTING_ROWS,
  shellyOperation,
  type ShellyDevice,
} from '@smarteverything/shelly';

interface Place {
  readonly page: string;
  readonly group: string;
  readonly keywords: readonly string[];
}

function entry(sensor: ShellyDevice, id: string, title: string, place: Place): PluginSearchEntry {
  return {
    id: `${sensor.id}.${id}`,
    title,
    subtitle: sensor.name,
    keywords: [...place.keywords],
    target: {
      kind: 'device',
      externalId: sensor.externalId,
      section: place.page,
      query: place.group === '' ? {} : { focus: place.group },
    },
  };
}

function zoneEntries(sensor: ShellyDevice): PluginSearchEntry[] {
  return sensor.zones
    .filter((zone) => !zone.main)
    .map((zone) => ({
      ...entry(sensor, zone.externalId, zone.config.name ?? 'Zone', {
        page: 'presence-room',
        group: 'zones',
        keywords: ['zone', 'presence'],
      }),
      target: {
        kind: 'device' as const,
        externalId: sensor.externalId,
        section: 'presence-room',
        query: { zone: String(zone.config.id), focus: 'zones' },
      },
    }));
}

function sensorEntries(sensor: ShellyDevice): PluginSearchEntry[] {
  const available = new Set(
    sensor.features.filter((feature) => feature.available).map((feature) => feature.id),
  );
  return [
    ...SHELLY_PAGES.map((page) =>
      entry(sensor, page.id, page.title, { page: page.id, group: '', keywords: page.keywords }),
    ),
    ...SHELLY_SETTING_ROWS.filter((row) => available.has(row.id)).map((row) =>
      entry(sensor, row.id, row.title, row),
    ),
    ...SHELLY_ACTIONS.filter((action) => available.has(action)).map((action) => {
      const row = shellyOperation(action);
      return entry(sensor, action, row.title, row);
    }),
    ...zoneEntries(sensor),
  ];
}

export function shellySearch(devices: readonly ShellyDevice[]): PluginSearchEntry[] {
  return devices.flatMap(sensorEntries);
}
