import { SHELLY_VIRTUAL_COMPONENT } from './shelly-presence-virtual';
import { SHELLY_BTHOME_COMPONENT } from './shelly-presence-bthome';
import { z } from 'zod';
import { SHELLY_COMPONENT_KEY } from './shelly-presence-primitives';
import {
  SHELLY_BLE_CONFIG,
  SHELLY_BLE_STATUS,
  SHELLY_CLOUD_CONFIG,
  SHELLY_CONNECTIVITY_STATUS,
  SHELLY_MATTER_CONFIG,
  SHELLY_MATTER_STATUS,
  SHELLY_MQTT_CONFIG,
  SHELLY_MQTT_PATCH,
  SHELLY_WIFI_CONFIG,
  SHELLY_WIFI_PATCH,
  SHELLY_WIFI_STATUS,
  SHELLY_WS_CONFIG,
  SHELLY_ZIGBEE_CONFIG,
  SHELLY_ZIGBEE_STATUS,
} from './shelly-presence-network';
import { SHELLY_SYS_CONFIG, SHELLY_SYS_PATCH, SHELLY_SYS_STATUS } from './shelly-presence-system';

export const SHELLY_COMPONENT_PATCH = z.discriminatedUnion('component', [
  z.strictObject({ component: z.literal('wifi'), value: SHELLY_WIFI_PATCH }),
  z.strictObject({ component: z.literal('ble'), value: SHELLY_BLE_CONFIG.strict() }),
  z.strictObject({ component: z.literal('cloud'), value: SHELLY_CLOUD_CONFIG.strict() }),
  z.strictObject({ component: z.literal('mqtt'), value: SHELLY_MQTT_PATCH }),
  z.strictObject({ component: z.literal('ws'), value: SHELLY_WS_CONFIG.strict() }),
  z.strictObject({ component: z.literal('matter'), value: SHELLY_MATTER_CONFIG.strict() }),
  z.strictObject({ component: z.literal('zigbee'), value: SHELLY_ZIGBEE_CONFIG.strict() }),
  z.strictObject({ component: z.literal('sys'), value: SHELLY_SYS_PATCH }),
]);
export const SHELLY_SYSTEM_COMPONENT = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('wifi'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_WIFI_CONFIG,
    status: SHELLY_WIFI_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('ble'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_BLE_CONFIG,
    status: SHELLY_BLE_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('cloud'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_CLOUD_CONFIG,
    status: SHELLY_CONNECTIVITY_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('mqtt'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_MQTT_CONFIG,
    status: SHELLY_CONNECTIVITY_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('ws'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_WS_CONFIG,
    status: SHELLY_CONNECTIVITY_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('matter'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_MATTER_CONFIG,
    status: SHELLY_MATTER_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('zigbee'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_ZIGBEE_CONFIG,
    status: SHELLY_ZIGBEE_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('sys'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_SYS_CONFIG,
    status: SHELLY_SYS_STATUS.nullable(),
  }),
]);
export type ShellySystemComponent = z.output<typeof SHELLY_SYSTEM_COMPONENT>;
export type ShellyComponentPatch = z.output<typeof SHELLY_COMPONENT_PATCH>;

export const SHELLY_COMPONENT = z.union([
  SHELLY_SYSTEM_COMPONENT,
  SHELLY_VIRTUAL_COMPONENT,
  SHELLY_BTHOME_COMPONENT,
]);
export type ShellyComponent = z.output<typeof SHELLY_COMPONENT>;
