import type { MemorySnapshot } from '@smarteverything/domain';
import type { KernelFiles } from './kernel-file';

const KIB = 1024;

export class MeminfoFieldMissingError extends Error {
  override readonly name = 'MeminfoFieldMissingError';

  constructor(field: string) {
    super(`/proc/meminfo has no ${field} line.`);
  }
}

function fieldsOf(text: string): Map<string, number> {
  const fields = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      fields.set(match[1], Number(match[2]) * KIB);
    }
  }
  return fields;
}

function required(fields: ReadonlyMap<string, number>, name: string): number {
  const value = fields.get(name);
  if (value === undefined) {
    throw new MeminfoFieldMissingError(name);
  }
  return value;
}

export function readMemory(files: KernelFiles): MemorySnapshot {
  const fields = fieldsOf(files.read('/proc/meminfo'));
  const total = required(fields, 'MemTotal');
  const swapTotal = required(fields, 'SwapTotal');
  return {
    usedBytes: total - required(fields, 'MemAvailable'),
    totalBytes: total,
    swapUsedBytes: swapTotal - required(fields, 'SwapFree'),
    swapTotalBytes: swapTotal,
  };
}

export function readUptimeSeconds(files: KernelFiles): number {
  return Number(files.read('/proc/uptime').split(' ', 1)[0]);
}
