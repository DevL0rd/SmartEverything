import {
  SHELLY_PRESENCE_FIELDS,
  SHELLY_SYSTEM_COMPONENT,
  type ShellyPresenceDevice,
  type ShellyPresenceField,
  type ShellyPresencePage,
  type ShellySystemComponent,
} from '@smarteverything/domain';

export interface ComponentGroup {
  readonly key: string;
  readonly title: string;
  readonly focus: string;
  readonly component: ShellySystemComponent;
  readonly fields: readonly ShellyPresenceField[];
}
const TITLES: Readonly<Record<string, string>> = {
  sta: 'Primary Wi-Fi',
  sta1: 'Fallback Wi-Fi',
  'access-point': 'Access point and range extender',
  roaming: 'Wi-Fi roaming',
  ble: 'Bluetooth',
  bluetooth: 'Bluetooth services',
  cloud: 'Shelly Cloud',
  mqtt: 'MQTT',
  ws: 'Outbound WebSocket',
  'udp-rpc': 'UDP RPC',
  matter: 'Matter',
  zigbee: 'Zigbee',
  system: 'Identity, time and security',
  'device-logging': 'Device logging',
};

export function componentGroups(
  sensor: ShellyPresenceDevice,
  page: ShellyPresencePage,
): readonly ComponentGroup[] {
  return sensor.components.flatMap((entry) => {
    const parsed = SHELLY_SYSTEM_COMPONENT.safeParse(entry);
    if (!parsed.success) return [];
    const component = parsed.data;
    const fields = SHELLY_PRESENCE_FIELDS.filter(
      (field) =>
        field.component === component.component &&
        field.page === page &&
        sensor.features.some((feature) => feature.id === field.id),
    );
    const focuses = Array.from(new Set(fields.map((field) => field.focus)));
    return focuses.map((focus) => ({
      key: `${component.key}:${focus}`,
      title: TITLES[focus] ?? component.component,
      focus,
      component,
      fields: fields.filter((field) => field.focus === focus),
    }));
  });
}
