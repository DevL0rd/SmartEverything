import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseShellyParams,
  SHELLY_ACTION,
  SHELLY_ACTION_REQUEST,
  SHELLY_ACTIONS,
  SHELLY_CATALOGUE,
  SHELLY_PAGES,
  SHELLY_SETTING_ROWS,
  shellyActionAvailable,
  shellyActionMethods,
  shellyDispatchMethod,
  shellyMethod,
  shellyOperation,
  type ShellyAction,
} from '../src';

const PAGE_IDS: readonly string[] = SHELLY_PAGES.map((page) => page.id);
const READS: readonly ShellyAction[] = [
  'refresh',
  'schedule_eval',
  'wifi_scan',
  'wifi_clients',
  'ble_clients',
  'cloud_relay_list',
  'cloud_relay_infos',
  'firmware_check',
  'device_profiles',
  'device_timezones',
  'device_detect_location',
  'bthome_objects',
  'bthome_known_objects',
  'kvs_list',
  'firmware_alternatives',
];

const OWNER_READS: readonly ShellyAction[] = ['kvs_get', 'kvs_many', 'script_code'];
const WRITES: readonly ShellyAction[] = [
  'set_presence',
  'set_zone',
  'add_zone',
  'set_light',
  'set_detection',
  'calibrate',
  'live_track',
  'reconnect',
  'virtual_set',
  'virtual_button',
  'virtual_toggle',
];

describe('catalogue rows', () => {
  it('has one row for each of the 88 actions the plugin offered', () => {
    expect(SHELLY_ACTIONS).toHaveLength(88);
    expect(new Set(SHELLY_ACTIONS).size).toBe(88);
    expect(SHELLY_ACTION.options).toEqual(SHELLY_ACTIONS);
  });

  it('describes every row with a title, a known page and a group', () => {
    for (const action of SHELLY_ACTIONS) {
      const row = shellyOperation(action);
      expect(row.title.length).toBeGreaterThan(0);
      expect(PAGE_IDS).toContain(row.page);
      expect(row.group.length).toBeGreaterThan(0);
      expect(row.method).toMatch(/^[A-Za-z]+(\.[A-Za-z]+)+$/);
    }
  });

  it('lets any member read and make everyday changes, and keeps the rest with the owner', () => {
    const members = SHELLY_ACTIONS.filter((action) => !SHELLY_CATALOGUE[action].owner);
    expect([...members].sort()).toEqual([...READS, ...WRITES].sort());
    for (const action of OWNER_READS) expect(SHELLY_CATALOGUE[action].owner).toBe(true);
    expect(SHELLY_CATALOGUE.script_code.owner).toBe(true);
  });

  it('keeps a row for every action a settings row writes through', () => {
    for (const row of SHELLY_SETTING_ROWS) expect(SHELLY_ACTIONS).toContain(row.action);
  });

  it('binds the parameterless actions to their own methods', () => {
    expect(shellyOperation('matter_setup').method).toBe('Matter.GetSetupCode');
    expect(shellyOperation('matter_reset').method).toBe('Matter.FactoryReset');
    expect(shellyOperation('zigbee_join').method).toBe('Zigbee.StartNetworkSteering');
    expect(shellyOperation('wifi_scan').method).toBe('WiFi.Scan');
    expect(shellyOperation('wifi_clients').method).toBe('WiFi.ListAPClients');
    expect(shellyOperation('ble_clients').method).toBe('BLE.ListPairedDevices');
  });

  it('keeps search words only where they add to the title', () => {
    expect(shellyOperation('set_presence').keywords).toEqual(['radar', 'configuration']);
    expect(shellyOperation('schedule_create').keywords).toEqual([]);
  });
});

describe('dispatch', () => {
  it('uses the row method when the action has one method', () => {
    expect(shellyMethod('set_zone', { id: 1, config: {} })).toBe('PresenceZone.SetConfig');
  });

  it('picks the component method for component settings', () => {
    expect(shellyMethod('set_component', { config: { component: 'mqtt', value: {} } })).toBe(
      'MQTT.SetConfig',
    );
    expect(
      shellyMethod('virtual_config', { id: 200, config: { component: 'enum', value: {} } }),
    ).toBe('Enum.SetConfig');
    expect(
      shellyMethod('virtual_set', { id: 200, setting: { component: 'text', value: 'a' } }),
    ).toBe('Text.Set');
  });

  it('refuses a component the action has no method for', () => {
    expect(() =>
      shellyMethod('virtual_set', { id: 200, setting: { component: 'button', value: 1 } }),
    ).toThrow();
    expect(() =>
      shellyMethod('set_component', { config: { component: 'unknown', value: {} } }),
    ).toThrow();
    expect(() => shellyDispatchMethod({ key: 'setting', methods: {} }, 'button')).toThrow();
    expect(shellyDispatchMethod({ key: 'setting', methods: { text: 'Text.Set' } }, 'text')).toBe(
      'Text.Set',
    );
  });

  it('lists every method an action can call', () => {
    expect(shellyActionMethods('set_zone')).toEqual(['PresenceZone.SetConfig']);
    expect(shellyActionMethods('set_component')).toContain('Ws.SetConfig');
  });
});

describe('availability', () => {
  it('needs the method in the sensor list, ignoring case', () => {
    expect(shellyActionAvailable('wifi_scan', ['wifi.scan'])).toBe(true);
    expect(shellyActionAvailable('wifi_scan', ['Shelly.GetStatus'])).toBe(false);
  });

  it('is available for component settings when any component method is listed', () => {
    expect(shellyActionAvailable('set_component', ['Zigbee.SetConfig'])).toBe(true);
    expect(shellyActionAvailable('set_component', [])).toBe(false);
  });
});

describe('parameters', () => {
  it('accepts the parameters of a typed action', () => {
    expect(
      parseShellyParams('set_zone', { id: 2, config: { name: 'Desk', area: [[1, 2, 3, 4]] } }),
    ).toEqual({
      id: 2,
      config: { name: 'Desk', area: [[1, 2, 3, 4]] },
    });
  });

  it('lets unknown firmware values through in settings', () => {
    expect(() =>
      parseShellyParams('set_presence', {
        config: { sensor: { sensitivity: 'ultra', height: 42 }, future_setting: true },
      }),
    ).not.toThrow();
  });

  it('refuses parameters the action does not have', () => {
    expect(() => parseShellyParams('wifi_scan', { extra: 1 })).toThrow();
    expect(() => parseShellyParams('script_start', {})).toThrow();
  });

  it('only fetches example scripts by relative javascript path', () => {
    expect(() => parseShellyParams('script_example', { fname: 'examples/a.js' })).not.toThrow();
    expect(() => parseShellyParams('script_example', { fname: '/etc/a.js' })).toThrow();
    expect(() => parseShellyParams('script_example', { fname: 'a/../b.js' })).toThrow();
    expect(() => parseShellyParams('script_example', { fname: 'a.txt' })).toThrow();
  });

  it('only reads saved log files below the debug folder', () => {
    expect(() => parseShellyParams('device_log_file', { path: '/debug/log' })).not.toThrow();
    expect(() => parseShellyParams('device_log_file', { path: '/config' })).toThrow();
  });

  it('builds action requests with empty parameters by default', () => {
    expect(
      SHELLY_ACTION_REQUEST.parse({ externalId: 'shelly-presence:a', action: 'refresh' }),
    ).toEqual({
      externalId: 'shelly-presence:a',
      action: 'refresh',
      params: {},
    });
    expect(() => SHELLY_ACTION_REQUEST.parse({ externalId: 'a', action: 'nope' })).toThrow();
  });

  it('keeps the expected revision out of device parameters', () => {
    expect(() =>
      parseShellyParams('set_zone', { id: 2, config: {}, expectedRevision: 1 }),
    ).toThrow();
    expect(() => parseShellyParams('schedule_delete', { id: 2, expectedRevision: 1 })).toThrow();
  });

  it('takes an expected revision only on whole-list schedule and action edits', () => {
    const base = { externalId: 'shelly-presence:a' };
    expect(
      SHELLY_ACTION_REQUEST.parse({
        ...base,
        action: 'schedule_delete',
        params: { id: 1 },
        expectedRevision: 4,
      }).expectedRevision,
    ).toBe(4);
    expect(() =>
      SHELLY_ACTION_REQUEST.parse({
        ...base,
        action: 'webhook_update',
        params: { id: 1 },
        expectedRevision: 4,
      }),
    ).not.toThrow();
    expect(() =>
      SHELLY_ACTION_REQUEST.parse({ ...base, action: 'set_zone', expectedRevision: 4 }),
    ).toThrow();
    expect(SHELLY_ACTIONS.filter((action) => SHELLY_CATALOGUE[action].revisioned).sort()).toEqual(
      SHELLY_ACTIONS.filter((action) =>
        /^(schedule|webhook)_(create|update|delete|delete_all)$/.test(action),
      ).sort(),
    );
  });
});

const PROPERTIES = z.record(z.string(), z.looseObject({ title: z.string().optional() }));

function titles(schema: unknown): Map<string, string | undefined> {
  const found = new Map<string, string | undefined>();
  JSON.stringify(schema, (key, value: unknown) => {
    const properties = PROPERTIES.safeParse(value);
    if (key === 'properties' && properties.success)
      for (const [name, field] of Object.entries(properties.data)) found.set(name, field.title);
    return value;
  });
  return found;
}

const PARAM_TITLES: readonly (readonly [ShellyAction, string, string])[] = [
  ['kvs_get', 'key', 'Stored key'],
  ['kvs_list', 'match', 'Key pattern'],
  ['kvs_list', 'offset', 'Page offset'],
  ['kvs_many', 'match', 'Key pattern'],
  ['kvs_many', 'offset', 'Page offset'],
  ['ble_pair', 'timeout', 'Pairing timeout (seconds)'],
  ['ble_delete_client', 'addr', 'Bluetooth address'],
  ['ble_associate', 'target', 'Target component ID'],
  ['ble_associate', 'duration', 'Duration (seconds)'],
  ['ble_associate', 'rssi_thr', 'Minimum signal (dBm)'],
  ['ble_associate_trv', 'blutrv_id', 'Radiator valve ID'],
  ['ble_associate_trv', 'duration', 'Duration (seconds)'],
  ['ble_associate_trv', 'rssi_thr', 'Minimum signal (dBm)'],
  ['device_reboot', 'delay_ms', 'Restart delay (milliseconds)'],
  ['device_reset', 'target', 'Reset'],
  ['device_password', 'password', 'Local access password'],
  ['firmware_switch', 'name', 'Installed application'],
  ['firmware_install_alternative', 'app', 'Alternative application'],
  ['firmware_install_alternative', 'stage', 'Release channel'],
  ['firmware_update', 'stage', 'Release channel'],
  ['firmware_update', 'url', 'Custom firmware URL'],
  ['device_set_profile', 'name', 'Operating mode'],
  ['device_timezones', 'offset', 'Page offset'],
  ['device_set_time', 'unixtime', 'Unix timestamp (seconds)'],
  ['certificate_put', 'target', 'Certificate destination'],
  ['certificate_put', 'data', 'PEM content'],
  ['certificate_put', 'append', 'Append to certificate bundle'],
  ['device_log_file', 'path', 'Advertised saved log path'],
  ['device_logs', 'lines', 'Lines to read'],
  ['http_request', 'method', 'HTTP method'],
  ['http_request', 'url', 'Request URL'],
  ['http_request', 'body', 'Request body'],
  ['http_request', 'headers', 'Headers'],
  ['http_request', 'timeout', 'Timeout (seconds)'],
  ['http_request', 'ssl_ca', 'TLS certificate verification'],
  ['bthome_objects', 'obj_ids', 'Bluetooth object IDs'],
  ['bthome_objects', 'offset', 'Page offset'],
  ['bthome_discover', 'duration', 'Duration (seconds)'],
  ['bthome_delete_device', 'id', 'Component ID'],
  ['bthome_delete_sensor', 'id', 'Component ID'],
  ['bthome_known_objects', 'id', 'Component ID'],
];

describe('parameter titles', () => {
  it.each(PARAM_TITLES)('%s.%s is labelled %s', (action, name, title) => {
    const schema = z.toJSONSchema(SHELLY_CATALOGUE[action].params, {
      io: 'input',
      unrepresentable: 'any',
    });
    expect(titles(schema).get(name)).toBe(title);
  });
});
