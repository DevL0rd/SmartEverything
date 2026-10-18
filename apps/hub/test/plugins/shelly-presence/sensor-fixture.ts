import type { ShellyDevice } from '@smarteverything/shelly';
import { shellySnapshot } from '../../../src/plugins/builtin/shelly-presence/snapshot';
import { enrollmentAt } from './fake-shelly';

export function sensorFixture(): ShellyDevice {
  return shellySnapshot(enrollmentAt('http://127.0.0.1:1'), {
    config: {
      sys: { device: { name: 'Hall radar' } },
      presence: { enable: true, main_zone: 'presencezone:200' },
      'presencezone:200': { id: 200, enable: true, area: [[0, 0, 4, 4]] },
      'presencezone:201': { id: 201, enable: true, area: [[4, 4, 8, 8]] },
      'illuminance:0': { id: 0 },
    },
    status: {
      sys: { cfg_rev: 5 },
      presence: {},
      'presencezone:200': { id: 200, value: false, num_objects: 0 },
      'presencezone:201': { id: 201, value: false, num_objects: 0 },
      'illuminance:0': { id: 0, lux: 5, illumination: 'dark' },
    },
    methods: ['Shelly.GetConfig'],
    revision: 5,
    statusSequence: 1,
  });
}
