import type { ShellyPresenceAction } from '@smarteverything/domain';

export interface ActionParameter {
  readonly path: string;
  readonly title: string;
  readonly kind:
    'text' | 'password' | 'number' | 'code' | 'url' | 'headers' | 'numbers' | 'boolean';
  readonly options?: readonly string[];
  readonly nullable?: boolean;
}
export interface ActionForm {
  readonly action: ShellyPresenceAction['action'];
  readonly fields: readonly ActionParameter[];
}
const ID: ActionParameter = { path: 'id', title: 'Component ID', kind: 'number' };
const ADDRESS: ActionParameter = { path: 'addr', title: 'Bluetooth address', kind: 'text' };
const DURATION: ActionParameter = { path: 'duration', title: 'Duration (seconds)', kind: 'number' };
export const ACTION_FORMS: readonly ActionForm[] = [
  { action: 'kvs_get', fields: [{ path: 'key', title: 'Stored key', kind: 'text' }] },
  {
    action: 'kvs_list',
    fields: [
      { path: 'match', title: 'Key pattern', kind: 'text' },
      { path: 'offset', title: 'Page offset', kind: 'number' },
    ],
  },
  {
    action: 'kvs_many',
    fields: [
      { path: 'match', title: 'Key pattern', kind: 'text' },
      { path: 'offset', title: 'Page offset', kind: 'number' },
    ],
  },
  { action: 'sensor_restart', fields: [] },
  { action: 'wifi_scan', fields: [] },
  { action: 'wifi_clients', fields: [] },
  { action: 'ble_clients', fields: [] },
  {
    action: 'ble_pair',
    fields: [{ path: 'timeout', title: 'Pairing timeout (seconds)', kind: 'number' }],
  },
  { action: 'ble_stop_pairing', fields: [] },
  { action: 'ble_delete_client', fields: [ADDRESS] },
  { action: 'ble_advertise', fields: [] },
  { action: 'cloud_relay_list', fields: [] },
  { action: 'cloud_relay_infos', fields: [] },
  {
    action: 'ble_associate',
    fields: [
      { path: 'target', title: 'Target component ID', kind: 'number' },
      DURATION,
      { path: 'rssi_thr', title: 'Minimum signal (dBm)', kind: 'number' },
    ],
  },
  {
    action: 'ble_associate_trv',
    fields: [
      { path: 'blutrv_id', title: 'Radiator valve ID', kind: 'number' },
      DURATION,
      { path: 'rssi_thr', title: 'Minimum signal (dBm)', kind: 'number' },
    ],
  },
  { action: 'matter_setup', fields: [] },
  { action: 'matter_reset', fields: [] },
  { action: 'zigbee_join', fields: [] },
  {
    action: 'device_reboot',
    fields: [{ path: 'delay_ms', title: 'Restart delay (milliseconds)', kind: 'number' }],
  },
  {
    action: 'device_reset',
    fields: [{ path: 'target', title: 'Reset', kind: 'text', options: ['wifi', 'factory'] }],
  },
  {
    action: 'device_password',
    fields: [
      { path: 'password', title: 'Local access password', kind: 'password', nullable: true },
    ],
  },
  { action: 'firmware_check', fields: [] },
  { action: 'firmware_alternatives', fields: [] },
  {
    action: 'firmware_switch',
    fields: [{ path: 'name', title: 'Installed application', kind: 'text' }],
  },
  {
    action: 'firmware_install_alternative',
    fields: [
      { path: 'app', title: 'Alternative application', kind: 'text' },
      { path: 'stage', title: 'Release channel', kind: 'text', options: ['stable', 'beta'] },
    ],
  },
  {
    action: 'firmware_update',
    fields: [
      { path: 'update.stage', title: 'Release channel', kind: 'text', options: ['stable', 'beta'] },
      { path: 'update.url', title: 'Custom firmware URL', kind: 'url' },
    ],
  },
  { action: 'device_profiles', fields: [] },
  {
    action: 'device_set_profile',
    fields: [{ path: 'name', title: 'Operating mode', kind: 'text' }],
  },
  {
    action: 'device_timezones',
    fields: [{ path: 'offset', title: 'Page offset', kind: 'number' }],
  },
  { action: 'device_detect_location', fields: [] },
  {
    action: 'device_set_time',
    fields: [{ path: 'unixtime', title: 'Unix timestamp (seconds)', kind: 'number' }],
  },
  {
    action: 'certificate_put',
    fields: [
      {
        path: 'target',
        title: 'Certificate destination',
        kind: 'text',
        options: [
          'user_ca',
          'tls_client_cert',
          'tls_client_key',
          'http_server_cert',
          'http_server_key',
          'http_server_ca',
        ],
      },
      { path: 'data', title: 'PEM content', kind: 'code', nullable: true },
      { path: 'append', title: 'Append to certificate bundle', kind: 'boolean' },
    ],
  },
  { action: 'device_log_files', fields: [] },
  {
    action: 'device_log_file',
    fields: [{ path: 'path', title: 'Advertised saved log path', kind: 'text' }],
  },
  { action: 'device_logs', fields: [{ path: 'lines', title: 'Lines to read', kind: 'number' }] },
  {
    action: 'http_request',
    fields: [
      {
        path: 'method',
        title: 'HTTP method',
        kind: 'text',
        options: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'],
      },
      { path: 'url', title: 'Request URL', kind: 'url' },
      { path: 'body', title: 'Request body', kind: 'code' },
      { path: 'headers', title: 'Headers', kind: 'headers' },
      { path: 'timeout', title: 'Timeout (seconds)', kind: 'number' },
      {
        path: 'ssl_ca',
        title: 'TLS certificate verification',
        kind: 'text',
        options: ['ca.pem', 'user_ca.pem', '*'],
      },
    ],
  },
  {
    action: 'bthome_objects',
    fields: [
      { path: 'obj_ids', title: 'Bluetooth object IDs', kind: 'numbers' },
      { path: 'offset', title: 'Page offset', kind: 'number' },
    ],
  },
  { action: 'bthome_discover', fields: [DURATION] },
  { action: 'bthome_delete_device', fields: [ID] },
  { action: 'bthome_delete_sensor', fields: [ID] },
  { action: 'bthome_known_objects', fields: [ID] },
  { action: 'bthome_reset_counter', fields: [] },
];
