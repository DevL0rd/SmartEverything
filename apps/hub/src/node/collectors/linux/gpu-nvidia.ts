import type { GpuSnapshot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const QUERY = [
  'index',
  'name',
  'utilization.gpu',
  'memory.used',
  'memory.total',
  'temperature.gpu',
  'power.draw',
  'power.limit',
  'clocks.gr',
  'clocks.max.gr',
].join(',');

const MIB = 1024 * 1024;
const DRIVER_FILE = '/proc/driver/nvidia/version';

export function hasNvidiaDriver(): boolean {
  return existsSync(DRIVER_FILE);
}
const RESTART_MS = 5000;

function measured(field: string | undefined): number | null {
  const value = Number(field);
  return field === undefined || field.includes('N/A') || !Number.isFinite(value) ? null : value;
}

export function parseNvidiaLine(line: string): [number, GpuSnapshot] | null {
  const fields = line.split(',').map((field) => field.trim());
  const [index, name, load, used, total, temperature, power, limit, clock, maxClock] = fields;
  const position = measured(index);
  if (position === null || name === undefined || name === '') {
    return null;
  }
  return [
    position,
    {
      name,
      vendor: 'nvidia',
      load: measured(load) ?? 0,
      memoryUsedBytes: (measured(used) ?? 0) * MIB,
      memoryTotalBytes: (measured(total) ?? 0) * MIB,
      temperature: measured(temperature),
      powerWatts: measured(power),
      powerLimitWatts: measured(limit),
      clockMhz: measured(clock),
      maxClockMhz: measured(maxClock),
    },
  ];
}

export class NvidiaStream {
  private child: ChildProcess | null = null;
  private intervalMs = 0;
  private stopped = false;
  private restart: NodeJS.Timeout | null = null;
  private readonly latest = new Map<number, GpuSnapshot>();

  constructor(private readonly log: Logger) {}

  gpus(): GpuSnapshot[] {
    return [...this.latest.entries()].sort(([a], [b]) => a - b).map(([, gpu]) => gpu);
  }

  pace(intervalMs: number): void {
    if (intervalMs === this.intervalMs && this.child !== null) {
      return;
    }
    this.intervalMs = intervalMs;
    this.stopped = false;
    this.child?.kill();
    this.launch();
  }

  stop(): void {
    this.stopped = true;
    if (this.restart !== null) {
      clearTimeout(this.restart);
    }
    this.child?.kill();
    this.child = null;
  }

  private launch(): void {
    const args = [
      `--query-gpu=${QUERY}`,
      '--format=csv,noheader,nounits',
      `-lms`,
      String(this.intervalMs),
    ];
    const child = spawn('nvidia-smi', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      const parsed = parseNvidiaLine(line);
      if (parsed !== null) {
        this.latest.set(parsed[0], parsed[1]);
      }
    });
    child.once('error', (cause) => {
      this.stopped = true;
      this.log.warn('node.nvidia_unavailable', { reason: cause.message });
    });
    child.once('exit', (code) => {
      this.exited(child, code);
    });
  }

  private exited(child: ChildProcess, code: number | null): void {
    if (this.child !== child || this.stopped) {
      return;
    }
    this.child = null;
    this.latest.clear();
    this.log.warn('node.nvidia_stream_ended', { code });
    this.restart = setTimeout(() => {
      this.restart = null;
      if (!this.stopped && this.child === null) {
        this.launch();
      }
    }, RESTART_MS);
  }
}
