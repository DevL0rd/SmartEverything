import { CommandRefusedError, type DeviceCommand } from '@smarteverything/domain';
import { SHELLY_DEVICE } from '@smarteverything/shelly';
import { describe, expect, it } from 'vitest';
import type { ShellyInventory } from '../../../src/plugins/builtin/shelly-presence/component-inventory';
import { shellyRequestOf } from '../../../src/plugins/builtin/shelly-presence/device-command';
import { shellyFeatures } from '../../../src/plugins/builtin/shelly-presence/features';
import { shellySearch } from '../../../src/plugins/builtin/shelly-presence/search';
import { sensorFixture } from './sensor-fixture';

function inventory(methods: string[]): ShellyInventory {
  return {
    config: {
      sys: { device: { name: 'Hall' } },
      presence: { enable: true, sensor: { height: 2 }, main_zone: 'presencezone:200' },
      'presencezone:200': { id: 200, presence_thr: 1, area: [[0, 0, 2, 2]] },
      wifi: { sta: { ssid: 'home' } },
    },
    status: { sys: { cfg_rev: 1 } },
    methods,
    revision: 1,
    statusSequence: 1,
  };
}

function ids(features: ReturnType<typeof shellyFeatures>): string[] {
  return features.map((feature) => feature.id);
}

describe('Shelly features', () => {
  it('lists the settings the device configuration has, including renamed and write-only ones', () => {
    const found = ids(shellyFeatures(inventory([])));
    expect(found).toEqual(
      expect.arrayContaining([
        'presence.enable',
        'presence.sensor.height',
        'presencezone.presence_delay',
        'wifi.sta.ssid',
        'wifi.sta.pass',
      ]),
    );
    expect(found.some((id) => id.startsWith('ble.'))).toBe(false);
  });

  it('lists an operation only when the device offers one of its methods', () => {
    const found = ids(shellyFeatures(inventory(['Presence.SetConfig', 'WiFi.SetConfig'])));
    expect(found).toEqual(expect.arrayContaining(['set_presence', 'set_component']));
    expect(found).not.toContain('device_reboot');
  });
});

describe('Shelly search', () => {
  it('indexes the pages, the available settings and operations and every extra zone', () => {
    const sensor = SHELLY_DEVICE.parse({
      ...sensorFixture(),
      features: shellyFeatures(inventory(['Presence.SetConfig'])),
    });
    const entries = shellySearch([sensor]);
    const titles = entries.map((entry) => entry.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Room and zones', 'Presence detection', 'Save detection settings']),
    );
    const zone = entries.find(
      (entry) => entry.target.kind === 'device' && entry.target.query['zone'] === '201',
    );
    expect(zone?.target).toMatchObject({
      section: 'presence-room',
      query: { zone: '201', focus: 'zones' },
    });
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
});

describe('Shelly device commands', () => {
  const sensor = SHELLY_DEVICE.parse({
    ...sensorFixture(),
    components: [
      { component: 'button', key: 'button:200', config: { id: 200 }, status: null },
      { component: 'group', key: 'group:201', config: { id: 201 }, status: null },
      { component: 'number', key: 'number:202', config: { id: 202 }, status: { value: 1 } },
    ],
  });
  const command = (
    capability: DeviceCommand['capability'],
    value: DeviceCommand['value'],
  ): DeviceCommand => ({
    commandId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
    externalId: sensor.externalId,
    capability,
    value,
  });

  it('maps the detection switch and each virtual component to its operation', () => {
    expect(shellyRequestOf(sensor, command('raw:shelly.detection_enabled', false))).toEqual({
      action: 'set_detection',
      params: { enable: false },
    });
    expect(
      shellyRequestOf(sensor, command('raw:shelly.component.button:200', { event: 'single_push' })),
    ).toEqual({
      action: 'virtual_button',
      params: { id: 200, event: 'single_push' },
    });
    expect(
      shellyRequestOf(sensor, command('raw:shelly.component.group:201', { value: ['boolean:1'] })),
    ).toEqual({
      action: 'virtual_set',
      params: { id: 201, setting: { component: 'group', value: ['boolean:1'] } },
    });
    expect(shellyRequestOf(sensor, command('raw:shelly.component.number:202', 4))).toEqual({
      action: 'virtual_set',
      params: { id: 202, setting: { component: 'number', value: 4 } },
    });
  });

  it('refuses a capability it does not own and a component that is gone', () => {
    expect(() => shellyRequestOf(sensor, command('raw:shelly.operation', {}))).toThrow(
      CommandRefusedError,
    );
    expect(() => shellyRequestOf(sensor, command('raw:shelly.component.text:209', 'x'))).toThrow(
      'no longer exists',
    );
  });
});
