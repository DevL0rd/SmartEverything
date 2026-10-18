import { z } from 'zod';
import { SHELLY_CERTIFICATE_TARGETS } from './constants';
import {
  COMPONENT_METHODS,
  COMPONENT_PATCH,
  DURATION,
  ID,
  LIGHT_PATCH,
  MAC,
  OFFSET,
  PRESENCE_PATCH,
  SIGNAL,
  STAGE,
  ZONE_CREATE,
  ZONE_PATCH,
} from './catalogue-schemas';
import { dispatching, keyworded, operation, member } from './operation';

export const SHELLY_DEVICE_OPERATIONS = {
  set_presence: member(
    keyworded(
      operation('Presence.SetConfig', 'Save detection settings', ['presence-detection', 'save'], {
        config: PRESENCE_PATCH,
      }),
      ['radar', 'configuration'],
    ),
  ),
  set_zone: member(
    keyworded(
      operation('PresenceZone.SetConfig', 'Save zone', ['presence-room', 'selected-zone'], {
        id: ID,
        config: ZONE_PATCH,
      }),
      ['area', 'delay'],
    ),
  ),
  add_zone: member(
    keyworded(
      operation('Presence.AddZone', 'Add zone', ['presence-room', 'add-zone'], {
        config: ZONE_CREATE,
      }),
      ['create', 'new', 'map'],
    ),
  ),
  delete_zone: keyworded(
    operation('Presence.DeleteZone', 'Delete zone', ['presence-room', 'delete-zone'], {
      id: ID,
    }),
    ['remove', 'map'],
  ),
  set_light: member(
    keyworded(
      operation(
        'Illuminance.SetConfig',
        'Save light thresholds',
        ['presence-light', 'thresholds'],
        {
          id: ID,
          config: LIGHT_PATCH,
        },
      ),
      ['lux', 'dark', 'bright'],
    ),
  ),
  set_detection: member(
    keyworded(
      operation(
        'Presence.SetSensor',
        'Pause or resume detection',
        ['presence-detection', 'enabled'],
        { enable: z.boolean() },
      ),
      ['radar', 'off', 'on'],
    ),
  ),
  calibrate: member(
    keyworded(
      operation(
        'Presence.TiltCalibrate',
        'Calibrate sensor tilt',
        ['presence-detection', 'tilt-calibration'],
        {},
      ),
      ['mount', 'angle'],
    ),
  ),
  live_track: member(
    keyworded(operation('Presence.LiveTrack', 'Live view', ['presence-room', 'live-view'], {}), [
      'map',
      'objects',
      'tracking',
    ]),
  ),
  refresh: member(
    keyworded(
      operation('Shelly.GetStatus', 'Refresh device', ['presence-diagnostics', 'refresh'], {}),
      ['status', 'reload'],
    ),
  ),
  reconnect: member(
    keyworded(
      operation(
        'Shelly.GetDeviceInfo',
        'Reconnect device',
        ['presence-diagnostics', 'connection'],
        {},
      ),
      ['offline', 'retry'],
    ),
  ),
  sensor_restart: operation(
    'Presence.Restart',
    'Restart presence detection',
    ['presence-diagnostics', 'sensor-restart'],
    {},
  ),
  set_component: dispatching(
    operation('Sys.SetConfig', 'Save component settings', ['presence-connectivity', 'settings'], {
      config: COMPONENT_PATCH,
    }),
    'config',
    COMPONENT_METHODS,
  ),
  wifi_scan: member(
    operation('WiFi.Scan', 'Scan nearby Wi-Fi networks', ['presence-network', 'scan'], {}),
  ),
  wifi_clients: member(
    operation('WiFi.ListAPClients', 'Access point clients', ['presence-network', 'clients'], {}),
  ),
  ble_clients: member(
    operation(
      'BLE.ListPairedDevices',
      'Paired Bluetooth clients',
      ['presence-network', 'paired-clients'],
      {},
    ),
  ),
  ble_pair: operation('BLE.StartPairing', 'Start Bluetooth pairing', ['presence-network', 'pair'], {
    timeout: z.number().positive().meta({ title: 'Pairing timeout (seconds)' }).optional(),
  }),
  ble_stop_pairing: operation(
    'BLE.StopPairing',
    'Stop Bluetooth pairing',
    ['presence-network', 'pair'],
    {},
  ),
  ble_delete_client: operation(
    'BLE.DeletePairedDevice',
    'Remove Bluetooth client',
    ['presence-network', 'paired-clients'],
    { addr: MAC },
  ),
  ble_advertise: operation(
    'BLE.AdvertiseOnce',
    'Advertise Bluetooth once',
    ['presence-network', 'bluetooth'],
    {},
  ),
  cloud_relay_list: member(
    operation(
      'BLE.CloudRelay.List',
      'Bluetooth cloud relay devices',
      ['presence-network', 'ble-advanced'],
      {},
    ),
  ),
  cloud_relay_infos: member(
    operation(
      'BLE.CloudRelay.ListInfos',
      'Bluetooth cloud relay information',
      ['presence-network', 'ble-advanced'],
      {},
    ),
  ),
  ble_associate: operation(
    'BLE.StartAssociations',
    'Associate Bluetooth device',
    ['presence-network', 'ble-advanced'],
    {
      target: ID.meta({ title: 'Target component ID' }),
      duration: DURATION.optional(),
      rssi_thr: SIGNAL.optional(),
    },
  ),
  ble_associate_trv: operation(
    'BLE.StartBluTrvAssociations',
    'Associate Bluetooth radiator valve',
    ['presence-network', 'ble-advanced'],
    {
      blutrv_id: ID.meta({ title: 'Radiator valve ID' }).optional(),
      duration: DURATION.optional(),
      rssi_thr: SIGNAL.optional(),
    },
  ),
  matter_setup: operation(
    'Matter.GetSetupCode',
    'Matter setup code',
    ['presence-connectivity', 'matter-setup'],
    {},
  ),
  matter_reset: operation(
    'Matter.FactoryReset',
    'Reset Matter fabrics',
    ['presence-connectivity', 'matter-reset'],
    {},
  ),
  zigbee_join: operation(
    'Zigbee.StartNetworkSteering',
    'Join Zigbee network',
    ['presence-connectivity', 'zigbee'],
    {},
  ),
  device_reboot: operation('Shelly.Reboot', 'Restart sensor', ['presence-device', 'restart'], {
    delay_ms: z.int().nonnegative().meta({ title: 'Restart delay (milliseconds)' }).optional(),
  }),
  device_reset: operation('Shelly.FactoryReset', 'Reset sensor', ['presence-device', 'reset'], {
    target: z.enum(['wifi', 'factory']).meta({ title: 'Reset' }),
  }),
  device_password: operation(
    'Shelly.SetAuth',
    'Change local access password',
    ['presence-device', 'access-password'],
    {
      password: z.string().min(1).nullable().meta({ title: 'Local access password', secret: true }),
    },
  ),
  firmware_check: member(
    operation(
      'Shelly.CheckForUpdate',
      'Check firmware updates',
      ['presence-device', 'firmware'],
      {},
    ),
  ),
  firmware_update: operation('Shelly.Update', 'Update firmware', ['presence-device', 'firmware'], {
    update: z.union([
      z.strictObject({ stage: STAGE }),
      z.strictObject({
        url: z.url({ protocol: /^https?$/ }).meta({ title: 'Custom firmware URL' }),
      }),
    ]),
  }),
  device_profiles: member(
    operation(
      'Shelly.ListProfiles',
      'Read operating modes',
      ['presence-device', 'operating-mode'],
      {},
    ),
  ),
  device_set_profile: operation(
    'Shelly.SetProfile',
    'Change operating mode',
    ['presence-device', 'operating-mode'],
    { name: z.string().min(1).meta({ title: 'Operating mode' }) },
  ),
  device_timezones: member(
    operation('Shelly.ListTimezones', 'Read time zones', ['presence-device', 'location-time'], {
      offset: OFFSET.optional(),
    }),
  ),
  device_detect_location: member(
    operation('Shelly.DetectLocation', 'Detect location', ['presence-device', 'location-time'], {}),
  ),
  device_set_time: operation('Sys.SetTime', 'Set sensor clock', ['presence-device', 'clock'], {
    unixtime: z.number().nonnegative().meta({ title: 'Unix timestamp (seconds)' }),
  }),
  certificate_put: operation(
    'Shelly.PutUserCA',
    'Upload or remove TLS certificate',
    ['presence-device', 'tls-certificates'],
    {
      target: z.enum(SHELLY_CERTIFICATE_TARGETS).meta({ title: 'Certificate destination' }),
      data: z.string().nullable().meta({ title: 'PEM content', secret: true }),
      append: z.boolean().meta({ title: 'Append to certificate bundle' }).optional(),
    },
  ),
  device_logs: operation(
    'Sys.GetStatus',
    'Read sensor logs',
    ['presence-diagnostics', 'download'],
    { lines: z.int().positive().meta({ title: 'Lines to read' }).optional() },
  ),
  device_log_files: keyworded(
    operation('Sys.GetStatus', 'Read saved log files', ['presence-diagnostics', 'download'], {}),
    ['saved', 'previous', 'logs'],
  ),
  device_log_file: keyworded(
    operation(
      'Sys.GetStatus',
      'Read selected saved log file',
      ['presence-diagnostics', 'download'],
      { path: z.string().startsWith('/debug/').meta({ title: 'Advertised saved log path' }) },
    ),
    ['saved', 'previous', 'log file'],
  ),
  http_request: operation(
    'HTTP.Request',
    'Send connectivity request',
    ['presence-diagnostics', 'connectivity-request'],
    {
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'])
        .meta({ title: 'HTTP method' }),
      url: z.url({ protocol: /^https?$/ }).meta({ title: 'Request URL' }),
      body: z.string().meta({ title: 'Request body', secret: true }).optional(),
      headers: z.record(z.string(), z.string()).meta({ title: 'Headers', secret: true }).optional(),
      timeout: z.number().positive().meta({ title: 'Timeout (seconds)' }).optional(),
      ssl_ca: z.string().nullable().meta({ title: 'TLS certificate verification' }).optional(),
    },
  ),
  firmware_alternatives: member(
    keyworded(
      operation(
        'Shelly.ListAlternatives',
        'Read alternate firmware slots',
        ['presence-device', 'firmware'],
        {},
      ),
      ['matter', 'zigbee', 'firmware'],
    ),
  ),
  firmware_switch: keyworded(
    operation(
      'Shelly.SetAlternative',
      'Switch installed firmware',
      ['presence-device', 'firmware'],
      { name: z.string().min(1).meta({ title: 'Installed application' }) },
    ),
    ['matter', 'zigbee', 'firmware'],
  ),
  firmware_install_alternative: keyworded(
    operation('Shelly.InstallAlt', 'Install alternate firmware', ['presence-device', 'firmware'], {
      app: z.string().min(1).meta({ title: 'Alternative application' }),
      stage: STAGE,
    }),
    ['matter', 'zigbee', 'firmware'],
  ),
  firmware_upload_start: keyworded(
    operation('OTA.Start', 'Start firmware file upload', ['presence-device', 'firmware-file'], {
      size: z.int().positive(),
    }),
    ['firmware', 'file', 'upload'],
  ),
  firmware_upload_write: keyworded(
    operation('OTA.Write', 'Upload firmware file chunk', ['presence-device', 'firmware-file'], {
      offset: z.int().nonnegative(),
      data: z.base64().meta({ secret: true }),
    }),
    ['firmware', 'file', 'upload'],
  ),
  firmware_upload_abort: keyworded(
    operation('OTA.Abort', 'Abort firmware file upload', ['presence-device', 'firmware-file'], {}),
    ['firmware', 'cancel'],
  ),
};
