import { describe, expect, it } from 'vitest';
import type { HwmonInputs } from '../../src/node/collectors/linux/hwmon';
import { KernelFiles } from '../../src/node/collectors/linux/kernel-file';
import { SensorCollector } from '../../src/node/collectors/linux/sensors';
import type { Tick } from '../../src/node/collectors/tick';

const SLOW_MS = 1.5;

class ScriptedFiles extends KernelFiles {
  values: Record<string, string> = {
    '/h/cpu': '55000',
    '/h/nvme': '41000',
    '/h/fan': '1200',
  };
  reads: Record<string, number> = {};
  failing = new Set<string>();

  override read(path: string): string {
    this.reads[path] = (this.reads[path] ?? 0) + 1;
    if (this.failing.has(path)) {
      throw new Error(`${path} vanished`);
    }
    if (path === '/h/nvme') {
      const until = performance.now() + SLOW_MS;
      while (performance.now() < until) {
        continue;
      }
    }
    return this.values[path] ?? '0';
  }
}

function inputs(withNvme = true): HwmonInputs {
  return {
    temperatures: [
      {
        chip: 'coretemp',
        label: 'Package id 0',
        path: '/h/cpu',
        cpuRole: 'package',
        highCelsius: 100,
        criticalCelsius: 110,
      },
      ...(withNvme
        ? [
            {
              chip: 'nvme',
              label: 'Composite',
              path: '/h/nvme',
              cpuRole: null,
              highCelsius: 80,
              criticalCelsius: null,
            },
          ]
        : []),
    ],
    fans: [{ label: 'cpu', path: '/h/fan', maxRpm: 5000 }],
  };
}

function tick(at: number): Tick {
  return { at, key: false };
}

describe('SensorCollector', () => {
  it('reads fast inputs every tick and slow ones every ten seconds, keeping the last value between', () => {
    const files = new ScriptedFiles();
    const collector = new SensorCollector(
      files,
      () => undefined,
      () => inputs(),
    );
    collector.read(tick(0));
    const slowAfterScan = files.reads['/h/nvme'] ?? 0;
    const fastAfterScan = files.reads['/h/cpu'] ?? 0;
    for (let at = 1000; at <= 9000; at += 1000) {
      expect(collector.read(tick(at)).sensors[0]?.celsius).toBe(41);
    }
    expect(files.reads['/h/nvme']).toBe(slowAfterScan);
    expect(files.reads['/h/cpu']).toBe(fastAfterScan + 9);
    files.values['/h/nvme'] = '43000';
    expect(collector.read(tick(10_000)).sensors[0]?.celsius).toBe(43);
    expect(files.reads['/h/nvme']).toBe(slowAfterScan + 1);
  });

  it('reports the processor temperature and leaves it out of the sensor list', () => {
    const collector = new SensorCollector(
      new ScriptedFiles(),
      () => undefined,
      () => inputs(),
    );
    const reading = collector.read(tick(0));
    expect(reading.cpuTemperature).toBe(55);
    expect(reading.sensors.map((sensor) => sensor.label)).toEqual(['Composite']);
    expect(reading.sensors[0]).toMatchObject({ highCelsius: 80, criticalCelsius: null });
    expect(reading.fans).toEqual([{ label: 'cpu', rpm: 1200, maxRpm: 5000 }]);
  });

  it('reads once per tick however many topics ask', () => {
    const files = new ScriptedFiles();
    const collector = new SensorCollector(
      files,
      () => undefined,
      () => inputs(),
    );
    const shared = tick(0);
    collector.read(shared);
    const before = files.reads['/h/cpu'];
    collector.read(shared);
    expect(collector.celsiusAt(shared, '/h/nvme')).toBe(41);
    expect(files.reads['/h/cpu']).toBe(before);
  });

  it('survives an input that disappears: reports it, drops it at the next scan, keeps the rest', () => {
    const files = new ScriptedFiles();
    const failures: string[] = [];
    let present = true;
    const collector = new SensorCollector(
      files,
      (source) => failures.push(source),
      () => inputs(present),
    );
    collector.read(tick(0));
    present = false;
    files.failing.add('/h/nvme');
    const slowTick = collector.read(tick(10_000));
    expect(slowTick.cpuTemperature).toBe(55);
    expect(slowTick.sensors).toEqual([]);
    expect(failures).toEqual(['sensor /h/nvme']);
    expect(collector.read(tick(11_000)).sensors).toEqual([]);
    expect(failures).toHaveLength(1);
  });

  it('knows whether the machine has fans', () => {
    expect(
      new SensorCollector(
        new ScriptedFiles(),
        () => undefined,
        () => inputs(),
      ).hasFans(0),
    ).toBe(true);
  });
});
