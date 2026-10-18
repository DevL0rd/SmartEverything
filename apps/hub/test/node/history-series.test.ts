import { describe, expect, it } from 'vitest';
import { seriesOf } from '../../src/node/collectors/history-series';
import { CPU, GPU, SUMMARY } from './sample-parts';

describe('seriesOf', () => {
  it('turns a summary into one numeric series per headline value', () => {
    const points = seriesOf({ summary: SUMMARY });
    expect(points.find((point) => point.key === 'cpuLoad')).toEqual({
      topic: 'summary',
      key: 'cpuLoad',
      unit: '%',
      value: 12.5,
    });
    expect(points.find((point) => point.key === 'fullestDiskPercent')?.value).toBe(71.2);
    expect(points.find((point) => point.key === 'gpuTemperature')?.value).toBeNull();
  });

  it('gives each cpu core its own series', () => {
    const keys = seriesOf({ cpu: CPU }).map((point) => point.key);
    expect(keys).toEqual(expect.arrayContaining(['load', 'core0', 'core1', 'frequencyGhz']));
  });

  it('prefixes gpu series with the gpu id', () => {
    const keys = seriesOf({ gpu: { gpus: [GPU] } }).map((point) => point.key);
    expect(keys).toContain('nvidia-0.load');
    expect(keys).toContain('nvidia-0.memoryUsedBytes');
  });

  it('keeps two sensors with the same chip and label apart', () => {
    const sensor = {
      chip: 'nvme',
      label: 'Composite',
      celsius: 40,
      highCelsius: null,
      criticalCelsius: null,
    };
    const points = seriesOf({
      sensors: {
        sensors: [sensor, { ...sensor, celsius: 41 }],
        fans: [{ label: 'cpu', rpm: 900, maxRpm: null }],
      },
    });
    expect(points.map((point) => point.key)).toEqual([
      'nvme.Composite',
      'nvme.Composite#2',
      'fan.cpu',
    ]);
  });

  it('skips power values that are not measured', () => {
    expect(seriesOf({ power: { totalWatts: null, batteryWatts: null } })).toEqual([]);
  });

  it('records nothing for a topic that was not read', () => {
    expect(seriesOf({})).toEqual([]);
  });
});
