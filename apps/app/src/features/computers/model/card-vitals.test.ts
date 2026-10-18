import { describe, expect, it } from 'vitest';
import {
  bucketLoads,
  levelOf,
  specsOf,
  vitalLines,
  vitalsOfHeadlines,
  vitalsOfSummary,
} from './card-vitals';

const AT = '2026-10-17T14:02:00.000Z';

describe('card vitals', () => {
  it('always lists processor, graphics and memory with their temperatures', () => {
    const lines = vitalLines({
      cpu: 24,
      cpuTemperature: 46,
      gpu: 64,
      gpuTemperature: 70,
      ram: 41,
    });
    expect(lines.map((line) => line.text)).toEqual([
      'CPU 24 % · 46 °C',
      'GPU 64 % · 70 °C',
      'RAM 41 %',
    ]);
    expect(lines[0]?.spoken).toBe('CPU 24 percent, 46 degrees');
  });

  it('leaves the graphics line out when there is no graphics card', () => {
    const lines = vitalLines({
      cpu: 5,
      cpuTemperature: null,
      gpu: null,
      gpuTemperature: null,
      ram: 9,
    });
    expect(lines.map((line) => line.key)).toEqual(['cpu', 'ram']);
    expect(lines[0]?.text).toBe('CPU 5 %');
  });

  it('reads the last reported values offline, and nothing before the first report', () => {
    const values = {
      cpu_load: { value: 12.4, observedAt: AT },
      cpu_temperature: { value: 51, observedAt: AT },
      gpu_load: { value: 30, observedAt: AT },
      gpu_temperature: { value: 60, observedAt: AT },
      memory_used: { value: 40, observedAt: AT },
    };
    expect(vitalsOfHeadlines(values)).toEqual({
      cpu: 12,
      cpuTemperature: 51,
      gpu: 30,
      gpuTemperature: 60,
      ram: 40,
    });
    expect(vitalsOfHeadlines({})).toBeNull();
    expect(vitalsOfSummary(undefined)).toBeNull();
  });

  it('grades a reading as normal, warm or hot', () => {
    expect([40, 74, 75, 89, 90, 100].map(levelOf)).toEqual([
      'normal',
      'normal',
      'warm',
      'warm',
      'hot',
      'hot',
    ]);
  });

  it('marks a line by the worse of its load and temperature', () => {
    const lines = vitalLines({
      cpu: 20,
      cpuTemperature: 92,
      gpu: 80,
      gpuTemperature: 50,
      ram: 30,
    });
    expect(lines.map((line) => line.level)).toEqual(['hot', 'warm', 'normal']);
  });

  it('offers a graphics tile only when there is a graphics card', () => {
    const base = { cpu: 5, cpuTemperature: 40, ram: 9 };
    expect(specsOf({ ...base, gpu: null, gpuTemperature: null }).map((spec) => spec.key)).toEqual([
      'cpu',
      'ram',
    ]);
    expect(specsOf({ ...base, gpu: 1, gpuTemperature: 30 }).map((spec) => spec.key)).toEqual([
      'cpu',
      'gpu',
      'ram',
    ]);
  });

  it('averages many threads into at most the wanted number of bars', () => {
    const threads = Array.from({ length: 128 }, (_, index) => (index < 64 ? 0 : 100));
    const bars = bucketLoads(threads, 32);
    expect(bars).toHaveLength(32);
    expect(bars[0]).toBe(0);
    expect(bars[31]).toBe(100);
    expect(bucketLoads([1, 2, 3], 32)).toEqual([1, 2, 3]);
    expect(
      bucketLoads(
        Array.from({ length: 40 }, () => 50),
        32,
      ),
    ).toHaveLength(20);
  });
});
