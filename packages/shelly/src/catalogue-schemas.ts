import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import { SHELLY_COMPONENT_ID, SHELLY_COMPONENT_KEY } from './primitives';
import { SHELLY_TIME_WINDOW } from './primitives';
import {
  SHELLY_BOOLEAN_SETTINGS,
  SHELLY_BTHOME_DEVICE_SETTINGS,
  SHELLY_BTHOME_SENSOR_SETTINGS,
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

export const ID = SHELLY_COMPONENT_ID.meta({ title: 'Component ID' });
export const DURATION = z.number().positive().meta({ title: 'Duration (seconds)' });
export const SIGNAL = z.number().meta({ title: 'Minimum signal (dBm)' });
export const OFFSET = z.int().nonnegative().meta({ title: 'Page offset' });
export const KEY_PATTERN = z.string().meta({ title: 'Key pattern' });
export const VIRTUAL_ID = z.int().min(200).max(299);
export const MAC = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)
  .meta({ title: 'Bluetooth address' });
export const STAGE = z.enum(['stable', 'beta']).meta({ title: 'Release channel' });
export const SCRIPT_FILE = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]+\.js$/)
  .refine((name) => !name.startsWith('/') && !name.split('/').includes('..'));

export const PRESENCE_PATCH = SHELLY_PRESENCE_SETTINGS.omit({ main_zone: true });
export const ZONE_PATCH = SHELLY_ZONE_SETTINGS.omit({
  id: true,
  presence_thr: true,
  absence_thr: true,
});
export const ZONE_CREATE = ZONE_PATCH.required({ name: true, enable: true, area: true });
export const LIGHT_PATCH = SHELLY_LIGHT_SETTINGS.omit({ id: true });

export const COMPONENT_PATCH = z.discriminatedUnion('component', [
  z.strictObject({ component: z.literal('wifi'), value: SHELLY_WIFI_SETTINGS }),
  z.strictObject({ component: z.literal('ble'), value: SHELLY_BLE_SETTINGS }),
  z.strictObject({ component: z.literal('cloud'), value: SHELLY_CLOUD_SETTINGS }),
  z.strictObject({ component: z.literal('mqtt'), value: SHELLY_MQTT_SETTINGS }),
  z.strictObject({ component: z.literal('ws'), value: SHELLY_WS_SETTINGS }),
  z.strictObject({ component: z.literal('matter'), value: SHELLY_MATTER_SETTINGS }),
  z.strictObject({ component: z.literal('zigbee'), value: SHELLY_ZIGBEE_SETTINGS }),
  z.strictObject({ component: z.literal('sys'), value: SHELLY_SYS_SETTINGS }),
]);
export const COMPONENT_METHODS = {
  wifi: 'WiFi.SetConfig',
  ble: 'BLE.SetConfig',
  cloud: 'Cloud.SetConfig',
  mqtt: 'MQTT.SetConfig',
  ws: 'Ws.SetConfig',
  matter: 'Matter.SetConfig',
  zigbee: 'Zigbee.SetConfig',
  sys: 'Sys.SetConfig',
};

export const VIRTUAL_CONFIG = z.discriminatedUnion('component', [
  z.strictObject({ component: z.literal('boolean'), value: SHELLY_BOOLEAN_SETTINGS }),
  z.strictObject({ component: z.literal('number'), value: SHELLY_NUMBER_SETTINGS }),
  z.strictObject({ component: z.literal('enum'), value: SHELLY_ENUM_SETTINGS }),
  z.strictObject({ component: z.literal('text'), value: SHELLY_TEXT_SETTINGS }),
  z.strictObject({ component: z.literal('button'), value: SHELLY_BUTTON_SETTINGS }),
  z.strictObject({ component: z.literal('group'), value: SHELLY_GROUP_SETTINGS }),
]);
export const VIRTUAL_CONFIG_METHODS = {
  boolean: 'Boolean.SetConfig',
  number: 'Number.SetConfig',
  enum: 'Enum.SetConfig',
  text: 'Text.SetConfig',
  button: 'Button.SetConfig',
  group: 'Group.SetConfig',
};
export const VIRTUAL_VALUE = z.discriminatedUnion('component', [
  z.strictObject({ component: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ component: z.literal('number'), value: z.number() }),
  z.strictObject({ component: z.literal('enum'), value: z.string().nullable() }),
  z.strictObject({ component: z.literal('text'), value: z.string() }),
  z.strictObject({ component: z.literal('group'), value: z.array(SHELLY_COMPONENT_KEY) }),
]);
export const VIRTUAL_SET_METHODS = {
  boolean: 'Boolean.Set',
  number: 'Number.Set',
  enum: 'Enum.Set',
  text: 'Text.Set',
  group: 'Group.Set',
};

export const BTHOME_DEVICE_PATCH = SHELLY_BTHOME_DEVICE_SETTINGS;
export const BTHOME_DEVICE_ADD = BTHOME_DEVICE_PATCH.required({ addr: true });
export const BTHOME_SENSOR_PATCH = SHELLY_BTHOME_SENSOR_SETTINGS;
export const BTHOME_SENSOR_ADD = BTHOME_SENSOR_PATCH.required({
  addr: true,
  obj_id: true,
  idx: true,
});

export const SCHEDULE_INPUT = z.strictObject({
  enable: z.boolean().optional(),
  timespec: z.string().min(1),
  calls: z
    .array(
      z.strictObject({
        method: z.string().min(1),
        params: JSON_VALUE.meta({ secret: true }).optional(),
      }),
    )
    .min(1),
});
export const WEBHOOK_INPUT = z.strictObject({
  event: z.string().min(1),
  cid: ID,
  enable: z.boolean().optional(),
  name: z.string().nullable().optional(),
  ssl_ca: z.enum(['ca.pem', 'user_ca.pem', '*']).nullable().optional(),
  urls: z
    .array(z.url({ protocol: /^https?$/ }))
    .min(1)
    .meta({ secret: true }),
  active_between: SHELLY_TIME_WINDOW.nullable().optional(),
  condition: z.string().nullable().optional(),
  repeat_period: z.number().optional(),
});
