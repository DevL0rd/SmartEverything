import { describe, expect, it } from 'vitest';
import {
  SHELLY_SETTING_ROWS,
  parseShellyParams,
  type ShellySettingRow,
} from '@smarteverything/shelly';
import { settingParams, settingsPatch } from './settings-patch';

function row(id: string): ShellySettingRow {
  const found = SHELLY_SETTING_ROWS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no settings row ${id}`);
  return found;
}

describe('settingsPatch', () => {
  it('writes only the edited rows, nested by path', () => {
    const patch = settingsPatch(
      [row('presence.sensor.height'), row('presence.enable')],
      { 'sensor.height': '2.4' },
      {},
    );
    expect(patch).toStrictEqual({ sensor: { height: 2.4 } });
  });

  it('turns a blank nullable number into null and drops a blank required one', () => {
    expect(settingsPatch([row('presence.zmin')], { zmin: '' }, {})).toStrictEqual({ zmin: null });
    expect(settingsPatch([row('presence.num_tracks')], { num_tracks: '' }, {})).toStrictEqual({});
  });

  it('sends a numeral enum option as a number and keeps word options', () => {
    const rows = [row('sys.ui_data.tf'), row('sys.ui_data.df')];
    const patch = settingsPatch(rows, { 'ui_data.tf': '24', 'ui_data.df': 'YYYY-MM-DD' }, {});
    expect(patch).toStrictEqual({ ui_data: { tf: 24, df: 'YYYY-MM-DD' } });
  });

  it('merges interface data with what the device holds and drops defaults', () => {
    const accepted = { ui_data: { df: 'DD/MM/YYYY', dash: ['boolean:200'] } };
    const patch = settingsPatch(
      [row('sys.ui_data.tf'), row('sys.ui_data.dash')],
      { 'ui_data.tf': 'default', 'ui_data.dash': [] },
      accepted,
    );
    expect(patch).toStrictEqual({ ui_data: { df: 'DD/MM/YYYY' } });
  });

  it('merges component metadata so unedited display fields survive', () => {
    const accepted = { name: 'Fan', meta: { ui: { unit: '%', view: 'slider' } } };
    const patch = settingsPatch([row('number.meta.ui.unit')], { 'meta.ui.unit': 'rpm' }, accepted);
    expect(patch).toStrictEqual({ meta: { ui: { unit: 'rpm', view: 'slider' } } });
  });

  it('clears a nullable text value with null', () => {
    expect(settingsPatch([row('mqtt.server')], { server: null }, {})).toStrictEqual({
      server: null,
    });
  });
});

describe('settingParams', () => {
  it('wraps component settings with their type and identifies instances', () => {
    expect(
      settingParams('set_component', { component: 'wifi', id: null }, { sta: { ssid: 'a' } }),
    ).toStrictEqual({
      config: { component: 'wifi', value: { sta: { ssid: 'a' } } },
    });
    expect(
      settingParams('virtual_config', { component: 'number', id: 201 }, { name: 'x' }),
    ).toStrictEqual({
      id: 201,
      config: { component: 'number', value: { name: 'x' } },
    });
    expect(
      settingParams('set_light', { component: 'illuminance', id: 0 }, { dark_thr: 5 }),
    ).toStrictEqual({
      id: 0,
      config: { dark_thr: 5 },
    });
    expect(
      settingParams('set_presence', { component: 'presence', id: null }, { enable: true }),
    ).toStrictEqual({
      config: { enable: true },
    });
  });

  it('builds params the catalogue accepts for every setting action', () => {
    const wifi = settingParams(
      'set_component',
      { component: 'wifi', id: null },
      { sta: { ssid: 'a' } },
    );
    expect(() => parseShellyParams('set_component', wifi)).not.toThrow();
    const virtual = settingParams(
      'virtual_config',
      { component: 'boolean', id: 200 },
      { persisted: true },
    );
    expect(() => parseShellyParams('virtual_config', virtual)).not.toThrow();
    const bthome = settingParams(
      'bthome_set_config',
      { component: 'bthome', id: null },
      { enable: true },
    );
    expect(() => parseShellyParams('bthome_set_config', bthome)).not.toThrow();
  });
});
