import { JSON_VALUE } from './values';
import { z } from 'zod';
import { SHELLY_REVISION } from './shelly-presence-primitives';

export const SHELLY_SYS_UI_DATA = z
  .object({
    df: z
      .enum(['YYYY/M/D', 'YYYY-MM-DD', 'YYYY.MM.DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YY/MM/DD'])
      .optional(),
    tf: z.union([z.literal('default'), z.literal(24), z.literal(12)]).optional(),
    dash: z.array(z.string().max(100)).max(100).optional(),
  })
  .catchall(JSON_VALUE);
const ENABLE = z.object({ enable: z.boolean().optional() });
export const SHELLY_SYS_CONFIG = z.object({
  device: z
    .object({
      name: z.string().max(64).nullable().optional(),
      eco_mode: z.boolean().optional(),
      discoverable: z.boolean().optional(),
      enhanced_security: z.boolean().optional(),
      tls_check_cert_validity_time: z.boolean().optional(),
    })
    .optional(),
  location: z
    .object({
      tz: z.string().max(100).nullable().optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lon: z.number().min(-180).max(180).nullable().optional(),
    })
    .optional(),
  sntp: z.object({ server: z.string().max(300).optional() }).optional(),
  rpc_udp: z
    .object({
      dst_addr: z.string().max(300).nullable().optional(),
      listen_port: z.int().min(1).max(65535).nullable().optional(),
    })
    .optional(),
  debug: z
    .object({
      mqtt: ENABLE.optional(),
      websocket: ENABLE.optional(),
      udp: z.object({ addr: z.string().max(300).nullable().optional() }).optional(),
      file_log: ENABLE.optional(),
      level: z.int().optional(),
      file_level: z.int().nullable().optional(),
    })
    .optional(),
  ui_data: SHELLY_SYS_UI_DATA.optional(),
  cfg_rev: SHELLY_REVISION.optional(),
});
export const SHELLY_SYS_PATCH = SHELLY_SYS_CONFIG.omit({ cfg_rev: true }).strict();
export const SHELLY_UPDATE_INFO = z.object({
  version: z.string().max(100),
  build_id: z.string().max(200).optional(),
});
export const SHELLY_AVAILABLE_UPDATES = z.object({
  stable: SHELLY_UPDATE_INFO.optional(),
  beta: SHELLY_UPDATE_INFO.optional(),
  alt: z
    .record(
      z.string().max(80),
      z.object({
        name: z.string().max(100),
        desc: z.string().max(500),
        stable: SHELLY_UPDATE_INFO.optional(),
        beta: SHELLY_UPDATE_INFO.optional(),
      }),
    )
    .optional(),
});
export const SHELLY_SYS_STATUS = z.object({
  restart_required: z.boolean().optional(),
  time: z.string().nullable().optional(),
  unixtime: z.number().nullable().optional(),
  last_sync_ts: z.number().nullable().optional(),
  uptime: z.number().nonnegative().optional(),
  ram_size: z.number().nonnegative().optional(),
  ram_free: z.number().nonnegative().optional(),
  fs_size: z.number().nonnegative().optional(),
  fs_free: z.number().nonnegative().optional(),
  cfg_rev: SHELLY_REVISION.optional(),
  schedule_rev: SHELLY_REVISION.optional(),
  webhook_rev: SHELLY_REVISION.optional(),
  kvs_rev: SHELLY_REVISION.optional(),
  available_updates: SHELLY_AVAILABLE_UPDATES.optional(),
});
