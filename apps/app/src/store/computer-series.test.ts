import { describe, expect, it } from 'vitest';
import { readingsOf } from './computer-series';

describe('series of live parts', () => {
  it('names series like the hub history does so backfill and live points join', () => {
    const readings = readingsOf({
      cpu: {
        load: 5,
        cores: [4, 6],
        frequenciesGhz: [3],
        performanceLoad: null,
        efficiencyLoad: null,
        frequencyGhz: 3,
        maxFrequencyGhz: null,
        temperature: null,
        powerWatts: null,
        powerLimitWatts: null,
        loadAverage: [0, 0, 0],
        throttled: null,
      },
      network: {
        downloadRate: 10,
        uploadRate: 2,
        interfaces: [
          {
            name: 'wlan0',
            kind: 'wifi',
            state: 'up',
            speedMbps: null,
            signalPercent: 70,
            addresses: [],
            downloadRate: 10,
            uploadRate: 2,
          },
        ],
      },
      sensors: {
        sensors: [
          { chip: 'k10', label: 'Tctl', celsius: 40, highCelsius: null, criticalCelsius: null },
          { chip: 'k10', label: 'Tctl', celsius: 41, highCelsius: null, criticalCelsius: null },
        ],
        fans: [{ label: 'cpu', rpm: 900, maxRpm: null }],
      },
    });
    const byId = new Map(readings);
    expect(byId.get('cpu/load')).toBe(5);
    expect(byId.get('cpu/core1')).toBe(6);
    expect(byId.get('network/downloadRate')).toBe(10);
    expect(byId.get('network/wlan0.signalPercent')).toBe(70);
    expect(byId.get('sensors/k10.Tctl')).toBe(40);
    expect(byId.get('sensors/k10.Tctl#2')).toBe(41);
    expect(byId.get('sensors/fan.cpu')).toBe(900);
  });
});
