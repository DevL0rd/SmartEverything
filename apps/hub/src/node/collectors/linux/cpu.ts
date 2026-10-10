import { existsSync, readFileSync } from 'node:fs';
import type { KernelFiles } from './kernel-file';

const CPU_ROOT = '/sys/devices/system/cpu';
const KHZ_PER_GHZ = 1_000_000;

export interface CpuReading {
  readonly load: number;
  readonly cores: readonly number[];
  readonly performanceLoad: number | null;
  readonly efficiencyLoad: number | null;
  readonly frequencyGhz: number | null;
  readonly maxFrequencyGhz: number | null;
  readonly loadAverage: readonly [number, number, number];
}

interface Ticks {
  readonly busy: number;
  readonly total: number;
}

interface Topology {
  readonly performance: readonly number[];
  readonly efficiency: readonly number[];
}

export function parseCpuList(text: string): number[] {
  return text
    .trim()
    .split(',')
    .filter((part) => part !== '')
    .flatMap((part) => {
      const [from, to] = part.split('-').map(Number);
      if (from === undefined || Number.isNaN(from)) {
        return [];
      }
      const last = to === undefined || Number.isNaN(to) ? from : to;
      return Array.from({ length: last - from + 1 }, (_, index) => from + index);
    });
}

function ticksOf(line: string): Ticks {
  const fields = line.trim().split(/\s+/).slice(1, 9).map(Number);
  const total = fields.reduce((sum, value) => sum + value, 0);
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  return { busy: total - idle, total };
}

function usage(now: Ticks, before: Ticks | undefined): number {
  if (before === undefined || now.total <= before.total) {
    return 0;
  }
  const share = (now.busy - before.busy) / (now.total - before.total);
  return Math.min(100, Math.max(0, share * 100));
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readTopology(): Topology | null {
  const core = '/sys/devices/cpu_core/cpus';
  const atom = '/sys/devices/cpu_atom/cpus';
  if (!existsSync(core) || !existsSync(atom)) {
    return null;
  }
  return {
    performance: parseCpuList(readFileSync(core, 'utf8')),
    efficiency: parseCpuList(readFileSync(atom, 'utf8')),
  };
}

function readMaxFrequency(threads: number): number | null {
  const values = Array.from({ length: threads }, (_, cpu) => {
    const path = `${CPU_ROOT}/cpu${String(cpu)}/cpufreq/cpuinfo_max_freq`;
    return existsSync(path) ? Number(readFileSync(path, 'utf8')) : 0;
  });
  const highest = Math.max(0, ...values);
  return highest > 0 ? highest / KHZ_PER_GHZ : null;
}

export class CpuCollector {
  private before = new Map<string, Ticks>();
  private readonly topology = readTopology();
  private readonly maxFrequencyGhz: number | null;
  private readonly frequencyPaths: readonly string[];

  constructor(
    private readonly files: KernelFiles,
    private readonly threads: number,
  ) {
    this.maxFrequencyGhz = readMaxFrequency(threads);
    this.frequencyPaths = Array.from(
      { length: threads },
      (_, cpu) => `${CPU_ROOT}/cpu${String(cpu)}/cpufreq/scaling_cur_freq`,
    ).filter((path) => existsSync(path));
  }

  get hybrid(): boolean {
    return this.topology !== null;
  }

  read(): CpuReading {
    const lines = this.files
      .read('/proc/stat')
      .split('\n')
      .filter((line) => line.startsWith('cpu'));
    const now = new Map(lines.map((line) => [line.split(/\s/, 1)[0] ?? '', ticksOf(line)]));
    const loads = new Map(
      [...now].map(([name, ticks]) => [name, usage(ticks, this.before.get(name))]),
    );
    this.before = now;
    const cores = Array.from(
      { length: this.threads },
      (_, cpu) => loads.get(`cpu${String(cpu)}`) ?? 0,
    );
    const group = (members: readonly number[]): number | null =>
      average(members.map((cpu) => cores[cpu] ?? 0));
    return {
      load: loads.get('cpu') ?? 0,
      cores,
      performanceLoad: this.topology === null ? null : group(this.topology.performance),
      efficiencyLoad: this.topology === null ? null : group(this.topology.efficiency),
      frequencyGhz: this.frequency(),
      maxFrequencyGhz: this.maxFrequencyGhz,
      loadAverage: this.loadAverage(),
    };
  }

  private frequency(): number | null {
    const values = this.frequencyPaths.map((path) => Number(this.files.read(path)));
    const mean = average(values.filter((value) => value > 0));
    return mean === null ? null : mean / KHZ_PER_GHZ;
  }

  private loadAverage(): readonly [number, number, number] {
    const [one = 0, five = 0, fifteen = 0] = this.files
      .read('/proc/loadavg')
      .split(' ')
      .slice(0, 3)
      .map(Number);
    return [one, five, fifteen];
  }
}
