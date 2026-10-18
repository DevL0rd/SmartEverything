import type { MemoryPart } from '@smarteverything/domain';
import type { MemorySegment } from '../../../components/charts';

const BYTES_PER_GB = 1_000_000_000;

export interface MemoryBarModel {
  readonly total: number;
  readonly percent: number;
  readonly segments: readonly MemorySegment[];
}

function gigabytes(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 10) / 10;
}

export function memorySegments(memory: MemoryPart): MemoryBarModel {
  const used = memory.usedBytes;
  const cache = memory.cachedBytes + memory.buffersBytes;
  const free = Math.max(0, memory.totalBytes - used - cache);
  return {
    total: Math.round(memory.totalBytes / BYTES_PER_GB),
    percent: memory.totalBytes === 0 ? 0 : Math.round((used / memory.totalBytes) * 100),
    segments: [
      { label: 'Used', value: gigabytes(used), colour: 'viz-blue' },
      { label: 'Cache', value: gigabytes(cache), colour: 'viz-magenta' },
      { label: 'Free', value: gigabytes(free) },
    ],
  };
}
