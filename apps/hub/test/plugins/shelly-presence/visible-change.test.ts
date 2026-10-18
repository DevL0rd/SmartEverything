import { describe, expect, it } from 'vitest';
import { SHELLY_DEVICE, type ShellyDevice } from '@smarteverything/shelly';
import { inventoryVisibleChange } from '../../../src/plugins/builtin/shelly-presence/visible-change';

function sensor(): ShellyDevice {
  return SHELLY_DEVICE.parse({
    id: 'radar-1',
    externalId: 'shelly-presence:radar-1',
    name: 'Hall radar',
    address: 'http://127.0.0.1',
    info: {
      id: 'radar-1',
      mac: 'AABBCC',
      model: 'S4SN-0U61X',
      gen: 4,
      fw_id: 'x',
      ver: '1',
      app: 'presence',
      auth_en: false,
    },
    connection: { state: 'online', reason: null },
    observedAt: null,
    config: { enable: true, main_zone: 'presencezone:200' },
    status: {},
    revision: 1,
    zones: [
      {
        key: 'presencezone:200',
        externalId: 'shelly-presence:radar-1',
        generation: 0,
        main: true,
        config: { id: 200, enable: true, area: [] },
        status: { id: 200, value: false, num_objects: 0 },
      },
    ],
    light: [
      { config: { id: 0 }, status: { id: 0, lux: 5, illumination: 'dark' } },
      { config: { id: 1 }, status: { id: 1, lux: 7, illumination: 'dark' } },
    ],
    tracks: [],
    tracksAt: null,
    methods: [],
    componentKeys: [],
    features: [],
    components: [],
    discoveredBthome: [],
  });
}

describe('inventoryVisibleChange', () => {
  it('ignores the readings the app shows from device state', () => {
    const before = sensor();
    const [zone] = before.zones;
    const [first, second] = before.light;
    if (
      zone?.status === undefined ||
      zone.status === null ||
      first?.status === undefined ||
      first.status === null ||
      second === undefined
    )
      throw new Error('fixture');
    const after = {
      ...before,
      zones: [{ ...zone, status: { ...zone.status, value: true, num_objects: 3 } }],
      light: [{ ...first, status: { ...first.status, lux: 90, illumination: 'bright' } }, second],
    };
    expect(inventoryVisibleChange(before, after)).toBe(false);
  });

  it('reports a change to a light sensor after the first', () => {
    const before = sensor();
    const [first, second] = before.light;
    if (first === undefined || second?.status === undefined || second.status === null)
      throw new Error('fixture');
    const after = {
      ...before,
      light: [first, { ...second, status: { ...second.status, lux: 8 } }],
    };
    expect(inventoryVisibleChange(before, after)).toBe(true);
  });

  it('reports a presence status change and a BTHome discovery', () => {
    const before = sensor();
    expect(inventoryVisibleChange(before, { ...before, status: { sensor_ver: '2' } })).toBe(true);
    expect(inventoryVisibleChange(before, { ...before, discoveredBthome: [] })).toBe(true);
  });

  it('reports an error appearing on the first light sensor', () => {
    const before = sensor();
    const [first, second] = before.light;
    if (first?.status === undefined || first.status === null || second === undefined)
      throw new Error('fixture');
    const after = {
      ...before,
      light: [{ ...first, status: { ...first.status, errors: ['out_of_range'] } }, second],
    };
    expect(inventoryVisibleChange(before, after)).toBe(true);
  });
});
