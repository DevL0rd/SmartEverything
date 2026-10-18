import { describe, expect, it } from 'vitest';
import { href } from '../../../app-shell/hrefs';
import type { ComputerSummary } from '@smarteverything/domain';
import {
  readingsOfHeadlines,
  readingsOfSummary,
  stripColumnsOf,
  stripItems,
  type StripInput,
  type StripSeries,
} from './computer-strip';

const SUMMARY: ComputerSummary = {
  cpuLoad: 21.4,
  cpuTemperature: 46,
  memoryPercent: 41,
  swapPercent: null,
  gpuLoad: 60,
  gpuTemperature: 70,
  gpuMemoryPercent: 50,
  cpuWatts: 30,
  gpuWatts: 110,
  downloadRate: 4_400_000,
  uploadRate: 120_000,
  fullestDisk: { mount: '/mnt/games', percent: 98 },
  batteryLevel: null,
  charging: null,
  totalWatts: 140,
  processCount: 412,
  uptimeSeconds: 100,
};

const TREND = [
  { t: 1, v: 10 },
  { t: 2, v: 12 },
];

const SERIES: StripSeries = {
  'summary/cpuLoad': TREND,
  'summary/gpuLoad': TREND,
  'summary/memoryPercent': TREND,
  'summary/downloadRate': TREND,
  'summary/batteryLevel': TREND,
  'summary/totalWatts': TREND,
};

const INPUT: StripInput = {
  readings: readingsOfSummary(SUMMARY),
  series: SERIES,
  offline: false,
  target: (page) => href.settings.device('computer-1', page),
};

describe('stripItems', () => {
  it('shows CPU, GPU, Memory, Disk, Network and Power for a desktop with a graphics card', () => {
    const items = stripItems(INPUT);
    expect(items.map((item) => [item.label, item.value, item.unit])).toEqual([
      ['CPU', '21', '%'],
      ['GPU', '60', '%'],
      ['Memory', '41', '%'],
      ['Disk', '98', '% full'],
      ['Network', '4.4', 'MB/s'],
      ['Power', '140', 'W'],
    ]);
  });

  it('leaves out the GPU, and shows Battery instead of Power on a laptop', () => {
    const items = stripItems({
      ...INPUT,
      readings: readingsOfSummary({ ...SUMMARY, gpuLoad: null, batteryLevel: 78 }),
    });
    expect(items.map((item) => item.label)).toEqual([
      'CPU',
      'Memory',
      'Disk',
      'Network',
      'Battery',
    ]);
  });

  it('names the worst disk, with its word and tone', () => {
    const disk = stripItems(INPUT).find((item) => item.key === 'disk');
    expect(disk?.caption).toBe('Almost full · /mnt/games');
    expect(disk?.tone).toBe('critical');
  });

  it('warns on a very busy processor but never on memory', () => {
    const busy = stripItems({
      ...INPUT,
      readings: readingsOfSummary({ ...SUMMARY, cpuLoad: 95, memoryPercent: 97 }),
    });
    expect(busy.find((item) => item.key === 'cpu')?.tone).toBe('warning');
    expect(busy.find((item) => item.key === 'memory')?.tone).toBeUndefined();
  });

  it('links each tile to the page that explains it', () => {
    const hrefs = stripItems(INPUT).map((item) => item.href);
    expect(hrefs).toEqual(
      ['performance', 'performance', 'performance', 'storage', 'network', 'system'].map((page) =>
        href.settings.device('computer-1', page),
      ),
    );
  });

  it('draws a sparkline only while online and when the series really moves', () => {
    const moving = Array.from({ length: 30 }, (_, index) => ({ t: index * 1000, v: index * 2 }));
    const flat = moving.map((point) => ({ ...point, v: 80 }));
    const series = { ...SERIES, 'summary/cpuLoad': moving, 'summary/memoryPercent': flat };
    const items = stripItems({ ...INPUT, series });
    expect(items[0]?.series?.length).toBeGreaterThanOrEqual(4);
    expect(items.find((item) => item.key === 'memory')?.series).toBeUndefined();
    expect(stripItems({ ...INPUT, series, offline: true })[0]?.series).toBeUndefined();
    const sparse = { ...SERIES, 'summary/cpuLoad': [{ t: 1, v: 1 }] };
    expect(stripItems({ ...INPUT, series: sparse })[0]?.series).toBeUndefined();
  });

  it('greys every tile when offline and waits with dashes before the first reading', () => {
    expect(stripItems({ ...INPUT, offline: true }).every((item) => item.stale === true)).toBe(true);
    const waiting = stripItems({ ...INPUT, readings: undefined });
    expect(waiting.map((item) => item.label)).toEqual(['CPU', 'Memory', 'Disk', 'Network']);
    expect(waiting.every((item) => item.value === '--' && item.stale === true)).toBe(true);
  });
});

describe('stripColumnsOf', () => {
  it('uses two columns on a phone, three beside a rail and six on a wide desktop', () => {
    expect(stripColumnsOf(390)).toBe(2);
    expect(stripColumnsOf(840)).toBe(3);
    expect(stripColumnsOf(1440)).toBe(6);
  });
});

describe('readingsOfHeadlines', () => {
  const at = '2026-10-17T14:02:00.000Z';
  const values = {
    cpu_load: { value: 12, observedAt: at },
    memory_used: { value: 40, observedAt: at },
    disk_used: { value: 63, observedAt: at },
    download_rate: { value: 2_000_000, observedAt: at },
  };

  it('shows the last reported values greyed when the computer is offline', () => {
    const items = stripItems({ ...INPUT, readings: readingsOfHeadlines(values), offline: true });
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ['CPU', '12'],
      ['Memory', '40'],
      ['Disk', '63'],
      ['Network', '2.0'],
    ]);
    expect(items.every((item) => item.stale === true)).toBe(true);
  });

  it('knows nothing when the computer never reported', () => {
    expect(readingsOfHeadlines({})).toBeUndefined();
  });
});
