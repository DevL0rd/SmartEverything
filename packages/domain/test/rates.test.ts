import { describe, expect, it } from 'vitest';
import { cpuBusyPercent, perSecond } from '../src/rates';

describe('perSecond', () => {
  it('divides the growth of a counter by the elapsed seconds', () => {
    expect(perSecond(3_000, 1_000, 2)).toBe(1_000);
  });

  it('is zero without a previous sample, without elapsed time or after a counter reset', () => {
    expect(perSecond(3_000, undefined, 2)).toBe(0);
    expect(perSecond(3_000, 1_000, 0)).toBe(0);
    expect(perSecond(100, 1_000, 2)).toBe(0);
  });

  it('is zero for a counter that did not move', () => {
    expect(perSecond(1_000, 1_000, 2)).toBe(0);
  });
});

describe('cpuBusyPercent', () => {
  const before = [100, 0, 100, 700, 100, 0, 0, 0];

  it('is the share of non-idle time between two /proc/stat samples', () => {
    const now = [150, 0, 150, 800, 100, 0, 0, 0];
    expect(cpuBusyPercent(now, before)).toBe(50);
  });

  it('counts iowait as idle', () => {
    const now = [100, 0, 100, 700, 200, 0, 0, 0];
    expect(cpuBusyPercent(now, before)).toBe(0);
  });

  it('ignores guest time, which the kernel already counts as user time', () => {
    const now = [150, 0, 150, 800, 100, 0, 0, 0, 5_000, 5_000];
    expect(cpuBusyPercent(now, before)).toBe(50);
  });

  it('is zero without a previous sample or when no time passed', () => {
    expect(cpuBusyPercent(before, undefined)).toBe(0);
    expect(cpuBusyPercent(before, before)).toBe(0);
  });

  it('stays within 0 to 100 when the counters reset between samples', () => {
    expect(cpuBusyPercent([10, 0, 0, 0], [0, 0, 0, 5])).toBe(100);
    expect(cpuBusyPercent([0, 0, 0, 10], [5, 0, 0, 0])).toBe(0);
  });

  it('reads a sample with missing columns as idle-free time', () => {
    expect(cpuBusyPercent([], [])).toBe(0);
    expect(cpuBusyPercent([10], [0])).toBe(100);
  });
});
