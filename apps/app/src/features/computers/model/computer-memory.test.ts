import { describe, expect, it } from 'vitest';
import type { MemoryPart } from '@smarteverything/domain';
import { memorySegments } from './computer-memory';

const GB = 1_000_000_000;

const MEMORY: MemoryPart = {
  usedBytes: 13.2 * GB,
  totalBytes: 32 * GB,
  availableBytes: 18 * GB,
  cachedBytes: 9 * GB,
  buffersBytes: 0.8 * GB,
  freeBytes: 8.9 * GB,
  swapUsedBytes: 0,
  swapTotalBytes: 0,
  swapInRate: 0,
  swapOutRate: 0,
};

describe('memorySegments', () => {
  it('splits memory into used, cache and free gigabytes of the total', () => {
    const bar = memorySegments(MEMORY);
    expect(bar.total).toBe(32);
    expect(bar.percent).toBe(41);
    expect(bar.segments.map((segment) => [segment.label, segment.value])).toEqual([
      ['Used', 13.2],
      ['Cache', 9.8],
      ['Free', 9],
    ]);
  });

  it('never shows negative free memory', () => {
    const full = memorySegments({ ...MEMORY, usedBytes: 31 * GB });
    expect(full.segments.at(-1)?.value).toBe(0);
  });
});
