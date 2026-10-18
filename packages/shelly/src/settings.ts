import { z } from 'zod';
import { SHELLY_PAGE } from './pages';
import {
  SHELLY_BOOLEAN_SETTINGS,
  SHELLY_BTHOME_DEVICE_SETTINGS,
  SHELLY_BTHOME_SENSOR_SETTINGS,
  SHELLY_BTHOME_SETTINGS,
  SHELLY_BUTTON_SETTINGS,
  SHELLY_ENUM_SETTINGS,
  SHELLY_GROUP_SETTINGS,
  SHELLY_NUMBER_SETTINGS,
  SHELLY_TEXT_SETTINGS,
} from './settings-dynamic';
import {
  SHELLY_LIGHT_SETTINGS,
  SHELLY_PRESENCE_SETTINGS,
  SHELLY_ZONE_SETTINGS,
} from './settings-presence';
import {
  SHELLY_BLE_SETTINGS,
  SHELLY_CLOUD_SETTINGS,
  SHELLY_MATTER_SETTINGS,
  SHELLY_MQTT_SETTINGS,
  SHELLY_SYS_SETTINGS,
  SHELLY_WIFI_SETTINGS,
  SHELLY_WS_SETTINGS,
  SHELLY_ZIGBEE_SETTINGS,
} from './settings-system';
import type { ShellySettingKind } from './settings-meta';

export const SHELLY_SETTINGS = {
  presence: SHELLY_PRESENCE_SETTINGS,
  presencezone: SHELLY_ZONE_SETTINGS,
  illuminance: SHELLY_LIGHT_SETTINGS,
  wifi: SHELLY_WIFI_SETTINGS,
  ble: SHELLY_BLE_SETTINGS,
  cloud: SHELLY_CLOUD_SETTINGS,
  mqtt: SHELLY_MQTT_SETTINGS,
  ws: SHELLY_WS_SETTINGS,
  matter: SHELLY_MATTER_SETTINGS,
  zigbee: SHELLY_ZIGBEE_SETTINGS,
  sys: SHELLY_SYS_SETTINGS,
  boolean: SHELLY_BOOLEAN_SETTINGS,
  number: SHELLY_NUMBER_SETTINGS,
  enum: SHELLY_ENUM_SETTINGS,
  text: SHELLY_TEXT_SETTINGS,
  button: SHELLY_BUTTON_SETTINGS,
  group: SHELLY_GROUP_SETTINGS,
  bthome: SHELLY_BTHOME_SETTINGS,
  bthomedevice: SHELLY_BTHOME_DEVICE_SETTINGS,
  bthomesensor: SHELLY_BTHOME_SENSOR_SETTINGS,
} as const;
export type ShellySettingsComponent = keyof typeof SHELLY_SETTINGS;
export type ShellySettingAction =
  | 'set_presence'
  | 'set_zone'
  | 'set_light'
  | 'set_component'
  | 'virtual_config'
  | 'bthome_set_config'
  | 'bthome_device_config'
  | 'bthome_sensor_config';

const SETTING_ACTIONS: Readonly<Record<ShellySettingsComponent, ShellySettingAction>> = {
  presence: 'set_presence',
  presencezone: 'set_zone',
  illuminance: 'set_light',
  wifi: 'set_component',
  ble: 'set_component',
  cloud: 'set_component',
  mqtt: 'set_component',
  ws: 'set_component',
  matter: 'set_component',
  zigbee: 'set_component',
  sys: 'set_component',
  boolean: 'virtual_config',
  number: 'virtual_config',
  enum: 'virtual_config',
  text: 'virtual_config',
  button: 'virtual_config',
  group: 'virtual_config',
  bthome: 'bthome_set_config',
  bthomedevice: 'bthome_device_config',
  bthomesensor: 'bthome_sensor_config',
};

export interface ShellySettingRow {
  readonly id: string;
  readonly component: ShellySettingsComponent;
  readonly path: readonly string[];
  readonly action: ShellySettingAction;
  readonly title: string;
  readonly page: z.output<typeof SHELLY_PAGE>;
  readonly group: string;
  readonly kind: ShellySettingKind;
  readonly keywords: readonly string[];
  readonly unit?: string | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly secret?: true | undefined;
  readonly nullable?: true | undefined;
  readonly options?: readonly string[] | undefined;
  readonly labels?: Readonly<Record<string, string>> | undefined;
}

const KIND = z.enum([
  'boolean',
  'number',
  'text',
  'enum',
  'strings',
  'string_map',
  'area',
  'rgb',
  'time_window',
  'stored_values',
]);
const META = z.object({
  title: z.string(),
  page: SHELLY_PAGE,
  group: z.string(),
  kind: KIND,
  keywords: z.array(z.string()).optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  secret: z.literal(true).optional(),
  nullable: z.literal(true).optional(),
  options: z.array(z.string()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
});
const NODE = z.looseObject({
  properties: z.record(z.string(), z.unknown()).optional(),
  anyOf: z.array(z.unknown()).optional(),
});
type Node = z.output<typeof NODE>;

function childrenOf(node: Node): Readonly<Record<string, unknown>> {
  if (node.properties !== undefined) return node.properties;
  for (const variant of node.anyOf ?? []) {
    const parsed = NODE.parse(variant);
    if (parsed.properties !== undefined) return parsed.properties;
  }
  return {};
}

function rowOf(
  component: ShellySettingsComponent,
  path: readonly string[],
  meta: z.output<typeof META>,
): ShellySettingRow {
  const { keywords = [], ...rest } = meta;
  return {
    ...rest,
    id: [component, ...path].join('.'),
    component,
    path,
    action: SETTING_ACTIONS[component],
    keywords: [...keywords, component],
  };
}

function walk(
  component: ShellySettingsComponent,
  node: unknown,
  path: readonly string[],
  rows: ShellySettingRow[],
): void {
  const parsed = NODE.parse(node);
  const meta = META.safeParse(parsed);
  if (meta.success) rows.push(rowOf(component, path, meta.data));
  for (const [key, child] of Object.entries(childrenOf(parsed)))
    walk(component, child, [...path, key], rows);
}

function rowsOf(component: ShellySettingsComponent): readonly ShellySettingRow[] {
  const rows: ShellySettingRow[] = [];
  const schema = z.toJSONSchema(SHELLY_SETTINGS[component], {
    io: 'input',
    unrepresentable: 'any',
  });
  walk(component, schema, [], rows);
  return rows;
}

export const SHELLY_SETTING_COMPONENTS = Object.keys(SHELLY_SETTINGS).filter(
  (key): key is ShellySettingsComponent => key in SHELLY_SETTINGS,
);
export const SHELLY_SETTING_ROWS: readonly ShellySettingRow[] =
  SHELLY_SETTING_COMPONENTS.flatMap(rowsOf);
