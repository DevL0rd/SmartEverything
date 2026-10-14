import { z } from 'zod';
import { SHELLY_TLS_CA } from './shelly-presence-primitives';

const MAC = z.string().regex(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/);
export const SHELLY_MANAGEMENT_ACTIONS = [
  z.strictObject({ action: z.literal('wifi_scan') }),
  z.strictObject({ action: z.literal('wifi_clients') }),
  z.strictObject({ action: z.literal('ble_clients') }),
  z.strictObject({
    action: z.literal('ble_pair'),
    timeout: z.number().positive().max(3600).optional(),
  }),
  z.strictObject({ action: z.literal('ble_stop_pairing') }),
  z.strictObject({ action: z.literal('ble_delete_client'), addr: MAC }),
  z.strictObject({ action: z.literal('ble_advertise') }),
  z.strictObject({ action: z.literal('cloud_relay_list') }),
  z.strictObject({ action: z.literal('cloud_relay_infos') }),
  z.strictObject({
    action: z.literal('ble_associate'),
    target: z.int().nonnegative(),
    duration: z.number().positive().max(300).optional(),
    rssi_thr: z.number().optional(),
  }),
  z.strictObject({
    action: z.literal('ble_associate_trv'),
    blutrv_id: z.int().nonnegative().optional(),
    duration: z.number().positive().max(300).optional(),
    rssi_thr: z.number().optional(),
  }),
  z.strictObject({ action: z.literal('matter_setup') }),
  z.strictObject({ action: z.literal('matter_reset') }),
  z.strictObject({ action: z.literal('zigbee_join') }),
  z.strictObject({
    action: z.literal('device_reboot'),
    delay_ms: z.int().nonnegative().max(60000).optional(),
  }),
  z.strictObject({ action: z.literal('device_reset'), target: z.enum(['wifi', 'factory']) }),
  z.strictObject({
    action: z.literal('device_password'),
    password: z.string().min(1).max(300).nullable(),
  }),
  z.strictObject({ action: z.literal('firmware_check') }),
  z.strictObject({
    action: z.literal('firmware_update'),
    update: z.union([
      z.strictObject({ stage: z.enum(['stable', 'beta']) }),
      z.strictObject({ url: z.url({ protocol: /^https?$/ }).max(2000) }),
    ]),
  }),
  z.strictObject({ action: z.literal('device_profiles') }),
  z.strictObject({ action: z.literal('device_set_profile'), name: z.string().min(1).max(80) }),
  z.strictObject({
    action: z.literal('device_timezones'),
    offset: z.int().nonnegative().optional(),
  }),
  z.strictObject({ action: z.literal('device_detect_location') }),
  z.strictObject({ action: z.literal('device_set_time'), unixtime: z.number().nonnegative() }),
  z.strictObject({
    action: z.literal('certificate_put'),
    target: z.enum([
      'user_ca',
      'tls_client_cert',
      'tls_client_key',
      'http_server_cert',
      'http_server_key',
      'http_server_ca',
    ]),
    data: z.string().max(65536).nullable(),
    append: z.boolean().optional(),
  }),
  z.strictObject({
    action: z.literal('device_logs'),
    lines: z.int().min(1).max(1000).default(100),
  }),
  z.strictObject({
    action: z.literal('http_request'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']),
    url: z.url({ protocol: /^https?$/ }).max(2000),
    body: z.string().max(65536).optional(),
    headers: z.record(z.string().max(100), z.string().max(1000)).optional(),
    timeout: z.number().positive().max(60).optional(),
    ssl_ca: SHELLY_TLS_CA.optional(),
  }),
] as const;
