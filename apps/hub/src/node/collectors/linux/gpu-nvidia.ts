import type { GpuSnapshot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { celsius, orNull, percent, watts } from '../rounding';

const STATIC_QUERY = ['index', 'name', 'memory.total', 'power.limit', 'clocks.max.gr'].join(',');

const LIVE_QUERY = [
  'index',
  'utilization.gpu',
  'memory.used',
  'temperature.gpu',
  'power.draw',
  'clocks.gr',
  'clocks.mem',
  'fan.speed',
  'utilization.encoder',
  'utilization.decoder',
].join(',');

const MIB = 1024 * 1024;
const DRIVER_FILE = '/proc/driver/nvidia/version';
const RESTART_MS = 5000;

interface Fixed {
  readonly name: string;
  readonly memoryTotalBytes: number;
  readonly powerLimitWatts: number | null;
  readonly maxClockMhz: number | null;
}

interface Live {
  readonly load: number;
  readonly memoryUsedBytes: number;
  readonly temperature: number | null;
  readonly powerWatts: number | null;
  readonly clockMhz: number | null;
  readonly memoryClockMhz: number | null;
  readonly fanPercent: number | null;
  readonly encoderLoad: number | null;
  readonly decoderLoad: number | null;
}

export function hasNvidiaDriver(): boolean {
  return existsSync(DRIVER_FILE);
}

function measured(field: string | undefined): number | null {
  const value = Number(field);
  return field === undefined || field.includes('N/A') || !Number.isFinite(value) ? null : value;
}

function fieldsOf(line: string): string[] {
  return line.split(',').map((field) => field.trim());
}

export function parseFixedLine(line: string): [number, Fixed] | null {
  const [index, name, total, limit, maxClock] = fieldsOf(line);
  const position = measured(index);
  if (position === null || name === undefined || name === '') {
    return null;
  }
  return [
    position,
    {
      name,
      memoryTotalBytes: (measured(total) ?? 0) * MIB,
      powerLimitWatts: measured(limit),
      maxClockMhz: measured(maxClock),
    },
  ];
}

export function parseLiveLine(line: string): [number, Live] | null {
  const [index, load, used, temperature, power, clock, memoryClock, fan, encoder, decoder] =
    fieldsOf(line);
  const position = measured(index);
  if (position === null) {
    return null;
  }
  return [
    position,
    {
      load: percent(measured(load) ?? 0),
      memoryUsedBytes: (measured(used) ?? 0) * MIB,
      temperature: orNull(measured(temperature), celsius),
      powerWatts: orNull(measured(power), watts),
      clockMhz: measured(clock),
      memoryClockMhz: measured(memoryClock),
      fanPercent: orNull(measured(fan), percent),
      encoderLoad: orNull(measured(encoder), percent),
      decoderLoad: orNull(measured(decoder), percent),
    },
  ];
}

export class NvidiaStream {
  private child: ChildProcess | null = null;
  private intervalMs = 0;
  private stopped = true;
  private restart: NodeJS.Timeout | null = null;
  private readonly fixed = new Map<number, Fixed>();
  private readonly latest = new Map<number, Live>();

  constructor(private readonly log: Logger) {}

  get running(): boolean {
    return this.child !== null;
  }

  gpus(): GpuSnapshot[] {
    return [...this.latest.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([index, live]) => {
        const fixed = this.fixed.get(index);
        return fixed === undefined
          ? []
          : [{ id: `nvidia-${String(index)}`, vendor: 'nvidia' as const, ...fixed, ...live }];
      });
  }

  setInterval(intervalMs: number): void {
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
      this.restart = null;
    }
    this.child?.kill();
    this.child = null;
    this.latest.clear();
  }

  private launch(): void {
    if (this.fixed.size > 0) {
      this.loop();
      return;
    }
    execFile(
      'nvidia-smi',
      [`--query-gpu=${STATIC_QUERY}`, '--format=csv,noheader,nounits'],
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error !== null) {
          this.stopped = true;
          this.log.warn('node.nvidia_unavailable', { reason: error.message });
          return;
        }
        for (const line of stdout.split('\n')) {
          const parsed = parseFixedLine(line);
          if (parsed !== null) {
            this.fixed.set(parsed[0], parsed[1]);
          }
        }
        if (!this.stopped && this.child === null) {
          this.loop();
        }
      },
    );
  }

  private loop(): void {
    const args = [
      `--query-gpu=${LIVE_QUERY}`,
      '--format=csv,noheader,nounits',
      '-lms',
      String(this.intervalMs),
    ];
    const child = spawn('nvidia-smi', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      const parsed = parseLiveLine(line);
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
        this.loop();
      }
    }, RESTART_MS);
  }
}
