import {
  SHELLY_OPERATION_RESULT,
  type ShellyOperationResult,
  type ShellyPresenceAction,
} from '@smarteverything/domain';

const RESULT_KINDS: ReadonlySet<string> = new Set([
  'bthome_objects',
  'bthome_known_objects',
  'script_library',
  'script_example',
  'firmware_upload_write',
  'firmware_alternatives',
  'kvs_get',
  'kvs_list',
  'kvs_many',
  'wifi_scan',
  'wifi_clients',
  'ble_clients',
  'cloud_relay_list',
  'cloud_relay_infos',
  'matter_setup',
  'schedule_eval',
  'script_code',
  'script_eval',
  'device_timezones',
  'device_detect_location',
  'device_profiles',
  'firmware_check',
  'http_request',
  'device_logs',
  'device_log_files',
  'device_log_file',
]);
export function shellyOperationResult(
  action: ShellyPresenceAction,
  value: unknown,
): ShellyOperationResult {
  const kind = RESULT_KINDS.has(action.action) ? action.action : 'changed';
  return SHELLY_OPERATION_RESULT.parse({ kind, value: value === null ? {} : value });
}
