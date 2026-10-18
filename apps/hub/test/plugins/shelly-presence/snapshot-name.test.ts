import { describe, expect, it } from 'vitest';
import { shellySnapshot } from '../../../src/plugins/builtin/shelly-presence/snapshot';
import { enrollmentAt } from './fake-shelly';

const inventory = (deviceName: string | null): Parameters<typeof shellySnapshot>[1] => ({
  config: {
    sys: deviceName === null ? {} : { device: { name: deviceName } },
    presence: { enable: true, main_zone: 'presencezone:200' },
    'presencezone:200': { id: 200, enable: true, area: [[0, 0, 4, 4]] },
  },
  status: {
    sys: { cfg_rev: 5 },
    presence: {},
    'presencezone:200': { id: 200, value: false, num_objects: 0 },
  },
  methods: ['Shelly.GetConfig'],
  revision: 5,
  statusSequence: 1,
});

describe('sensor name', () => {
  it('uses the name set on the device', () => {
    const sensor = shellySnapshot(enrollmentAt('http://127.0.0.1:1'), inventory('Hall radar'));
    expect(sensor.name).toBe('Hall radar');
  });

  it('tells unnamed sensors apart by the end of their MAC address', () => {
    const enrollment = enrollmentAt('http://127.0.0.1:1');
    const sensor = shellySnapshot(enrollment, inventory(null));
    expect(sensor.name).toBe(`Shelly Presence ${enrollment.info.mac.slice(-4).toUpperCase()}`);
  });
});
