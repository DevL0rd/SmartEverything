import { describe, expect, it } from 'vitest';
import { CpuCollector, parseCpuList, parseCpuTimes } from '../../src/node/collectors/linux/cpu';
import { KernelFiles } from '../../src/node/collectors/linux/kernel-file';
import type { Tick } from '../../src/node/collectors/tick';

class ScriptedFiles extends KernelFiles {
  stat = '';
  loadavg = '0.00 0.00 0.00 1/100 1';
  reads = 0;

  override read(path: string): string {
    this.reads += path === '/proc/stat' ? 1 : 0;
    if (path === '/proc/stat') {
      return this.stat;
    }
    if (path === '/proc/loadavg') {
      return this.loadavg;
    }
    return '0';
  }
}

function tick(at: number): Tick {
  return { at, key: false };
}

describe('parseCpuList', () => {
  it('expands single numbers and ranges and ignores the trailing newline', () => {
    expect(parseCpuList('0-3,8,10-11\n')).toEqual([0, 1, 2, 3, 8, 10, 11]);
    expect(parseCpuList('5')).toEqual([5]);
    expect(parseCpuList('2-2')).toEqual([2]);
  });

  it('gives nothing for an empty list and skips parts that are not numbers', () => {
    expect(parseCpuList('')).toEqual([]);
    expect(parseCpuList('\n')).toEqual([]);
    expect(parseCpuList('a,1,,3-b')).toEqual([1, 3]);
  });
});

describe('parseCpuTimes', () => {
  it('keeps the total line and each processor line and drops everything else', () => {
    const times = parseCpuTimes('cpu  1 2 3\ncpu0 4 5 6\ncpu12 7 8 9\nintr 5\nctxt 7\n');
    expect([...times.keys()]).toEqual(['cpu', 'cpu0', 'cpu12']);
    expect(times.get('cpu12')).toEqual([7, 8, 9]);
  });
});

describe('CpuCollector reading /proc/stat', () => {
  it('reports no load on the first sample, then the busy share between samples', () => {
    const files = new ScriptedFiles();
    const collector = new CpuCollector(files, 1);
    files.stat = 'cpu 100 0 100 800 0 0 0 0\ncpu0 100 0 100 800 0 0 0 0\n';
    expect(collector.loads(tick(1))).toMatchObject({ load: 0, cores: [0] });
    files.stat = 'cpu 100 0 100 1800 0 0 0 0\ncpu0 100 0 100 1800 0 0 0 0\n';
    expect(collector.loads(tick(2))).toMatchObject({ load: 0, cores: [0] });
    files.stat = 'cpu 600 0 600 2800 0 0 0 0\ncpu0 600 0 600 2800 0 0 0 0\n';
    expect(collector.loads(tick(3))).toMatchObject({ load: 50, cores: [50] });
  });

  it('reads /proc/stat once per tick however many topics ask', () => {
    const files = new ScriptedFiles();
    const collector = new CpuCollector(files, 1);
    files.stat = 'cpu 1 0 1 8\ncpu0 1 0 1 8\n';
    const shared = tick(1);
    collector.loads(shared);
    collector.part(shared, { temperature: null, powerWatts: null, powerLimitWatts: null });
    collector.loads(shared);
    expect(files.reads).toBe(1);
    collector.loads(tick(2));
    expect(files.reads).toBe(2);
  });

  it('reports a core that /proc/stat does not list as idle and ignores lines that are not CPUs', () => {
    const files = new ScriptedFiles();
    const collector = new CpuCollector(files, 3);
    files.stat = 'cpu 0 0 0 100\ncpu0 0 0 0 100\nintr 5\nctxt 7\n';
    collector.loads(tick(1));
    files.stat = 'cpu 100 0 0 100\ncpu0 100 0 0 100\nintr 9\nctxt 8\n';
    const reading = collector.loads(tick(2));
    expect(reading.cores).toEqual([100, 0, 0]);
    expect(reading.load).toBe(100);
  });

  it('builds the part with rounded loads and the one, five and fifteen minute load averages', () => {
    const files = new ScriptedFiles();
    files.loadavg = '1.504 2.25 3.00 2/500 4242\n';
    const collector = new CpuCollector(files, 2);
    files.stat = 'cpu 0 0 0 0\ncpu0 0 0 0 0\ncpu1 0 0 0 0\n';
    collector.loads(tick(1));
    files.stat = 'cpu 10 0 0 20\ncpu0 10 0 0 10\ncpu1 0 0 0 10\n';
    const part = collector.part(tick(2), { temperature: 55, powerWatts: 9.5, powerLimitWatts: 65 });
    expect(part).toMatchObject({
      load: 33.3,
      cores: [50, 0],
      loadAverage: [1.5, 2.25, 3],
      temperature: 55,
      powerWatts: 9.5,
      throttled: null,
    });
  });

  it('counts a counter that went backwards as no load', () => {
    const files = new ScriptedFiles();
    const collector = new CpuCollector(files, 1);
    files.stat = 'cpu 500 0 500 1000\ncpu0 500 0 500 1000\n';
    collector.loads(tick(1));
    files.stat = 'cpu 10 0 10 20\ncpu0 10 0 10 20\n';
    expect(collector.loads(tick(2)).load).toBe(0);
  });
});
