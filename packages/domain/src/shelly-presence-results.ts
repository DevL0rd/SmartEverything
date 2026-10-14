import { SHELLY_SCRIPT_LIBRARY } from './shelly-presence-advanced-actions';
import { SHELLY_BTHOME_OBJECT_INFOS, SHELLY_BTHOME_KNOWN_OBJECTS } from './shelly-presence-bthome';
import { z } from 'zod';
import { SHELLY_AVAILABLE_UPDATES } from './shelly-presence-system';
import {
  SHELLY_SCRIPT_STATUS,
  SHELLY_KVS_PAGE,
  SHELLY_STORED_VALUE,
} from './shelly-presence-resources';

export const SHELLY_WIFI_SCAN_RESULT = z.object({
  results: z
    .array(
      z.object({
        ssid: z.string().nullable(),
        bssid: z.string(),
        auth: z.int(),
        channel: z.int(),
        rssi: z.number(),
      }),
    )
    .max(256),
});
export const SHELLY_WIFI_CLIENTS_RESULT = z.object({
  ts: z.number().nullable().optional(),
  ap_clients: z
    .array(
      z.object({
        mac: z.string(),
        ip: z.string(),
        ip_static: z.boolean(),
        mport: z.int(),
        since: z.number(),
      }),
    )
    .max(256),
});
export const SHELLY_BLE_CLIENTS_RESULT = z
  .array(z.object({ addr: z.string(), ctime: z.number(), atime: z.number() }))
  .max(20);
export const SHELLY_MATTER_SETUP_RESULT = z.object({
  qr_code: z.string().max(200),
  manual_code: z.string().max(100),
});
export const SHELLY_SCHEDULE_EVAL_RESULT = z.object({
  now: z.number(),
  next: z.number().optional(),
  prev: z.number().optional(),
});
export const SHELLY_TIMEZONES_RESULT = z.object({
  timezones: z.array(z.string().max(100)).max(1024),
  offset: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
export const SHELLY_LOCATION_RESULT = z.object({
  tz: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});
export const SHELLY_HTTP_RESULT = z.object({
  code: z.int(),
  message: z.string().max(1000),
  headers: z.record(z.string().max(100), z.string().max(2000)),
  body: z.string().max(65536).optional(),
  body_b64: z.string().max(32768).optional(),
});
export const SHELLY_PROFILES_RESULT = z.object({
  profiles: z.record(
    z.string().max(100),
    z.object({
      components: z
        .array(z.object({ type: z.string().max(100), count: z.int().nonnegative() }))
        .max(512),
    }),
  ),
});
export const SHELLY_OPERATION_RESULT = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('device_log_files'),
    value: z.object({
      files: z.array(z.object({ name: z.string().max(300), path: z.string().max(300) })).max(64),
    }),
  }),
  z.object({
    kind: z.literal('device_log_file'),
    value: z.object({ name: z.string().max(300), text: z.string().max(262144) }),
  }),
  z.object({
    kind: z.literal('kvs_get'),
    value: z.object({ etag: z.string().max(100), value: SHELLY_STORED_VALUE }),
  }),
  z.object({
    kind: z.literal('kvs_list'),
    value: z.object({
      keys: z.record(z.string().max(42), z.object({ etag: z.string().max(100) })),
      rev: z.int().nonnegative().optional(),
    }),
  }),
  z.object({ kind: z.literal('kvs_many'), value: SHELLY_KVS_PAGE }),
  z.object({
    kind: z.literal('script_library'),
    value: z.object({ examples: SHELLY_SCRIPT_LIBRARY }),
  }),
  z.object({
    kind: z.literal('script_example'),
    value: z.object({ fname: z.string().max(300), code: z.string().max(65536) }),
  }),
  z.object({
    kind: z.literal('firmware_upload_write'),
    value: z.object({ offset: z.int().nonnegative() }),
  }),
  z.object({
    kind: z.literal('firmware_alternatives'),
    value: z.record(z.string().min(1).max(80), z.string().max(200)),
  }),
  z.object({ kind: z.literal('bthome_objects'), value: SHELLY_BTHOME_OBJECT_INFOS }),
  z.object({ kind: z.literal('bthome_known_objects'), value: SHELLY_BTHOME_KNOWN_OBJECTS }),
  z.object({ kind: z.literal('wifi_scan'), value: SHELLY_WIFI_SCAN_RESULT }),
  z.object({ kind: z.literal('wifi_clients'), value: SHELLY_WIFI_CLIENTS_RESULT }),
  z.object({ kind: z.literal('ble_clients'), value: SHELLY_BLE_CLIENTS_RESULT }),
  z.object({
    kind: z.literal('cloud_relay_list'),
    value: z.object({ rev: z.int().nonnegative(), addrs: z.array(z.string().max(17)).max(256) }),
  }),
  z.object({
    kind: z.literal('cloud_relay_infos'),
    value: z.object({
      ts: z.number(),
      offset: z.int().nonnegative(),
      count: z.int().nonnegative(),
      total: z.int().nonnegative(),
      devices: z
        .array(
          z.record(
            z.string().max(17),
            z.object({
              name: z.string().max(100).nullable(),
              model: z.int(),
              sdata: z.record(z.string().max(100), z.string().max(4096)),
              mdata: z.record(z.string().max(100), z.string().max(4096)),
              last_seen: z.number(),
            }),
          ),
        )
        .max(256),
    }),
  }),
  z.object({ kind: z.literal('matter_setup'), value: SHELLY_MATTER_SETUP_RESULT }),
  z.object({ kind: z.literal('schedule_eval'), value: SHELLY_SCHEDULE_EVAL_RESULT }),
  z.object({
    kind: z.literal('script_code'),
    value: z.object({ code: z.string().max(65536), status: SHELLY_SCRIPT_STATUS.optional() }),
  }),
  z.object({ kind: z.literal('script_eval'), value: z.object({ result: z.string().max(65536) }) }),
  z.object({ kind: z.literal('device_timezones'), value: SHELLY_TIMEZONES_RESULT }),
  z.object({ kind: z.literal('device_detect_location'), value: SHELLY_LOCATION_RESULT }),
  z.object({ kind: z.literal('device_profiles'), value: SHELLY_PROFILES_RESULT }),
  z.object({ kind: z.literal('firmware_check'), value: SHELLY_AVAILABLE_UPDATES }),
  z.object({ kind: z.literal('http_request'), value: SHELLY_HTTP_RESULT }),
  z.object({ kind: z.literal('device_logs'), value: z.object({ text: z.string().max(262144) }) }),
  z.object({
    kind: z.literal('changed'),
    value: z.object({
      id: z.int().nonnegative().optional(),
      key: z.string().max(100).optional(),
      rev: z.int().nonnegative().optional(),
      etag: z.string().max(100).optional(),
      len: z.int().nonnegative().optional(),
      restart_required: z.boolean().optional(),
      was_running: z.boolean().optional(),
    }),
  }),
]);
export type ShellyOperationResult = z.output<typeof SHELLY_OPERATION_RESULT>;
