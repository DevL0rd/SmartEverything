import type { MemoryPart } from '@smarteverything/domain';
import { bytesOf, percent, rate } from '../rounding';
import { PerTick, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';
import { pageBytes } from './page-size';

const KIB = 1024;

export class MeminfoFieldMissingError extends Error {
  override readonly name = 'MeminfoFieldMissingError';

  constructor(field: string) {
    super(`/proc/meminfo has no ${field} line.`);
  }
}

export interface MemoryUse {
  readonly memoryPercent: number;
  readonly swapPercent: number | null;
}

interface Swapped {
  readonly pagesIn: number;
  readonly pagesOut: number;
  readonly at: number;
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

function swappedOf(text: string, at: number): Swapped {
  const pagesIn = /^pswpin (\d+)$/m.exec(text)?.[1];
  const pagesOut = /^pswpout (\d+)$/m.exec(text)?.[1];
  return { pagesIn: Number(pagesIn ?? 0), pagesOut: Number(pagesOut ?? 0), at };
}

function swapRate(now: number, before: number, seconds: number): number {
  return now < before || seconds <= 0 ? 0 : ((now - before) * pageBytes()) / seconds;
}

export function readUptimeSeconds(files: KernelFiles): number {
  return Number(files.read('/proc/uptime').split(' ', 1)[0]);
}

export class MemoryCollector {
  private readonly meminfo = new PerTick<Map<string, number>>();
  private swapped: Swapped | null = null;

  constructor(private readonly files: KernelFiles) {}

  use(tick: Tick): MemoryUse {
    const fields = this.fields(tick);
    const total = required(fields, 'MemTotal');
    const swapTotal = required(fields, 'SwapTotal');
    return {
      memoryPercent: percent(((total - required(fields, 'MemAvailable')) / total) * 100),
      swapPercent:
        swapTotal === 0
          ? null
          : percent(((swapTotal - required(fields, 'SwapFree')) / swapTotal) * 100),
    };
  }

  part(tick: Tick): MemoryPart {
    const fields = this.fields(tick);
    const total = required(fields, 'MemTotal');
    const swapTotal = required(fields, 'SwapTotal');
    const cached =
      required(fields, 'Cached') + required(fields, 'SReclaimable') - required(fields, 'Shmem');
    const [swapIn, swapOut] = this.swapRates(tick.at);
    const bytes = (value: number): number => bytesOf(Math.max(0, value), total);
    return {
      usedBytes: bytes(total - required(fields, 'MemAvailable')),
      totalBytes: total,
      availableBytes: bytes(required(fields, 'MemAvailable')),
      cachedBytes: bytes(cached),
      buffersBytes: bytes(required(fields, 'Buffers')),
      freeBytes: bytes(required(fields, 'MemFree')),
      swapUsedBytes: bytes(swapTotal - required(fields, 'SwapFree')),
      swapTotalBytes: swapTotal,
      swapInRate: rate(swapIn),
      swapOutRate: rate(swapOut),
    };
  }

  private fields(tick: Tick): Map<string, number> {
    return this.meminfo.get(tick, () => fieldsOf(this.files.read('/proc/meminfo')));
  }

  private swapRates(at: number): [number, number] {
    const now = swappedOf(this.files.read('/proc/vmstat'), at);
    const before = this.swapped;
    this.swapped = now;
    if (before === null) {
      return [0, 0];
    }
    const seconds = (now.at - before.at) / 1000;
    return [
      swapRate(now.pagesIn, before.pagesIn, seconds),
      swapRate(now.pagesOut, before.pagesOut, seconds),
    ];
  }
}
