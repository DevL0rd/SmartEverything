import { describe, expect, it } from 'vitest';
import { KernelFiles } from '../../src/node/collectors/linux/kernel-file';
import {
  MemoryCollector,
  MeminfoFieldMissingError,
  readUptimeSeconds,
} from '../../src/node/collectors/linux/memory';
import { pageBytes } from '../../src/node/collectors/linux/page-size';
import type { Tick } from '../../src/node/collectors/tick';

class ScriptedFiles extends KernelFiles {
  reads: Record<string, number> = {};

  constructor(public contents: Record<string, string>) {
    super();
  }

  override read(path: string): string {
    this.reads[path] = (this.reads[path] ?? 0) + 1;
    const text = this.contents[path];
    if (text === undefined) {
      throw new Error(`${path} was not scripted`);
    }
    return text;
  }
}

const MEMINFO = [
  'MemTotal:       16000000 kB',
  'MemFree:         2000000 kB',
  'MemAvailable:    6000000 kB',
  'Buffers:          100000 kB',
  'Cached:          3000000 kB',
  'SReclaimable:     200000 kB',
  'Shmem:            400000 kB',
  'SwapTotal:       4000000 kB',
  'SwapFree:        3500000 kB',
  'HugePages_Total:       0',
].join('\n');

function tick(at: number): Tick {
  return { at, key: false };
}

describe('MemoryCollector', () => {
  it('reports used memory as total minus available, and the composition, in bytes rounded to a thousandth of the total', () => {
    const files = new ScriptedFiles({
      '/proc/meminfo': MEMINFO,
      '/proc/vmstat': 'pswpin 0\npswpout 0\n',
    });
    const part = new MemoryCollector(files).part(tick(1000));
    expect(part).toMatchObject({
      usedBytes: 10_000_000 * 1024,
      totalBytes: 16_000_000 * 1024,
      availableBytes: 6_000_000 * 1024,
      cachedBytes: 2_800_000 * 1024,
      freeBytes: 2_000_000 * 1024,
      swapTotalBytes: 4_000_000 * 1024,
      swapInRate: 0,
      swapOutRate: 0,
    });
    const thousandth = (16_000_000 * 1024) / 1000;
    expect(Math.abs(part.buffersBytes - 100_000 * 1024)).toBeLessThanOrEqual(thousandth);
    expect(Math.abs(part.swapUsedBytes - 500_000 * 1024)).toBeLessThanOrEqual(thousandth);
  });

  it('turns the swap page counters into bytes per second', () => {
    const files = new ScriptedFiles({
      '/proc/meminfo': MEMINFO,
      '/proc/vmstat': 'pswpin 100\npswpout 50\n',
    });
    const collector = new MemoryCollector(files);
    collector.part(tick(1000));
    files.contents['/proc/vmstat'] = 'pswpin 300\npswpout 50\n';
    const part = collector.part(tick(3000));
    expect(part.swapInRate).toBe(Number(((200 * pageBytes()) / 2).toPrecision(3)));
    expect(part.swapOutRate).toBe(0);
  });

  it('shares one /proc/meminfo read between the summary and the memory part of a tick', () => {
    const files = new ScriptedFiles({
      '/proc/meminfo': MEMINFO,
      '/proc/vmstat': 'pswpin 0\npswpout 0\n',
    });
    const collector = new MemoryCollector(files);
    const shared = tick(1000);
    expect(collector.use(shared)).toEqual({ memoryPercent: 62.5, swapPercent: 12.5 });
    collector.part(shared);
    expect(files.reads['/proc/meminfo']).toBe(1);
  });

  it('has no swap percentage when there is no swap', () => {
    const files = new ScriptedFiles({
      '/proc/meminfo': MEMINFO.replace('SwapTotal:       4000000', 'SwapTotal:       0').replace(
        'SwapFree:        3500000',
        'SwapFree:        0',
      ),
    });
    expect(new MemoryCollector(files).use(tick(1)).swapPercent).toBeNull();
  });

  it('names the line that is missing', () => {
    const files = new ScriptedFiles({ '/proc/meminfo': 'MemTotal: 10 kB\nSwapTotal: 0 kB\n' });
    const collector = new MemoryCollector(files);
    expect(() => collector.use(tick(1))).toThrow(MeminfoFieldMissingError);
    expect(() => collector.use(tick(2))).toThrow('MemAvailable');
  });
});

describe('readUptimeSeconds', () => {
  it('reads the first number of /proc/uptime', () => {
    expect(readUptimeSeconds(new ScriptedFiles({ '/proc/uptime': '12345.67 54321.00\n' }))).toBe(
      12_345.67,
    );
  });
});
