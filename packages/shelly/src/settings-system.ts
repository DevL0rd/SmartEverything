import { z } from 'zod';
import { choice, flag, mixedChoice, num, strings, stored, text, type Place } from './settings-meta';

const network = (group: string): Place => ['presence-network', group];
const connectivity = (group: string): Place => ['presence-connectivity', group];
const device = (group: string): Place => ['presence-device', group];
const diagnostics = (group: string): Place => ['presence-diagnostics', group];
const TLS_OPTIONS = ['ca.pem', 'user_ca.pem', '*'];
const TLS_LABELS = { 'ca.pem': 'Built-in CA', 'user_ca.pem': 'User CA', '*': 'Skip verification' };
const IPV4 = { nullable: true } as const;

function station(label: string, group: string): z.ZodOptional<z.ZodNullable<z.ZodType>> {
  return z
    .looseObject({
      enable: flag(`${label} Wi-Fi enabled`, network(group), { keywords: [`${label} wi-fi`] }),
      ssid: text(`${label} Wi-Fi network`, network(group), {
        nullable: true,
        keywords: [`${label} wi-fi`],
      }),
      pass: text(`${label} Wi-Fi password`, network(group), { secret: true, nullable: true }),
      ipv4mode: choice(`${label} Wi-Fi IP mode`, network(group), ['dhcp', 'static']),
      ip: text(`${label} Wi-Fi IP address`, network(group), IPV4),
      netmask: text(`${label} Wi-Fi network mask`, network(group), IPV4),
      gw: text(`${label} Wi-Fi gateway`, network(group), IPV4),
      nameserver: text(`${label} Wi-Fi DNS server`, network(group), IPV4),
    })
    .nullable()
    .optional();
}

export const SHELLY_WIFI_SETTINGS = z.looseObject({
  sta: station('Primary', 'sta'),
  sta1: station('Fallback', 'sta1'),
  ap: z
    .looseObject({
      enable: flag('Access point', network('access-point')),
      ssid: text('Access point name', network('access-point'), { nullable: true }),
      pass: text('Access point password', network('access-point'), {
        secret: true,
        nullable: true,
      }),
      range_extender: z
        .looseObject({ enable: flag('Range extender', network('access-point')) })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  roam: z
    .looseObject({
      rssi_thr: num('Roaming signal threshold', network('roaming'), { unit: 'dBm' }),
      interval: num('Roaming interval', network('roaming'), { min: 0, unit: 's' }),
    })
    .nullable()
    .optional(),
});

export const SHELLY_BLE_SETTINGS = z.looseObject({
  enable: flag('Bluetooth enabled', network('ble')),
  rpc: z
    .looseObject({
      enable: flag('Bluetooth RPC', network('bluetooth')),
      keep_running: flag('Keep Bluetooth RPC running', network('bluetooth')),
    })
    .nullable()
    .optional(),
  observer: z
    .looseObject({ enable: flag('Bluetooth observer', network('bluetooth')) })
    .nullable()
    .optional(),
});

export const SHELLY_CLOUD_SETTINGS = z.looseObject({
  enable: flag('Shelly Cloud enabled', connectivity('cloud')),
  server: text('Shelly Cloud server', connectivity('cloud'), { nullable: true }),
});

export const SHELLY_MQTT_SETTINGS = z.looseObject({
  enable: flag('MQTT enabled', connectivity('mqtt')),
  server: text('MQTT server', connectivity('mqtt'), { nullable: true }),
  client_id: text('MQTT Client ID', connectivity('mqtt'), { nullable: true }),
  user: text('MQTT User', connectivity('mqtt'), { nullable: true }),
  pass: text('MQTT Password', connectivity('mqtt'), { secret: true, nullable: true }),
  topic_prefix: text('MQTT Topic prefix', connectivity('mqtt'), { nullable: true }),
  rpc_ntf: flag('MQTT RPC notifications', connectivity('mqtt')),
  status_ntf: flag('MQTT Status notifications', connectivity('mqtt')),
  use_client_cert: flag('MQTT Client certificate', connectivity('mqtt')),
  enable_control: flag('MQTT Control enabled', connectivity('mqtt')),
  enable_rpc: flag('Allow MQTT RPC', connectivity('mqtt'), { keywords: ['mqtt', 'rpc'] }),
  ssl_ca: choice('MQTT TLS verification', connectivity('mqtt'), TLS_OPTIONS, {
    nullable: true,
    labels: TLS_LABELS,
  }),
});

export const SHELLY_WS_SETTINGS = z.looseObject({
  enable: flag('Outbound WebSocket enabled', connectivity('ws')),
  server: text('Outbound WebSocket server', connectivity('ws'), { nullable: true }),
  ssl_ca: choice('WS TLS verification', connectivity('ws'), TLS_OPTIONS, {
    nullable: true,
    labels: TLS_LABELS,
  }),
});

export const SHELLY_MATTER_SETTINGS = z.looseObject({
  enable: flag('Matter enabled', connectivity('matter')),
  presence: z
    .looseObject({
      zones: num('Zones exposed to Matter', connectivity('matter'), {
        min: 0,
        max: 10,
        step: 1,
        keywords: ['matter', 'zones'],
      }),
    })
    .nullable()
    .optional(),
});

export const SHELLY_ZIGBEE_SETTINGS = z.looseObject({
  enable: flag('Zigbee enabled', connectivity('zigbee')),
});

const DATE_FORMATS = [
  'YYYY/M/D',
  'YYYY-MM-DD',
  'YYYY.MM.DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YY/MM/DD',
];

const SYS_UI_DATA = stored(
  z.looseObject({
    df: choice('Date format', device('system'), DATE_FORMATS, {
      keywords: ['date format', 'display'],
    }),
    tf: mixedChoice('Time format', device('system'), ['default', '24', '12'], {
      labels: { '12': '12 hour', '24': '24 hour', default: 'System default' },
      keywords: ['time format', 'clock', 'display'],
    }),
    dash: strings('Group order', device('system'), { keywords: ['group order', 'display'] }),
  }),
  'Device interface data',
  device('interface-data'),
  { keywords: ['interface', 'data', 'display'] },
);

export const SHELLY_SYS_SETTINGS = z.looseObject({
  device: z
    .looseObject({
      name: text('Device name', device('system'), { nullable: true }),
      eco_mode: flag('Eco mode', device('system')),
      discoverable: flag('Discoverable', device('system')),
      enhanced_security: flag('Enhanced security', device('system')),
      tls_check_cert_validity_time: flag('Check certificate expiry', device('system')),
    })
    .nullable()
    .optional(),
  location: z
    .looseObject({
      tz: text('Time zone', device('system'), { nullable: true }),
      lat: num('Latitude', device('system'), { min: -90, max: 90, nullable: true }),
      lon: num('Longitude', device('system'), { min: -180, max: 180, nullable: true }),
    })
    .nullable()
    .optional(),
  sntp: z
    .looseObject({ server: text('Time server', device('system')) })
    .nullable()
    .optional(),
  rpc_udp: z
    .looseObject({
      dst_addr: text('UDP RPC destination', connectivity('udp-rpc'), { nullable: true }),
      listen_port: num('UDP RPC listen port', connectivity('udp-rpc'), {
        min: 1,
        max: 65535,
        step: 1,
        nullable: true,
      }),
    })
    .nullable()
    .optional(),
  debug: z
    .looseObject({
      mqtt: z
        .looseObject({ enable: flag('MQTT device logs', diagnostics('device-logging')) })
        .nullable()
        .optional(),
      websocket: z
        .looseObject({ enable: flag('WebSocket device logs', diagnostics('device-logging')) })
        .nullable()
        .optional(),
      file_log: z
        .looseObject({ enable: flag('Stored device logs', diagnostics('device-logging')) })
        .nullable()
        .optional(),
      udp: z
        .looseObject({
          addr: text('UDP log destination', diagnostics('device-logging'), { nullable: true }),
        })
        .nullable()
        .optional(),
      level: num('Debug log level', diagnostics('debug-logs'), {
        step: 1,
        keywords: ['debug', 'log level'],
      }),
      file_level: num('Saved log level', diagnostics('debug-logs'), {
        step: 1,
        nullable: true,
        keywords: ['debug', 'saved logs'],
      }),
    })
    .nullable()
    .optional(),
  ui_data: SYS_UI_DATA,
});
