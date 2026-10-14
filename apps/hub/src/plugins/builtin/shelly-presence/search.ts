import {
  SHELLY_PRESENCE_FIELDS,
  SHELLY_PRESENCE_OPERATIONS,
  SHELLY_PRESENCE_PAGES,
  type PluginSearchEntry,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
export function shellySearch(devices: readonly ShellyPresenceDevice[]): PluginSearchEntry[] {
  return devices.flatMap((sensor) => [
    ...SHELLY_PRESENCE_PAGES.map((page) =>
      entry(sensor, page.id, page.title, { page: page.id, focus: '', keywords: page.keywords }),
    ),
    ...SHELLY_PRESENCE_FIELDS.filter((field) =>
      sensor.features.some((feature) => feature.id === field.id && feature.available),
    ).map((field) =>
      entry(sensor, field.id, field.title, {
        page: field.page,
        focus: field.focus,
        keywords: field.keywords,
      }),
    ),
    ...SHELLY_PRESENCE_OPERATIONS.filter((op) =>
      sensor.features.some((feature) => feature.id === op.action && feature.available),
    ).map((op) =>
      entry(sensor, op.action, op.title, { page: op.page, focus: op.focus, keywords: op.keywords }),
    ),
    ...sensor.zones
      .filter((zone) => !zone.main)
      .map((zone) => ({
        ...entry(sensor, zone.externalId, zone.config.name ?? 'Zone', {
          page: 'presence-room',
          focus: 'zones',
          keywords: ['zone', 'presence'],
        }),
        target: {
          kind: 'device' as const,
          externalId: sensor.externalId,
          section: 'presence-room',
          query: { zone: String(zone.config.id), focus: 'zones' },
        },
      })),
  ]);
}
function entry(
  sensor: ShellyPresenceDevice,
  id: string,
  title: string,
  metadata: { readonly page: string; readonly focus: string; readonly keywords: readonly string[] },
): PluginSearchEntry {
  const { page, focus, keywords } = metadata;
  return {
    id: `${sensor.id}.${id}`.slice(0, 200),
    title,
    subtitle: sensor.name,
    keywords: [...keywords],
    target: {
      kind: 'device',
      externalId: sensor.externalId,
      section: page,
      query: focus === '' ? {} : { focus },
    },
  };
}
