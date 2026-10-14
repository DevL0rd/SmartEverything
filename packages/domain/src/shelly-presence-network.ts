import { z } from 'zod';
import { SHELLY_TLS_CA } from './shelly-presence-primitives';

const ADDRESS = z.string().min(1).max(300).nullable();
const PASSWORD = z.string().max(300).nullable();
export const SHELLY_WIFI_STATION = z.object({
  enable: z.boolean().optional(),
  ssid: z.string().max(32).nullable().optional(),
  is_open: z.boolean().optional(),
  ipv4mode: z.enum(['dhcp', 'static']).optional(),
  ip: z.ipv4().nullable().optional(),
  netmask: z.ipv4().nullable().optional(),
  gw: z.ipv4().nullable().optional(),
  nameserver: z.ipv4().nullable().optional(),
});
export const SHELLY_WIFI_STATION_PATCH = SHELLY_WIFI_STATION.omit({ is_open: true })
  .strict()
  .extend({ pass: PASSWORD.optional() })
  .refine(
    (station) => station.ssid === undefined || station.pass !== undefined,
    'Changing SSID requires an explicit password or null for an open network',
  );
export const SHELLY_WIFI_CONFIG = z.object({
  sta: SHELLY_WIFI_STATION.optional(),
  sta1: SHELLY_WIFI_STATION.optional(),
  ap: z
    .object({
      enable: z.boolean().optional(),
      ssid: z.string().max(29).nullable().optional(),
      is_open: z.boolean().optional(),
      range_extender: z.object({ enable: z.boolean().optional() }).optional(),
    })
    .optional(),
  roam: z
    .object({ rssi_thr: z.number().optional(), interval: z.number().nonnegative().optional() })
    .optional(),
});
export const SHELLY_WIFI_PATCH = SHELLY_WIFI_CONFIG.strict().extend({
  sta: SHELLY_WIFI_STATION_PATCH.optional(),
  sta1: SHELLY_WIFI_STATION_PATCH.optional(),
  ap: SHELLY_WIFI_CONFIG.shape.ap
    .unwrap()
    .omit({ is_open: true })
    .strict()
    .extend({ pass: PASSWORD.optional() })
    .optional(),
});
export const SHELLY_WIFI_STATUS = z.object({
  sta_ip: z.string().nullable().optional(),
  status: z.string().max(50).optional(),
  ssid: z.string().nullable().optional(),
  bssid: z.string().optional(),
  channel: z.int().optional(),
  rssi: z.number().optional(),
  ap_client_count: z.int().nonnegative().optional(),
});
export const SHELLY_BLE_CONFIG = z.object({
  enable: z.boolean().optional(),
  rpc: z
    .object({ enable: z.boolean().optional(), keep_running: z.boolean().optional() })
    .optional(),
  observer: z.object({ enable: z.boolean().optional() }).optional(),
});
export const SHELLY_CLOUD_CONFIG = z.object({
  enable: z.boolean().optional(),
  server: ADDRESS.optional(),
});
export const SHELLY_MQTT_CONFIG = z.object({
  enable: z.boolean().optional(),
  server: ADDRESS.optional(),
  client_id: z.string().max(300).nullable().optional(),
  user: z.string().max(300).nullable().optional(),
  ssl_ca: SHELLY_TLS_CA.optional(),
  topic_prefix: z
    .string()
    .max(300)
    .regex(/^(?!\$)[^#+%?]*$/)
    .nullable()
    .optional(),
  rpc_ntf: z.boolean().optional(),
  status_ntf: z.boolean().optional(),
  use_client_cert: z.boolean().optional(),
  enable_control: z.boolean().optional(),
  enable_rpc: z.boolean().optional(),
});
export const SHELLY_MQTT_PATCH = SHELLY_MQTT_CONFIG.strict().extend({ pass: PASSWORD.optional() });
export const SHELLY_WS_CONFIG = z.object({
  enable: z.boolean().optional(),
  server: ADDRESS.optional(),
  ssl_ca: SHELLY_TLS_CA.optional(),
});
export const SHELLY_MATTER_CONFIG = z.object({
  enable: z.boolean().optional(),
  presence: z.object({ zones: z.int().min(1).max(10).optional() }).optional(),
});
export const SHELLY_ZIGBEE_CONFIG = z.object({ enable: z.boolean().optional() });
export const SHELLY_CONNECTIVITY_STATUS = z.object({ connected: z.boolean().optional() });
export const SHELLY_MATTER_STATUS = z.object({
  num_fabrics: z.int().nonnegative().optional(),
  commissionable: z.boolean().optional(),
});
export const SHELLY_ZIGBEE_STATUS = z.object({ network_state: z.string().max(100).optional() });
export const SHELLY_BLE_STATUS = z.object({
  pairing: z.boolean().optional(),
  paired_devices: z.int().nonnegative().optional(),
});
