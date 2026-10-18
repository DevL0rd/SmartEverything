import {
  SHELLY_SETTING_ROWS,
  type ShellyDevice,
  type ShellyPage,
  type ShellySettingRow,
  type ShellySettingsComponent,
} from '@smarteverything/shelly';
import { recordOf } from './form-model';

export interface SettingInstance {
  readonly key: string;
  readonly title: string;
  readonly id: number | null;
  readonly config: unknown;
  readonly status: unknown;
}

export interface SettingSection {
  readonly group: string;
  readonly title: string;
  readonly rows: readonly ShellySettingRow[];
}

export interface SettingCard {
  readonly key: string;
  readonly title: string;
  readonly component: ShellySettingsComponent;
  readonly instance: SettingInstance;
  readonly sections: readonly SettingSection[];
}

const COMPONENT_TITLES: Readonly<Record<string, string>> = {
  wifi: 'Wi-Fi',
  ble: 'Bluetooth',
  cloud: 'Shelly Cloud',
  mqtt: 'MQTT',
  ws: 'Outbound WebSocket',
  matter: 'Matter',
  zigbee: 'Zigbee',
  sys: 'System',
  bthome: 'Bluetooth Home',
};
const GROUP_TITLES: Readonly<Record<string, string>> = {
  sta: 'Primary Wi-Fi',
  sta1: 'Fallback Wi-Fi',
  ble: 'Bluetooth',
  bluetooth: 'Bluetooth services',
  ws: 'Outbound WebSocket',
  'udp-rpc': 'UDP RPC',
};
const STATUS_SHOWN: ReadonlySet<string> = new Set([
  'wifi',
  'ble',
  'cloud',
  'mqtt',
  'ws',
  'matter',
  'zigbee',
  'bthome',
]);
const OWN_EDITOR_KINDS: ReadonlySet<string> = new Set(['area', 'rgb', 'stored_values']);

function humanized(group: string): string {
  const spaced = group.replaceAll('-', ' ');
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

export function groupTitle(group: string): string {
  return GROUP_TITLES[group] ?? humanized(group);
}

function idOf(key: string): number | null {
  const id = Number(key.split(':')[1]);
  return Number.isInteger(id) ? id : null;
}

function nameOf(config: unknown, fallback: string): string {
  const name = recordOf(config)?.['name'];
  return typeof name === 'string' && name !== '' ? name : fallback;
}

export function instancesOf(
  sensor: ShellyDevice,
  component: ShellySettingsComponent,
): readonly SettingInstance[] {
  if (component === 'presence')
    return sensor.config === null
      ? []
      : [
          {
            key: 'presence',
            title: 'Presence sensor',
            id: null,
            config: sensor.config,
            status: sensor.status,
          },
        ];
  if (component === 'illuminance')
    return sensor.light.map((light) => ({
      key: `illuminance:${String(light.config.id)}`,
      title: nameOf(light.config, 'Light sensor'),
      id: light.config.id,
      config: light.config,
      status: light.status,
    }));
  return sensor.components
    .filter((entry) => entry.component === component)
    .map((entry) => ({
      key: entry.key,
      title: nameOf(entry.config, COMPONENT_TITLES[component] ?? entry.key),
      id: idOf(entry.key),
      config: entry.config,
      status: entry.status,
    }));
}

export function rowsFor(sensor: ShellyDevice, page: ShellyPage): readonly ShellySettingRow[] {
  const available = new Set(
    sensor.features.filter((feature) => feature.available).map((feature) => feature.id),
  );
  return SHELLY_SETTING_ROWS.filter(
    (row) =>
      row.page === page &&
      available.has(row.id) &&
      row.component !== 'presencezone' &&
      !OWN_EDITOR_KINDS.has(row.kind),
  );
}

function sectionsOf(rows: readonly ShellySettingRow[]): readonly SettingSection[] {
  const groups = Array.from(new Set(rows.map((row) => row.group)));
  return groups.map((group) => ({
    group,
    title: groupTitle(group),
    rows: rows.filter((row) => row.group === group),
  }));
}

export function settingCards(
  sensor: ShellyDevice,
  rows: readonly ShellySettingRow[],
  only?: string,
): readonly SettingCard[] {
  const components = Array.from(new Set(rows.map((row) => row.component)));
  return components.flatMap((component) => {
    const sections = sectionsOf(rows.filter((row) => row.component === component));
    return instancesOf(sensor, component)
      .filter((instance) => only === undefined || instance.key === only)
      .map((instance) => ({
        key: instance.key,
        title: instance.title,
        component,
        instance,
        sections,
      }));
  });
}

export function statusShown(card: SettingCard): boolean {
  return STATUS_SHOWN.has(card.component);
}
