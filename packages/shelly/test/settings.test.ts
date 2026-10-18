import { describe, expect, it } from 'vitest';
import {
  SHELLY_PAGES,
  SHELLY_PRESENCE_SETTINGS,
  SHELLY_SETTING_COMPONENTS,
  SHELLY_SETTING_ROWS,
  SHELLY_SETTINGS,
  SHELLY_ZONE_SETTINGS,
  type ShellySettingRow,
} from '../src';

const byId = (id: string): ShellySettingRow => {
  const row = SHELLY_SETTING_ROWS.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`no settings row ${id}`);
  return row;
};

describe('settings rows', () => {
  it('derives 199 unique rows from the schemas', () => {
    expect(SHELLY_SETTING_ROWS).toHaveLength(199);
    expect(new Set(SHELLY_SETTING_ROWS.map((row) => row.id)).size).toBe(199);
    expect(SHELLY_SETTING_COMPONENTS).toEqual(Object.keys(SHELLY_SETTINGS));
  });

  it('puts every row on a known page with a title and a group', () => {
    const pages: readonly string[] = SHELLY_PAGES.map((page) => page.id);
    for (const row of SHELLY_SETTING_ROWS) {
      expect(pages).toContain(row.page);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.group.length).toBeGreaterThan(0);
      expect(row.keywords).toContain(row.component);
    }
  });

  it('keeps ranges, units and options as hints', () => {
    expect(byId('presence.zmin')).toMatchObject({
      kind: 'number',
      min: 0,
      max: 2.9,
      unit: 'm',
      nullable: true,
      keywords: ['pet', 'floor', 'height', 'presence'],
    });
    expect(byId('presence.sensor.position')).toMatchObject({
      kind: 'enum',
      options: ['left', 'center', 'right'],
    });
    expect(byId('mqtt.ssl_ca').labels).toEqual({
      'ca.pem': 'Built-in CA',
      'user_ca.pem': 'User CA',
      '*': 'Skip verification',
    });
  });

  it('keeps the search synonyms that differ from the title', () => {
    expect(byId('presencezone.color').keywords).toEqual(expect.arrayContaining(['colour', 'map']));
    expect(byId('number.meta.ui.step').keywords).toContain('increment');
    expect(byId('presence.leds.night_mode.active_between').keywords).toEqual(
      expect.arrayContaining(['start', 'end', 'time']),
    );
    expect(byId('presence.sensor.position').keywords).toEqual(
      expect.arrayContaining(['left', 'center', 'right']),
    );
  });

  it('finds nested rows and rows inside stored objects', () => {
    expect(byId('presence.sensor.state.det_act_thr').path).toEqual([
      'sensor',
      'state',
      'det_act_thr',
    ]);
    expect(byId('sys.ui_data').kind).toBe('stored_values');
    expect(byId('sys.ui_data.tf')).toMatchObject({
      kind: 'enum',
      options: ['default', '24', '12'],
    });
  });

  it('flags the secrets', () => {
    expect(SHELLY_SETTING_ROWS.filter((row) => row.secret === true).map((row) => row.id)).toEqual([
      'wifi.sta.pass',
      'wifi.sta1.pass',
      'wifi.ap.pass',
      'mqtt.pass',
      'bthomedevice.key',
    ]);
  });

  it('names the action that saves each component', () => {
    expect(byId('presence.enable').action).toBe('set_presence');
    expect(byId('presencezone.area').action).toBe('set_zone');
    expect(byId('illuminance.dark_thr').action).toBe('set_light');
    expect(byId('wifi.sta.ssid').action).toBe('set_component');
    expect(byId('number.min').action).toBe('virtual_config');
    expect(byId('bthome.enable').action).toBe('bthome_set_config');
    expect(byId('bthomedevice.addr').action).toBe('bthome_device_config');
    expect(byId('bthomesensor.idx').action).toBe('bthome_sensor_config');
  });

  it('gives each virtual type the fields it has', () => {
    const ids = (component: string): string[] =>
      SHELLY_SETTING_ROWS.filter((row) => row.component === component).map((row) => row.id);
    expect(ids('button')).toHaveLength(10);
    expect(ids('group')).toHaveLength(10);
    expect(ids('enum')).toContain('enum.options');
    expect(ids('text')).toContain('text.max_len');
    expect(ids('number')).toContain('number.meta.ui.step');
    expect(ids('boolean')).not.toContain('boolean.min');
  });
});

describe('lenient settings', () => {
  it('reads values and fields the firmware adds later', () => {
    const config = SHELLY_PRESENCE_SETTINGS.parse({
      enable: true,
      num_tracks: 99,
      zmin: 7,
      sensor: { sensitivity: 'ultra', room_preset: 'future', points: 1000 },
      main_zone: 'presencezone:1',
      new_firmware_field: { a: 1 },
    });
    expect(config.sensor?.sensitivity).toBe('ultra');
    expect(config).toHaveProperty('new_firmware_field');
  });

  it('reads a sensor without a main zone', () => {
    expect(SHELLY_PRESENCE_SETTINGS.parse({}).main_zone).toBeUndefined();
  });

  it('reads zones with either delay name', () => {
    expect(
      SHELLY_ZONE_SETTINGS.parse({ id: 1, presence_thr: 4, area: [[0, 0, 1, 1]] }),
    ).toMatchObject({
      presence_thr: 4,
    });
  });
});
