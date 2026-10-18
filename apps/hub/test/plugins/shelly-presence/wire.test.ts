import { SHELLY_DEVICE, parseShellyParams, type ShellyAction } from '@smarteverything/shelly';
import { describe, expect, it } from 'vitest';
import { shellyCall } from '../../../src/plugins/builtin/shelly-presence/wire';
import { sensorFixture } from './sensor-fixture';

function call(
  action: ShellyAction,
  params: Record<string, unknown>,
  delays = false,
): ReturnType<typeof shellyCall> {
  const device = sensorFixture();
  const zones = device.zones.map((zone) =>
    delays ? { ...zone, config: { ...zone.config, presence_thr: 3, absence_thr: 4 } } : zone,
  );
  return shellyCall(
    action,
    parseShellyParams(action, params),
    SHELLY_DEVICE.parse({ ...device, zones }),
  );
}

describe('Shelly wire calls', () => {
  it('sends plain parameters unchanged to the catalogue method', () => {
    expect(call('set_light', { id: 0, config: { dark_thr: 3 } })).toEqual({
      method: 'Illuminance.SetConfig',
      params: { id: 0, config: { dark_thr: 3 } },
    });
  });

  it('writes zone delays under the key the zone already uses', () => {
    const patch = { id: 200, config: { presence_delay: 5, absence_delay: 6, name: 'Desk' } };
    expect(call('set_zone', patch).params).toEqual({
      id: 200,
      config: { presence_delay: 5, absence_delay: 6, name: 'Desk' },
    });
    expect(call('set_zone', patch, true).params).toEqual({
      id: 200,
      config: { presence_thr: 5, absence_thr: 6, name: 'Desk' },
    });
  });

  it('unwraps schedules, actions and firmware sources into the device parameters', () => {
    const schedule = { timespec: '0 0 * * * *', calls: [{ method: 'Shelly.Reboot' }] };
    expect(call('schedule_create', { schedule })).toEqual({
      method: 'Schedule.Create',
      params: schedule,
    });
    expect(call('schedule_update', { id: 4, schedule: { enable: false } }).params).toEqual({
      id: 4,
      enable: false,
    });
    expect(call('webhook_update', { id: 2, webhook: { enable: true } }).params).toEqual({
      id: 2,
      enable: true,
    });
    expect(call('firmware_update', { update: { url: 'http://192.0.2.5/fw.zip' } })).toEqual({
      method: 'Shelly.Update',
      params: { url: 'http://192.0.2.5/fw.zip' },
    });
  });

  it('picks the component method and unwraps typed component values', () => {
    expect(
      call('set_component', { config: { component: 'wifi', value: { sta: { ssid: 'x' } } } }),
    ).toEqual({
      method: 'WiFi.SetConfig',
      params: { config: { sta: { ssid: 'x' } } },
    });
    expect(call('virtual_set', { id: 200, setting: { component: 'number', value: 4 } })).toEqual({
      method: 'Number.Set',
      params: { id: 200, value: 4 },
    });
    expect(
      call('virtual_config', { id: 200, config: { component: 'enum', value: { options: ['a'] } } }),
    ).toEqual({
      method: 'Enum.SetConfig',
      params: { id: 200, config: { options: ['a'] } },
    });
    expect(call('virtual_add', { config: { component: 'text', value: { name: 'n' } } })).toEqual({
      method: 'Virtual.Add',
      params: { type: 'text', config: { name: 'n' } },
    });
  });

  it('renames the BTHome sensor index and chooses the reset method by target', () => {
    expect(
      call('bthome_add_sensor', { config: { addr: 'AA:BB:CC:DD:EE:FF', obj_id: 1, idx: 2 } })
        .params,
    ).toEqual({ config: { addr: 'AA:BB:CC:DD:EE:FF', obj_id: 1, obj_idx: 2 } });
    expect(call('device_reset', { target: 'wifi' })).toEqual({
      method: 'Shelly.ResetWiFiConfig',
      params: {},
    });
    expect(call('device_reset', { target: 'factory' }).method).toBe('Shelly.FactoryReset');
  });

  it('keeps parameterless actions on their own methods', () => {
    expect(call('matter_reset', {}).method).toBe('Matter.FactoryReset');
    expect(call('matter_setup', {}).method).toBe('Matter.GetSetupCode');
  });
});
