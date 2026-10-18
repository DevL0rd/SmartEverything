import { describe, expect, it } from 'vitest';
import { powerPartOf, summaryOf, totalWattsOf } from '../../src/node/collectors/linux/summary';
import { GPU } from './sample-parts';

const BASE = {
  cpuLoad: 12.34,
  cpuTemperature: 55,
  cpuWatts: 10,
  memory: { memoryPercent: 40, swapPercent: null },
  gpus: [],
  download: 1234.5,
  upload: 10,
  fullestDisk: { mount: '/', percent: 70 },
  battery: null,
  processCount: 300,
  uptimeSeconds: 1234,
};

const BATTERY = {
  level: 80,
  state: 'discharging' as const,
  pluggedIn: false,
  minutesLeft: 100,
  healthPercent: 90,
  drawWatts: 18,
};

describe('summaryOf', () => {
  it('has no gpu or battery values on a machine without them', () => {
    expect(summaryOf(BASE)).toMatchObject({
      cpuLoad: 12.3,
      gpuLoad: null,
      gpuWatts: null,
      batteryLevel: null,
      charging: null,
      totalWatts: 10,
      downloadRate: 1230,
    });
  });

  it('takes the busiest gpu and rounds uptime to ten seconds', () => {
    const quiet = { ...GPU, id: 'amd-card0', load: 1, temperature: 30, powerWatts: 5 };
    const summary = summaryOf({ ...BASE, gpus: [quiet, GPU] });
    expect(summary).toMatchObject({
      gpuLoad: 5,
      gpuTemperature: 40,
      gpuMemoryPercent: 12.5,
      gpuWatts: 25,
      uptimeSeconds: 1230,
    });
  });

  it('reports the battery and whether it charges', () => {
    expect(summaryOf({ ...BASE, battery: { ...BATTERY, state: 'charging' } })).toMatchObject({
      batteryLevel: 80,
      charging: true,
    });
  });
});

describe('total power', () => {
  it('is the battery draw while on battery and the known parts otherwise', () => {
    expect(totalWattsOf(10, 20, BATTERY)).toBe(18);
    expect(totalWattsOf(10, 20, { ...BATTERY, state: 'charging' })).toBe(30);
    expect(totalWattsOf(null, 20, null)).toBe(20);
    expect(totalWattsOf(null, null, null)).toBeNull();
  });

  it('builds the power part from processor, graphics and battery', () => {
    expect(powerPartOf(10, [GPU], BATTERY)).toEqual({ totalWatts: 18, batteryWatts: 18 });
    expect(powerPartOf(null, [], null)).toEqual({ totalWatts: null, batteryWatts: null });
  });
});
